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

#[repr(u8)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum QueryMatchType {
    Broad = 0,
    Phrase = 1,
    Exact = 2,
}

#[derive(Clone, Debug)]
pub struct ExactBenchmark {
    pub query: Box<[u8]>,
    pub clicks: u64,
    pub cost: f64,
    pub conversions: f64,
}

#[derive(Clone, Debug)]
pub struct QueryAuctionRecord {
    pub campaign: Box<[u8]>,
    pub adgroup: Box<[u8]>,
    pub clicks: u64,
    pub cost: f64,
    pub conversions: f64,
    pub is_pmax: bool,
    pub match_type: QueryMatchType,
}

pub struct SieveEngine {
    pub schema_mapping: SchemaMapping,
    pub delimiter: u8,
    pub aggregator: NGramAggregator,
    pub header_parsed: bool,
    pub query_auction_map: HashMap<Box<[u8]>, Vec<QueryAuctionRecord>>,
    pub exact_benchmarks: HashMap<u64, ExactBenchmark>,
    pub remainder_buf: Vec<u8>,
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
            exact_benchmarks: HashMap::new(),
            remainder_buf: Vec::with_capacity(1024),
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
        self.exact_benchmarks.clear();
        self.remainder_buf.clear();
        self.last_query_len = 0;
        self.cached_entries_count = 0;
    }

    /// Fast streaming chunk ingestion with chunk boundary line reconstruction.
    pub fn ingest_chunk(&mut self, chunk: &[u8], is_final: bool) -> i32 {
        if chunk.is_empty() {
            if is_final && !self.remainder_buf.is_empty() {
                let remainder = core::mem::take(&mut self.remainder_buf);
                return self.ingest_slice(&remainder);
            }
            return 0;
        }

        // Check for UTF-16LE BOM: [0xFF, 0xFE] on initial chunk
        if !self.header_parsed && chunk.len() >= 2 && chunk[0] == 0xFF && chunk[1] == 0xFE {
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
            return self.process_streaming_bytes(&decoded_ascii, is_final);
        }

        self.process_streaming_bytes(chunk, is_final)
    }

    fn process_streaming_bytes(&mut self, mut chunk: &[u8], is_final: bool) -> i32 {
        // Strip UTF-8 BOM if this is the start of the stream
        if !self.header_parsed
            && self.remainder_buf.is_empty()
            && chunk.len() >= 3
            && chunk[0] == 0xEF
            && chunk[1] == 0xBB
            && chunk[2] == 0xBF
        {
            chunk = &chunk[3..];
        }

        // If we have remainder bytes from the previous chunk, glue them with the first line of current chunk
        let mut rest_of_chunk = chunk;
        if !self.remainder_buf.is_empty() {
            if let Some(pos) = memchr::memchr(b'\n', chunk) {
                // Complete line formed!
                self.remainder_buf.extend_from_slice(&chunk[..=pos]);
                let complete_line = core::mem::take(&mut self.remainder_buf);
                self.ingest_slice(&complete_line);
                rest_of_chunk = &chunk[pos + 1..];
            } else {
                // Whole chunk is still part of the incomplete line!
                self.remainder_buf.extend_from_slice(chunk);
                if is_final {
                    let complete_line = core::mem::take(&mut self.remainder_buf);
                    self.ingest_slice(&complete_line);
                }
                return 0;
            }
        }

        if rest_of_chunk.is_empty() {
            return 0;
        }

        if !is_final {
            // Find the last newline in rest_of_chunk
            if let Some(last_nl) = memchr::memrchr(b'\n', rest_of_chunk) {
                let complete_part = &rest_of_chunk[..=last_nl];
                let trailing_incomplete = &rest_of_chunk[last_nl + 1..];
                self.remainder_buf.extend_from_slice(trailing_incomplete);
                self.ingest_slice(complete_part)
            } else {
                // No newline in rest_of_chunk, buffer all of it
                self.remainder_buf.extend_from_slice(rest_of_chunk);
                0
            }
        } else {
            // is_final: ingest all remaining bytes
            self.ingest_slice(rest_of_chunk)
        }
    }

    fn ingest_slice(&mut self, mut chunk: &[u8]) -> i32 {
        // Strip UTF-8 BOM if present
        if chunk.len() >= 3 && chunk[0] == 0xEF && chunk[1] == 0xBB && chunk[2] == 0xBF {
            chunk = &chunk[3..];
        }

        // Parse header on initial chunk, scanning past multi-line report headers
        if !self.header_parsed {
            let schema = detect_platform_schema(chunk);
            self.schema_mapping.schema = schema;

            let mut remaining = chunk;
            while !self.header_parsed && !remaining.is_empty() {
                let line_end = memchr::memchr(b'\n', remaining).unwrap_or(remaining.len());
                let mut line = &remaining[..line_end];
                if line.ends_with(b"\r") {
                    line = &line[..line.len() - 1];
                }

                let next_chunk = if line_end < remaining.len() {
                    &remaining[line_end + 1..]
                } else {
                    &[]
                };

                // Check for delimiter preference (tab or comma)
                let delim = if line.contains(&b'\t') { b'\t' } else { b',' };

                if is_column_header_line(line, delim) {
                    self.delimiter = delim;
                    let mut header_fields: [&[u8]; 32] = [&[]; 32];
                    let field_count = split_fields(line, delim, &mut header_fields);
                    self.schema_mapping = resolve_schema_mapping(&header_fields[..field_count]);
                    self.schema_mapping.schema = if schema != PlatformSchema::Unknown {
                        schema
                    } else {
                        PlatformSchema::GoogleAds
                    };
                    self.header_parsed = true;
                    chunk = next_chunk;
                    break;
                }

                remaining = next_chunk;
            }

            // Fallback if no explicit column header matched but chunk is present
            if !self.header_parsed {
                let line_end = memchr::memchr(b'\n', chunk).unwrap_or(chunk.len());
                let header_line = &chunk[..line_end];
                self.delimiter = if header_line.contains(&b'\t') { b'\t' } else { b',' };
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

                    if query_field.is_empty() {
                        chunk = if line_end < chunk.len() {
                            &chunk[line_end + 1..]
                        } else {
                            &[]
                        };
                        continue;
                    }

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

                        let match_type = if mapping.has_match_type && mapping.match_type_col < count {
                            let m = trim_quotes(fields[mapping.match_type_col]);
                            if contains_ignore_case(m, b"exact") {
                                QueryMatchType::Exact
                            } else if contains_ignore_case(m, b"phrase") {
                                QueryMatchType::Phrase
                            } else if contains_ignore_case(m, b"broad") {
                                QueryMatchType::Broad
                            } else if query_field.starts_with(b"[") && query_field.ends_with(b"]") {
                                QueryMatchType::Exact
                            } else if query_field.starts_with(b"\"") && query_field.ends_with(b"\"") {
                                QueryMatchType::Phrase
                            } else {
                                QueryMatchType::Broad
                            }
                        } else if query_field.starts_with(b"[") && query_field.ends_with(b"]") {
                            QueryMatchType::Exact
                        } else if query_field.starts_with(b"\"") && query_field.ends_with(b"\"") {
                            QueryMatchType::Phrase
                        } else {
                            QueryMatchType::Broad
                        };

                        let clean_query = strip_match_syntax(query_field);

                        if match_type == QueryMatchType::Exact {
                            let hash = compute_normalized_token_hash(clean_query);
                            let benchmark = self.exact_benchmarks.entry(hash).or_insert_with(|| ExactBenchmark {
                                query: Box::from(clean_query),
                                clicks: 0,
                                cost: 0.0,
                                conversions: 0.0,
                            });
                            benchmark.clicks += clicks_u64;
                            benchmark.cost += cost;
                            benchmark.conversions += conversions;
                        }

                        let campaign_field = if mapping.has_campaign && mapping.campaign_col < count {
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

                        let records = self.query_auction_map
                            .entry(Box::from(clean_query))
                            .or_default();

                        if let Some(existing) = records.iter_mut().find(|r| {
                            r.campaign.as_ref() == campaign_field && r.adgroup.as_ref() == adgroup_field && r.match_type == match_type
                        }) {
                            existing.clicks += clicks_u64;
                            existing.cost += cost;
                            existing.conversions += conversions;
                        } else {
                            records.push(QueryAuctionRecord {
                                campaign: Box::from(campaign_field),
                                adgroup: Box::from(adgroup_field),
                                clicks: clicks_u64,
                                cost,
                                conversions,
                                is_pmax,
                                match_type,
                            });
                        }

                        // Check if current query matches the cached consecutive query
                        let is_same_query = self.last_query_len > 0
                            && self.last_query_len == clean_query.len()
                            && &self.last_query_buf[..self.last_query_len] == clean_query
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
                            let copy_len = clean_query.len().min(self.last_query_buf.len());
                            self.last_query_buf[..copy_len].copy_from_slice(&clean_query[..copy_len]);
                            self.last_query_len = copy_len;
                            self.cached_entries_count = 0;

                            let agg = &mut self.aggregator;
                            let entry_ptrs = &mut self.cached_entry_ptrs;
                            let count_ref = &mut self.cached_entries_count;

                            tokenize_ngrams(clean_query, |n, token| {
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

    /// Exports all unique search queries recorded in query_auction_map as JSON.
    pub fn export_query_records(&self, output: &mut [u8]) -> usize {
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
            let mut total_clicks = 0u64;
            let mut total_cost = 0.0f64;
            let mut total_conversions = 0.0f64;
            let mut first_campaign: &[u8] = &[];
            let mut first_adgroup: &[u8] = &[];
            let mut unique_campaigns: Vec<&[u8]> = Vec::new();

            for r in records {
                total_clicks += r.clicks;
                total_cost += r.cost;
                total_conversions += r.conversions;
                if first_campaign.is_empty() && !r.campaign.is_empty() {
                    first_campaign = &r.campaign;
                }
                if first_adgroup.is_empty() && !r.adgroup.is_empty() {
                    first_adgroup = &r.adgroup;
                }
                if !unique_campaigns.contains(&r.campaign.as_ref()) {
                    unique_campaigns.push(&r.campaign);
                }
            }

            if !first {
                let _ = cursor.write_str(",");
            }
            first = false;

            let has_collision = unique_campaigns.len() > 1;

            let _ = cursor.write_str(r#"{"query":""#);
            write_escaped_json_str(&mut cursor, query);
            let _ = cursor.write_str(r#"","campaign":""#);
            write_escaped_json_str(&mut cursor, first_campaign);
            let _ = cursor.write_str(r#"","adgroup":""#);
            write_escaped_json_str(&mut cursor, first_adgroup);
            let _ = write!(
                cursor,
                r#"","clicks":{},"cost":{:.2},"conversions":{:.2},"has_collision":{}}}"#,
                total_clicks, total_cost, total_conversions, has_collision
            );
        }

        let _ = cursor.write_str("]");
        cursor.pos
    }

    /// Exports search term records in high-performance Arrow-compatible columnar layout.
    /// Returns number of bytes written to `output`.
    pub fn export_columnar_records(&self, output: &mut [u8]) -> usize {
        let n = self.query_auction_map.len();
        if n == 0 {
            return 0;
        }

        // Pass 1: compute string sizes
        let mut query_bytes_len = 0usize;
        let mut campaign_bytes_len = 0usize;
        let mut adgroup_bytes_len = 0usize;

        for (query, records) in &self.query_auction_map {
            query_bytes_len += query.len();
            let mut first_campaign: &[u8] = &[];
            let mut first_adgroup: &[u8] = &[];
            for r in records {
                if first_campaign.is_empty() && !r.campaign.is_empty() {
                    first_campaign = &r.campaign;
                }
                if first_adgroup.is_empty() && !r.adgroup.is_empty() {
                    first_adgroup = &r.adgroup;
                }
            }
            campaign_bytes_len += first_campaign.len();
            adgroup_bytes_len += first_adgroup.len();
        }

        fn align8(pos: usize) -> usize {
            (pos + 7) & !7
        }

        let header_len = 80usize; // 20 * 4 bytes
        let query_offsets_pos = align8(header_len);
        let query_offsets_len = (n + 1) * 4;

        let query_data_pos = align8(query_offsets_pos + query_offsets_len);
        let query_data_len = query_bytes_len;

        let campaign_offsets_pos = align8(query_data_pos + query_data_len);
        let campaign_offsets_len = (n + 1) * 4;

        let campaign_data_pos = align8(campaign_offsets_pos + campaign_offsets_len);
        let campaign_data_len = campaign_bytes_len;

        let adgroup_offsets_pos = align8(campaign_data_pos + campaign_data_len);
        let adgroup_offsets_len = (n + 1) * 4;

        let adgroup_data_pos = align8(adgroup_offsets_pos + adgroup_offsets_len);
        let adgroup_data_len = adgroup_bytes_len;

        let clicks_pos = align8(adgroup_data_pos + adgroup_data_len);
        let clicks_len = n * 8;

        let cost_pos = align8(clicks_pos + clicks_len);
        let cost_len = n * 8;

        let conversions_pos = align8(cost_pos + cost_len);
        let conversions_len = n * 8;

        let has_collision_pos = align8(conversions_pos + conversions_len);
        let has_collision_len = n;

        let total_size = align8(has_collision_pos + has_collision_len);

        if output.len() < total_size {
            return 0;
        }

        // Write header
        let header_u32 = [
            0x53494556u32, // 'SIEV'
            1u32,          // version
            n as u32,
            query_offsets_pos as u32,
            query_offsets_len as u32,
            query_data_pos as u32,
            query_data_len as u32,
            campaign_offsets_pos as u32,
            campaign_offsets_len as u32,
            campaign_data_pos as u32,
            campaign_data_len as u32,
            adgroup_offsets_pos as u32,
            adgroup_offsets_len as u32,
            adgroup_data_pos as u32,
            adgroup_data_len as u32,
            clicks_pos as u32,
            cost_pos as u32,
            conversions_pos as u32,
            has_collision_pos as u32,
            total_size as u32,
        ];

        for (i, &val) in header_u32.iter().enumerate() {
            output[i * 4..(i + 1) * 4].copy_from_slice(&val.to_le_bytes());
        }

        // Pass 2: populate buffers
        let mut cur_query_offset = 0i32;
        let mut cur_campaign_offset = 0i32;
        let mut cur_adgroup_offset = 0i32;

        let mut q_data_cursor = query_data_pos;
        let mut c_data_cursor = campaign_data_pos;
        let mut a_data_cursor = adgroup_data_pos;

        for (row_idx, (query, records)) in self.query_auction_map.iter().enumerate() {
            // Write offsets
            output[query_offsets_pos + row_idx * 4..query_offsets_pos + (row_idx + 1) * 4]
                .copy_from_slice(&cur_query_offset.to_le_bytes());
            output[campaign_offsets_pos + row_idx * 4..campaign_offsets_pos + (row_idx + 1) * 4]
                .copy_from_slice(&cur_campaign_offset.to_le_bytes());
            output[adgroup_offsets_pos + row_idx * 4..adgroup_offsets_pos + (row_idx + 1) * 4]
                .copy_from_slice(&cur_adgroup_offset.to_le_bytes());

            // Write query string
            output[q_data_cursor..q_data_cursor + query.len()].copy_from_slice(query);
            q_data_cursor += query.len();
            cur_query_offset += query.len() as i32;

            // Compute aggregates
            let mut total_clicks = 0u64;
            let mut total_cost = 0.0f64;
            let mut total_conversions = 0.0f64;
            let mut first_campaign: &[u8] = &[];
            let mut first_adgroup: &[u8] = &[];
            let mut unique_campaigns: Vec<&[u8]> = Vec::new();

            for r in records {
                total_clicks += r.clicks;
                total_cost += r.cost;
                total_conversions += r.conversions;
                if first_campaign.is_empty() && !r.campaign.is_empty() {
                    first_campaign = &r.campaign;
                }
                if first_adgroup.is_empty() && !r.adgroup.is_empty() {
                    first_adgroup = &r.adgroup;
                }
                if !unique_campaigns.contains(&r.campaign.as_ref()) {
                    unique_campaigns.push(&r.campaign);
                }
            }

            // Write campaign string
            output[c_data_cursor..c_data_cursor + first_campaign.len()].copy_from_slice(first_campaign);
            c_data_cursor += first_campaign.len();
            cur_campaign_offset += first_campaign.len() as i32;

            // Write adgroup string
            output[a_data_cursor..a_data_cursor + first_adgroup.len()].copy_from_slice(first_adgroup);
            a_data_cursor += first_adgroup.len();
            cur_adgroup_offset += first_adgroup.len() as i32;

            // Write metrics
            let clicks_f64 = total_clicks as f64;
            output[clicks_pos + row_idx * 8..clicks_pos + (row_idx + 1) * 8]
                .copy_from_slice(&clicks_f64.to_le_bytes());
            output[cost_pos + row_idx * 8..cost_pos + (row_idx + 1) * 8]
                .copy_from_slice(&total_cost.to_le_bytes());
            output[conversions_pos + row_idx * 8..conversions_pos + (row_idx + 1) * 8]
                .copy_from_slice(&total_conversions.to_le_bytes());

            let has_collision = if unique_campaigns.len() > 1 { 1u8 } else { 0u8 };
            output[has_collision_pos + row_idx] = has_collision;
        }

        // Final offsets
        output[query_offsets_pos + n * 4..query_offsets_pos + (n + 1) * 4]
            .copy_from_slice(&cur_query_offset.to_le_bytes());
        output[campaign_offsets_pos + n * 4..campaign_offsets_pos + (n + 1) * 4]
            .copy_from_slice(&cur_campaign_offset.to_le_bytes());
        output[adgroup_offsets_pos + n * 4..adgroup_offsets_pos + (n + 1) * 4]
            .copy_from_slice(&cur_adgroup_offset.to_le_bytes());

        total_size
    }

    /// Explicitly registers or overrides an exact match keyword benchmark CPC.
    pub fn add_exact_benchmark(&mut self, query: &[u8], benchmark_cpc: f64) {
        let clean = strip_match_syntax(query);
        let hash = compute_normalized_token_hash(clean);
        self.exact_benchmarks.insert(
            hash,
            ExactBenchmark {
                query: Box::from(clean),
                clicks: 1,
                cost: benchmark_cpc,
                conversions: 0.0,
            },
        );
    }

    /// Identifies shared root tokens across long-tail queries (queries with <= 2 clicks)
    /// that collectively cause significant waste.
    /// Executes entirely in WASM, streaming JSON directly to the output buffer without creating
    /// intermediate dynamic string arrays.
    pub fn aggregate_fragmented_long_tail(&self, target_cpa: f64, output: &mut [u8]) -> usize {
        let safe_target_cpa = if target_cpa > 0.0 { target_cpa } else { 50.0 };
        let mut root_token_map: HashMap<Box<[u8]>, LongTailRootAggregate> = HashMap::with_capacity(1024);

        let mut total_long_tail_queries: u64 = 0;
        let mut total_long_tail_clicks: u64 = 0;
        let mut total_long_tail_cost: f64 = 0.0;
        let mut total_long_tail_waste: f64 = 0.0;

        for (query, records) in &self.query_auction_map {
            let mut query_clicks = 0u64;
            let mut query_cost = 0.0f64;
            let mut query_conversions = 0.0f64;

            for r in records {
                query_clicks += r.clicks;
                query_cost += r.cost;
                query_conversions += r.conversions;
            }

            // Long-tail threshold: queries with <= 2 clicks
            if query_clicks <= 2 {
                total_long_tail_queries += 1;
                total_long_tail_clicks += query_clicks;
                total_long_tail_cost += query_cost;

                let waste = if query_conversions <= 0.0 {
                    query_cost
                } else {
                    (query_cost - query_conversions * safe_target_cpa).max(0.0)
                };
                total_long_tail_waste += waste;

                // Extract unique root tokens from this query
                let mut seen_tokens: Vec<Box<[u8]>> = Vec::with_capacity(8);
                crate::guard::safe_list::split_words(query, |w| {
                    if w.len() >= 2 && !seen_tokens.iter().any(|existing| existing.as_ref() == w) {
                        seen_tokens.push(Box::from(w));
                    }
                });

                for token in seen_tokens {
                    let entry = root_token_map.entry(token).or_default();
                    entry.query_count += 1;
                    entry.clicks += query_clicks;
                    entry.cost += query_cost;
                    entry.conversions += query_conversions;
                    entry.waste += waste;
                }
            }
        }

        // Shared root tokens across queries: query_count >= 2 and waste > 0
        let mut shared_roots: Vec<(&[u8], &LongTailRootAggregate)> = root_token_map
            .iter()
            .filter(|(_, agg)| agg.query_count >= 2 && agg.waste > 0.0)
            .map(|(t, agg)| (t.as_ref(), agg))
            .collect();

        // Sort by waste descending
        shared_roots.sort_by(|a, b| {
            b.1.waste
                .partial_cmp(&a.1.waste)
                .unwrap_or(core::cmp::Ordering::Equal)
        });

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
        let _ = write!(
            cursor,
            r#"{{"total_long_tail_queries":{},"total_long_tail_clicks":{},"total_long_tail_cost":{:.2},"total_long_tail_waste":{:.2},"identified_root_tokens_count":{},"root_tokens":["#,
            total_long_tail_queries,
            total_long_tail_clicks,
            total_long_tail_cost,
            total_long_tail_waste,
            shared_roots.len()
        );

        for (i, (token, agg)) in shared_roots.iter().enumerate() {
            if i > 0 {
                let _ = cursor.write_str(",");
            }
            let token_str = core::str::from_utf8(token).unwrap_or("");
            let _ = write!(
                cursor,
                r#"{{"token":"{}","query_count":{},"total_clicks":{},"total_cost":{:.2},"total_conversions":{:.0},"waste":{:.2}}}"#,
                token_str, agg.query_count, agg.clicks, agg.cost, agg.conversions, agg.waste
            );
        }

        let _ = cursor.write_str("]}");
        cursor.pos
    }

    /// Calculates budget lost when automated broad/phrase queries capture searches
    /// that exist as exact match keywords at higher CPCs.
    /// Matches normalized token hashes to achieve sub-10ms evaluation.
    pub fn detect_match_type_dilution(&self, output: &mut [u8]) -> usize {
        let mut diluted_items: Vec<DilutedQueryItem> = Vec::with_capacity(64);
        let mut total_budget_lost = 0.0f64;
        let mut total_diluted_clicks = 0u64;
        let mut total_diluted_spend = 0.0f64;
        let mut total_benchmark_spend = 0.0f64;

        for (query, records) in &self.query_auction_map {
            let mut broad_clicks = 0u64;
            let mut broad_cost = 0.0f64;

            for r in records {
                if r.match_type != QueryMatchType::Exact {
                    broad_clicks += r.clicks;
                    broad_cost += r.cost;
                }
            }

            if broad_clicks == 0 || broad_cost <= 0.0 {
                continue;
            }

            let broad_cpc = broad_cost / broad_clicks as f64;
            let hash = compute_normalized_token_hash(query);

            if let Some(exact) = self.exact_benchmarks.get(&hash) {
                let exact_cpc = if exact.clicks > 0 && exact.cost > 0.0 {
                    exact.cost / exact.clicks as f64
                } else {
                    exact.cost
                };

                if exact_cpc > 0.0 && broad_cpc > exact_cpc {
                    let budget_lost = (broad_cpc - exact_cpc) * broad_clicks as f64;
                    let cpc_inflation = broad_cpc / exact_cpc;

                    total_budget_lost += budget_lost;
                    total_diluted_clicks += broad_clicks;
                    total_diluted_spend += broad_cost;
                    total_benchmark_spend += exact_cpc * broad_clicks as f64;

                    diluted_items.push(DilutedQueryItem {
                        query: query.as_ref(),
                        broad_cpc,
                        exact_cpc,
                        clicks: broad_clicks,
                        budget_lost,
                        cpc_inflation_ratio: cpc_inflation,
                    });
                }
            }
        }

        // Sort diluted items by budget lost descending
        diluted_items.sort_by(|a, b| {
            b.budget_lost
                .partial_cmp(&a.budget_lost)
                .unwrap_or(core::cmp::Ordering::Equal)
        });

        let dilution_index = if self.aggregator.aggregated_cost > 0.0 {
            (total_budget_lost / self.aggregator.aggregated_cost).min(1.0)
        } else if total_diluted_spend > 0.0 {
            (total_budget_lost / total_diluted_spend).min(1.0)
        } else {
            0.0
        };

        let avg_cpc_inflation = if total_benchmark_spend > 0.0 {
            total_diluted_spend / total_benchmark_spend
        } else if !diluted_items.is_empty() {
            diluted_items
                .iter()
                .map(|d| d.cpc_inflation_ratio)
                .sum::<f64>()
                / diluted_items.len() as f64
        } else {
            1.0
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
        let _ = write!(
            cursor,
            r#"{{"dilution_index":{:.4},"budget_lost":{:.2},"diluted_queries_count":{},"total_diluted_clicks":{},"diluted_spend":{:.2},"exact_benchmark_spend":{:.2},"average_cpc_inflation":{:.2},"items":["#,
            dilution_index,
            total_budget_lost,
            diluted_items.len(),
            total_diluted_clicks,
            total_diluted_spend,
            total_benchmark_spend,
            avg_cpc_inflation
        );

        for (i, item) in diluted_items.iter().enumerate() {
            if i > 0 {
                let _ = cursor.write_str(",");
            }
            let q_str = core::str::from_utf8(item.query).unwrap_or("");
            let _ = write!(
                cursor,
                r#"{{"query":"{}","broad_cpc":{:.2},"exact_cpc":{:.2},"clicks":{},"budget_lost":{:.2},"cpc_inflation_ratio":{:.2}}}"#,
                q_str, item.broad_cpc, item.exact_cpc, item.clicks, item.budget_lost, item.cpc_inflation_ratio
            );
        }

        let _ = cursor.write_str("]}");
        cursor.pos
    }
}

fn write_escaped_json_str<W: core::fmt::Write>(w: &mut W, bytes: &[u8]) {
    let s = core::str::from_utf8(bytes).unwrap_or("");
    for c in s.chars() {
        match c {
            '"' => { let _ = w.write_str("\\\""); }
            '\\' => { let _ = w.write_str("\\\\"); }
            '\n' => { let _ = w.write_str("\\n"); }
            '\r' => { let _ = w.write_str("\\r"); }
            '\t' => { let _ = w.write_str("\\t"); }
            _ => { let _ = w.write_char(c); }
        }
    }
}

#[inline(always)]
fn is_column_header_line(line: &[u8], delim: u8) -> bool {
    let mut fields: [&[u8]; 32] = [&[]; 32];
    let field_count = split_fields(line, delim, &mut fields);
    if field_count < 2 {
        return false;
    }

    let mut has_query = false;
    let mut has_metric_or_campaign = false;

    for &field in &fields[..field_count] {
        let f = trim_quotes(field);
        if contains_ignore_case(f, b"customer search term")
            || contains_ignore_case(f, b"search query")
            || contains_ignore_case(f, b"search term")
            || contains_ignore_case(f, b"search keyword")
            || contains_ignore_case(f, b"keyword")
            || contains_ignore_case(f, b"query")
        {
            has_query = true;
        }
        if contains_ignore_case(f, b"clicks")
            || contains_ignore_case(f, b"cost")
            || contains_ignore_case(f, b"spend")
            || contains_ignore_case(f, b"amount spent")
            || contains_ignore_case(f, b"impressions")
            || contains_ignore_case(f, b"conversions")
            || contains_ignore_case(f, b"orders")
            || contains_ignore_case(f, b"7 day total orders")
            || contains_ignore_case(f, b"all conv.")
            || contains_ignore_case(f, b"campaign")
            || contains_ignore_case(f, b"ad group")
            || contains_ignore_case(f, b"adgroup")
        {
            has_metric_or_campaign = true;
        }
    }

    has_query && has_metric_or_campaign
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

#[derive(Clone, Debug, Default)]
pub struct LongTailRootAggregate {
    pub query_count: u64,
    pub clicks: u64,
    pub cost: f64,
    pub conversions: f64,
    pub waste: f64,
}

#[derive(Clone, Debug)]
pub struct DilutedQueryItem<'a> {
    pub query: &'a [u8],
    pub broad_cpc: f64,
    pub exact_cpc: f64,
    pub clicks: u64,
    pub budget_lost: f64,
    pub cpc_inflation_ratio: f64,
}

/// Computes a 64-bit deterministic hash over normalized tokens.
/// Ignores brackets, quotes, case, and extra whitespace so exact/broad variants match O(1).
#[inline(always)]
pub fn compute_normalized_token_hash(raw: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    crate::guard::safe_list::split_words(raw, |w| {
        for &b in w {
            hash ^= b as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash ^= 0x20;
        hash = hash.wrapping_mul(0x100000001b3);
    });
    hash
}

/// Strips bracketed exact [term] or quoted phrase "term" match type syntax.
#[inline(always)]
pub fn strip_match_syntax(field: &[u8]) -> &[u8] {
    let mut s = field;
    while s.starts_with(b" ") || s.starts_with(b"\t") {
        s = &s[1..];
    }
    while s.ends_with(b" ") || s.ends_with(b"\t") {
        s = &s[..s.len() - 1];
    }
    if s.len() >= 2 && ((s[0] == b'[' && s[s.len() - 1] == b']') || (s[0] == b'"' && s[s.len() - 1] == b'"')) {
        s = &s[1..s.len() - 1];
    }
    trim_quotes(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalized_token_hash_invariance() {
        let h1 = compute_normalized_token_hash(b"[running shoes]");
        let h2 = compute_normalized_token_hash(b"\"running shoes\"");
        let h3 = compute_normalized_token_hash(b"running shoes");
        let h4 = compute_normalized_token_hash(b"Running   Shoes");
        let h5 = compute_normalized_token_hash(b"[Running Shoes]");

        assert_eq!(h1, h2);
        assert_eq!(h2, h3);
        assert_eq!(h3, h4);
        assert_eq!(h4, h5);

        let h_diff = compute_normalized_token_hash(b"hiking boots");
        assert_ne!(h1, h_diff);
    }

    #[test]
    fn test_fragmented_long_tail_aggregator() {
        let mut engine = SieveEngine::new();
        // Ingest queries with <= 2 clicks sharing root tokens "free" and "pdf"
        let csv = [
            "Search term,Clicks,Cost,Conversions",
            "free manual download,1,5.00,0",
            "free pdf guide,2,7.50,0",
            "pdf software sample,1,4.00,0",
            "best converting query,50,150.00,10", // High clicks -> NOT in long tail
        ]
        .join("\n");

        let status = engine.ingest_chunk(csv.as_bytes(), true);
        assert_eq!(status, 0);

        let mut out = [0u8; 4096];
        let len = engine.aggregate_fragmented_long_tail(50.0, &mut out);
        assert!(len > 0);

        let json = core::str::from_utf8(&out[..len]).unwrap();
        assert!(json.contains(r#""total_long_tail_queries":3"#));
        assert!(json.contains(r#""total_long_tail_clicks":4"#));
        // Shared root token "free" appears in 2 queries ("free manual download", "free pdf guide"), waste = 12.50
        assert!(json.contains(r#""token":"free""#));
        assert!(json.contains(r#""query_count":2"#));
        // Shared root token "pdf" appears in 2 queries ("free pdf guide", "pdf software sample"), waste = 11.50
        assert!(json.contains(r#""token":"pdf""#));
        // "best converting query" must NOT be in long-tail
        assert!(!json.contains("converting"));
    }

    #[test]
    fn test_match_type_dilution_index() {
        let mut engine = SieveEngine::new();
        let csv = [
            "Search term,Match type,Campaign,Ad group,Clicks,Cost,Conversions",
            "\"running shoes\",Exact,Exact_Campaign,Exact_Adgroup,50,\"60.00\",5", // Exact CPC = $1.20
            "\"running shoes\",Broad,Broad_Campaign,Broad_Adgroup,80,\"200.00\",2", // Broad CPC = $2.50
            "\"unrelated search\",Broad,Broad_Campaign,Broad_Adgroup,20,\"40.00\",1",
        ]
        .join("\n");

        let status = engine.ingest_chunk(csv.as_bytes(), true);
        assert_eq!(status, 0);

        let mut out = [0u8; 4096];
        let len = engine.detect_match_type_dilution(&mut out);
        assert!(len > 0);

        let json = core::str::from_utf8(&out[..len]).unwrap();
        // Budget lost for "running shoes": (2.50 - 1.20) * 80 = 104.00
        assert!(json.contains(r#""budget_lost":104.00"#));
        assert!(json.contains(r#""diluted_queries_count":1"#));
        assert!(json.contains(r#""total_diluted_clicks":80"#));
        assert!(json.contains(r#""broad_cpc":2.50"#));
        assert!(json.contains(r#""exact_cpc":1.20"#));
        assert!(json.contains(r#""cpc_inflation_ratio":2.08"#));
    }

    #[test]
    fn test_export_columnar_records() {
        let mut engine = SieveEngine::new();
        let csv = [
            "Search term,Campaign,Ad group,Clicks,Cost,Conversions",
            "cheap running shoes,US_Search,Shoes_AG,15,45.50,2",
            "luxury boots,UK_Search,Boots_AG,5,25.00,0",
        ]
        .join("\n");

        let status = engine.ingest_chunk(csv.as_bytes(), true);
        assert_eq!(status, 0);

        let mut out = [0u8; 8192];
        let bytes_written = engine.export_columnar_records(&mut out);
        assert!(bytes_written > 80);

        // Check magic and version
        let magic = u32::from_le_bytes(out[0..4].try_into().unwrap());
        let version = u32::from_le_bytes(out[4..8].try_into().unwrap());
        let row_count = u32::from_le_bytes(out[8..12].try_into().unwrap());

        assert_eq!(magic, 0x53494556);
        assert_eq!(version, 1);
        assert_eq!(row_count, 2);
    }
}
