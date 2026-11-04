//! High-density N-Gram metric aggregator and high-throughput streaming CSV engine.
//!
//! Architectural Guarantees:
//! - hashbrown::HashMap for high-density metric accumulation.
//! - Direct &[u8] lookup with zero dynamic string allocations.
//! - Deterministic reporting gap tracking between summary and query rows.
//! - memchr-accelerated field parsing and pointer-cached consecutive row aggregation.

use core::fmt::Write;
use hashbrown::HashMap;

use crate::schema::detector::{
    contains_ignore_case, detect_platform_schema, parse_localized_number, resolve_schema_mapping,
    starts_with_ignore_case, PlatformSchema, SchemaMapping,
};
use crate::tokenizer::ngram::tokenize_ngrams;

pub use crate::engine::radix_trie::MetricAggregate;

pub struct NGramAggregator {
    pub unigrams: HashMap<Box<[u8]>, MetricAggregate>,
    pub bigrams: HashMap<Box<[u8]>, MetricAggregate>,
    pub trigrams: HashMap<Box<[u8]>, MetricAggregate>,
    pub summary_clicks: f64,
    pub summary_cost: f64,
    pub summary_conversions: f64,
    pub aggregated_clicks: f64,
    pub aggregated_cost: f64,
    pub aggregated_conversions: f64,
}

impl Default for NGramAggregator {
    fn default() -> Self {
        Self::new()
    }
}

impl NGramAggregator {
    pub fn new() -> Self {
        Self {
            unigrams: HashMap::with_capacity(4096),
            bigrams: HashMap::with_capacity(4096),
            trigrams: HashMap::with_capacity(4096),
            summary_clicks: 0.0,
            summary_cost: 0.0,
            summary_conversions: 0.0,
            aggregated_clicks: 0.0,
            aggregated_cost: 0.0,
            aggregated_conversions: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.unigrams.clear();
        self.bigrams.clear();
        self.trigrams.clear();
        self.summary_clicks = 0.0;
        self.summary_cost = 0.0;
        self.summary_conversions = 0.0;
        self.aggregated_clicks = 0.0;
        self.aggregated_cost = 0.0;
        self.aggregated_conversions = 0.0;
    }

    #[inline(always)]
    pub fn accumulate_ngram(
        &mut self,
        n: usize,
        token: &[u8],
        clicks: u64,
        cost: f64,
        conversions: f64,
    ) -> *mut MetricAggregate {
        let map = match n {
            1 => &mut self.unigrams,
            2 => &mut self.bigrams,
            3 => &mut self.trigrams,
            _ => return core::ptr::null_mut(),
        };

        if let Some(agg) = map.get_mut(token) {
            agg.accumulate(clicks, cost, conversions);
            agg as *mut MetricAggregate
        } else {
            let entry = map.entry(Box::from(token)).or_insert(MetricAggregate {
                clicks,
                cost,
                conversions,
            });
            entry as *mut MetricAggregate
        }
    }

    #[inline(always)]
    pub fn record_summary(&mut self, clicks: f64, cost: f64, conversions: f64) {
        self.summary_clicks += clicks;
        self.summary_cost += cost;
        self.summary_conversions += conversions;
    }

    #[inline(always)]
    pub fn record_query_row(&mut self, clicks: f64, cost: f64, conversions: f64) {
        self.aggregated_clicks += clicks;
        self.aggregated_cost += cost;
        self.aggregated_conversions += conversions;
    }
}

#[derive(Clone, Debug)]
pub struct QueryAuctionRecord {
    pub campaign: Box<[u8]>,
    pub adgroup: Box<[u8]>,
    pub clicks: u64,
    pub cost: f64,
    pub conversions: f64,
    pub is_pmax: bool,
}

pub struct SieveEngine {
    pub schema_mapping: SchemaMapping,
    pub delimiter: u8,
    pub aggregator: NGramAggregator,
    pub header_parsed: bool,
    pub query_auction_map: HashMap<Box<[u8]>, Vec<QueryAuctionRecord>>,
    // Consecutive repeated query acceleration cache
    last_query_buf: [u8; 128],
    last_query_len: usize,
    cached_entry_ptrs: [*mut MetricAggregate; 32],
    cached_entries_count: usize,
}

impl Default for SieveEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl SieveEngine {
    pub fn new() -> Self {
        Self {
            schema_mapping: SchemaMapping::default(),
            delimiter: b',',
            aggregator: NGramAggregator::new(),
            header_parsed: false,
            query_auction_map: HashMap::new(),
            last_query_buf: [0u8; 128],
            last_query_len: 0,
            cached_entry_ptrs: [core::ptr::null_mut(); 32],
            cached_entries_count: 0,
        }
    }

    pub fn reset(&mut self) {
        self.schema_mapping = SchemaMapping::default();
        self.delimiter = b',';
        self.aggregator.reset();
        self.header_parsed = false;
        self.query_auction_map.clear();
        self.last_query_len = 0;
        self.cached_entries_count = 0;
    }

    /// Fast streaming chunk ingestion.
    pub fn ingest_chunk(&mut self, chunk: &[u8], _is_final: bool) -> i32 {
        if chunk.is_empty() {
            return 0;
        }

        // Check for UTF-16LE BOM: [0xFF, 0xFE]
        if chunk.len() >= 2 && chunk[0] == 0xFF && chunk[1] == 0xFE {
            let utf16_slice = &chunk[2..];
            let mut decoded_ascii = Vec::with_capacity(utf16_slice.len() / 2);
            let mut i = 0;
            while i + 1 < utf16_slice.len() {
                let low = utf16_slice[i];
                let high = utf16_slice[i + 1];
                if high == 0 {
                    decoded_ascii.push(low);
                } else {
                    decoded_ascii.push(b'?');
                }
                i += 2;
            }
            self.ingest_slice(&decoded_ascii)
        } else {
            self.ingest_slice(chunk)
        }
    }

    fn ingest_slice(&mut self, mut chunk: &[u8]) -> i32 {
        // Parse header on initial chunk
        if !self.header_parsed {
            let schema = detect_platform_schema(chunk);
            self.schema_mapping.schema = schema;

            let line_end = memchr::memchr(b'\n', chunk).unwrap_or(chunk.len());
            let header_line = &chunk[..line_end];

            self.delimiter = if header_line.contains(&b'\t') {
                b'\t'
            } else {
                b','
            };

            let mut header_fields: [&[u8]; 32] = [&[]; 32];
            let field_count = split_fields(header_line, self.delimiter, &mut header_fields);

            self.schema_mapping = resolve_schema_mapping(&header_fields[..field_count]);
            self.schema_mapping.schema = if schema != PlatformSchema::Unknown {
                schema
            } else {
                PlatformSchema::GoogleAds
            };
            self.header_parsed = true;

            chunk = if line_end < chunk.len() {
                &chunk[line_end + 1..]
            } else {
                &[]
            };
        }

        let mapping = self.schema_mapping;
        let delim = self.delimiter;
        let mut fields: [&[u8]; 32] = [&[]; 32];

        // High-throughput record scanning loop
        while !chunk.is_empty() {
            let line_end = match memchr::memchr(b'\n', chunk) {
                Some(pos) => pos,
                None => chunk.len(),
            };

            let mut line = &chunk[..line_end];
            if line.ends_with(b"\r") {
                line = &line[..line.len() - 1];
            }

            if !line.is_empty() {
                let count = split_fields(line, delim, &mut fields);
                if count > 0 {
                    let query_field = if mapping.query_col < count {
                        trim_quotes(fields[mapping.query_col])
                    } else {
                        &[]
                    };

                    let clicks = if mapping.clicks_col < count {
                        parse_localized_number(fields[mapping.clicks_col])
                    } else {
                        0.0
                    };

                    let cost = if mapping.cost_col < count {
                        parse_localized_number(fields[mapping.cost_col])
                    } else {
                        0.0
                    };

                    let conversions = if mapping.conversions_col < count {
                        parse_localized_number(fields[mapping.conversions_col])
                    } else {
                        0.0
                    };

                    let is_summary = starts_with_ignore_case(query_field, b"total")
                        || starts_with_ignore_case(query_field, b"summary");

                    if is_summary {
                        self.aggregator.record_summary(clicks, cost, conversions);
                    } else {
                        self.aggregator.record_query_row(clicks, cost, conversions);
                        let clicks_u64 = clicks as u64;

                        if mapping.has_campaign {
                            let campaign_field = if mapping.campaign_col < count {
                                trim_quotes(fields[mapping.campaign_col])
                            } else {
                                &[]
                            };

                            let adgroup_field = if mapping.has_adgroup && mapping.adgroup_col < count {
                                trim_quotes(fields[mapping.adgroup_col])
                            } else {
                                &[]
                            };

                            let is_pmax = contains_ignore_case(campaign_field, b"pmax")
                                || contains_ignore_case(campaign_field, b"performance max");

                            self.query_auction_map
                                .entry(Box::from(query_field))
                                .or_default()
                                .push(QueryAuctionRecord {
                                    campaign: Box::from(campaign_field),
                                    adgroup: Box::from(adgroup_field),
                                    clicks: clicks_u64,
                                    cost,
                                    conversions,
                                    is_pmax,
                                });
                        }

                        // Check if current query matches the cached consecutive query
                        let is_same_query = self.last_query_len > 0
                            && self.last_query_len == query_field.len()
                            && &self.last_query_buf[..self.last_query_len] == query_field
                            && self.cached_entries_count > 0;

                        if is_same_query {
                            // Direct metric accumulation via cached pointers (O(1) zero hash overhead)
                            for &ptr in &self.cached_entry_ptrs[..self.cached_entries_count] {
                                unsafe {
                                    (*ptr).accumulate(clicks_u64, cost, conversions);
                                }
                            }
                        } else {
                            // Cache miss: update query buffer and re-resolve entries
                            let copy_len = query_field.len().min(self.last_query_buf.len());
                            self.last_query_buf[..copy_len].copy_from_slice(&query_field[..copy_len]);
                            self.last_query_len = copy_len;
                            self.cached_entries_count = 0;

                            let agg = &mut self.aggregator;
                            let entry_ptrs = &mut self.cached_entry_ptrs;
                            let count_ref = &mut self.cached_entries_count;

                            tokenize_ngrams(query_field, |n, token| {
                                let ptr = agg.accumulate_ngram(n, token, clicks_u64, cost, conversions);
                                if !ptr.is_null() && *count_ref < entry_ptrs.len() {
                                    entry_ptrs[*count_ref] = ptr;
                                    *count_ref += 1;
                                }
                            });
                        }
                    }
                }
            }

            chunk = if line_end < chunk.len() {
                &chunk[line_end + 1..]
            } else {
                &[]
            };
        }

        0
    }

    /// Exports n-gram metrics formatted as a JSON array into `output`.
    pub fn export_ngram_metrics(&self, n: usize, output: &mut [u8]) -> usize {
        let map = match n {
            1 => &self.aggregator.unigrams,
            2 => &self.aggregator.bigrams,
            3 => &self.aggregator.trigrams,
            _ => return 0,
        };

        struct Cursor<'a> {
            buf: &'a mut [u8],
            pos: usize,
        }

        impl<'a> Write for Cursor<'a> {
            fn write_str(&mut self, s: &str) -> core::fmt::Result {
                let bytes = s.as_bytes();
                let remaining = self.buf.len().saturating_sub(self.pos);
                let to_copy = bytes.len().min(remaining);
                self.buf[self.pos..self.pos + to_copy].copy_from_slice(&bytes[..to_copy]);
                self.pos += to_copy;
                Ok(())
            }
        }

        let mut cursor = Cursor {
            buf: output,
            pos: 0,
        };

        let _ = cursor.write_str("[");
        let mut first = true;

        for (token, metrics) in map.iter() {
            if !first {
                let _ = cursor.write_str(",");
            }
            first = false;

            let token_str = core::str::from_utf8(token).unwrap_or("");
            let _ = write!(
                cursor,
                r#"{{"token":"{}","clicks":{},"cost":{:.2},"conversions":{:.0}}}"#,
                token_str, metrics.clicks, metrics.cost, metrics.conversions
            );
        }

        let _ = cursor.write_str("]");
        cursor.pos
    }

    /// Writes reporting gap metrics into a 6-element f64 buffer.
    pub fn write_reporting_gap(&self, out: &mut [f64; 6]) {
        let summary_clicks = self.aggregator.summary_clicks;
        let aggregated_clicks = self.aggregator.aggregated_clicks;
        let gap_clicks = summary_clicks - aggregated_clicks;

        let summary_cost = self.aggregator.summary_cost;
        let aggregated_cost = self.aggregator.aggregated_cost;
        let gap_cost = summary_cost - aggregated_cost;

        out[0] = summary_clicks;
        out[1] = aggregated_clicks;
        out[2] = gap_clicks;
        out[3] = summary_cost;
        out[4] = aggregated_cost;
        out[5] = gap_cost;
    }

    /// Isolates identical queries mapped across competing AdGroup and Campaign IDs.
    pub fn detect_auction_collisions(&self, output: &mut [u8]) -> usize {
        struct Cursor<'a> {
            buf: &'a mut [u8],
            pos: usize,
        }

        impl<'a> Write for Cursor<'a> {
            fn write_str(&mut self, s: &str) -> core::fmt::Result {
                let bytes = s.as_bytes();
                let remaining = self.buf.len().saturating_sub(self.pos);
                let to_copy = bytes.len().min(remaining);
                self.buf[self.pos..self.pos + to_copy].copy_from_slice(&bytes[..to_copy]);
                self.pos += to_copy;
                Ok(())
            }
        }

        let mut cursor = Cursor {
            buf: output,
            pos: 0,
        };
        let _ = cursor.write_str("[");
        let mut first = true;

        for (query, records) in &self.query_auction_map {
            let mut unique_campaigns: Vec<&[u8]> = Vec::with_capacity(records.len());
            let mut total_clicks = 0u64;
            let mut total_cost = 0.0f64;

            for r in records {
                total_clicks += r.clicks;
                total_cost += r.cost;
                if !unique_campaigns.contains(&r.campaign.as_ref()) {
                    unique_campaigns.push(&r.campaign);
                }
            }

            if unique_campaigns.len() > 1 {
                if !first {
                    let _ = cursor.write_str(",");
                }
                first = false;

                let query_str = core::str::from_utf8(query).unwrap_or("");
                let _ = write!(
                    cursor,
                    r#"{{"query":"{}","competing_campaigns_count":{},"campaigns":["#,
                    query_str,
                    unique_campaigns.len()
                );

                for (idx, &c) in unique_campaigns.iter().enumerate() {
                    if idx > 0 {
                        let _ = cursor.write_str(",");
                    }
                    let c_str = core::str::from_utf8(c).unwrap_or("");
                    let _ = write!(cursor, r#""{}""#, c_str);
                }

                let _ = write!(
                    cursor,
                    r#"],"total_clicks":{},"total_cost":{:.2}}}"#,
                    total_clicks, total_cost
                );
            }
        }

        let _ = cursor.write_str("]");
        cursor.pos
    }

    /// Isolates queries with higher CPC and lower conversions under PMax compared to Search.
    pub fn detect_pmax_cannibalization(&self, output: &mut [u8]) -> usize {
        struct Cursor<'a> {
            buf: &'a mut [u8],
            pos: usize,
        }

        impl<'a> Write for Cursor<'a> {
            fn write_str(&mut self, s: &str) -> core::fmt::Result {
                let bytes = s.as_bytes();
                let remaining = self.buf.len().saturating_sub(self.pos);
                let to_copy = bytes.len().min(remaining);
                self.buf[self.pos..self.pos + to_copy].copy_from_slice(&bytes[..to_copy]);
                self.pos += to_copy;
                Ok(())
            }
        }

        let mut cursor = Cursor {
            buf: output,
            pos: 0,
        };
        let _ = cursor.write_str("[");
        let mut first = true;

        for (query, records) in &self.query_auction_map {
            let mut search_clicks = 0u64;
            let mut search_cost = 0.0f64;
            let mut search_conv = 0.0f64;

            let mut pmax_clicks = 0u64;
            let mut pmax_cost = 0.0f64;
            let mut pmax_conv = 0.0f64;

            for r in records {
                if r.is_pmax {
                    pmax_clicks += r.clicks;
                    pmax_cost += r.cost;
                    pmax_conv += r.conversions;
                } else {
                    search_clicks += r.clicks;
                    search_cost += r.cost;
                    search_conv += r.conversions;
                }
            }

            if search_clicks > 0 && pmax_clicks > 0 {
                let search_cpc = search_cost / search_clicks as f64;
                let pmax_cpc = pmax_cost / pmax_clicks as f64;

                if pmax_cpc > search_cpc && pmax_conv < search_conv {
                    if !first {
                        let _ = cursor.write_str(",");
                    }
                    first = false;

                    let query_str = core::str::from_utf8(query).unwrap_or("");
                    let cpc_inflation = if search_cpc > 0.0 {
                        pmax_cpc / search_cpc
                    } else {
                        0.0
                    };

                    let _ = write!(
                        cursor,
                        r#"{{"query":"{}","search_cpc":{:.2},"pmax_cpc":{:.2},"search_conversions":{:.0},"pmax_conversions":{:.0},"cpc_inflation_ratio":{:.2}}}"#,
                        query_str, search_cpc, pmax_cpc, search_conv, pmax_conv, cpc_inflation
                    );
                }
            }
        }

        let _ = cursor.write_str("]");
        cursor.pos
    }
}

/// Splits a CSV/TSV row into field byte slices using memchr.
#[inline(always)]
fn split_fields<'a>(mut line: &'a [u8], delim: u8, fields: &mut [&'a [u8]; 32]) -> usize {
    let mut count = 0;
    while !line.is_empty() && count < fields.len() {
        if line[0] == b'"' {
            line = &line[1..];
            let end = match memchr::memchr(b'"', line) {
                Some(p) => p,
                None => line.len(),
            };
            fields[count] = &line[..end];
            count += 1;
            line = if end < line.len() { &line[end + 1..] } else { &[] };
            if line.starts_with(&[delim]) {
                line = &line[1..];
            }
        } else {
            let end = match memchr::memchr(delim, line) {
                Some(p) => p,
                None => line.len(),
            };
            fields[count] = &line[..end];
            count += 1;
            line = if end < line.len() { &line[end + 1..] } else { &[] };
        }
    }
    count
}

#[inline(always)]
fn trim_quotes(field: &[u8]) -> &[u8] {
    let mut slice = field;
    while slice.starts_with(b" ") || slice.starts_with(b"\t") {
        slice = &slice[1..];
    }
    while slice.ends_with(b" ") || slice.ends_with(b"\t") {
        slice = &slice[..slice.len() - 1];
    }
    if slice.len() >= 2 && slice[0] == b'"' && slice[slice.len() - 1] == b'"' {
        slice = &slice[1..slice.len() - 1];
    }
    slice
}
