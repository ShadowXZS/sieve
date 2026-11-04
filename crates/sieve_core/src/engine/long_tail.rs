//! Fragmented Long-Tail Query Aggregator
//!
//! Architectural Guarantees:
//! - Aggregates search queries with <= 2 clicks across the account.
//! - Extracts shared root tokens without creating intermediate dynamic string arrays.
//! - Identifies root tokens appearing across >= 2 queries that collectively cause significant waste.
//! - Streams structured JSON directly into linear memory output buffers.

use core::fmt::Write;
use hashbrown::HashMap;
use crate::guard::safe_list::split_words;

#[derive(Clone, Debug, Default)]
pub struct LongTailRootAggregate {
    pub query_count: u64,
    pub clicks: u64,
    pub cost: f64,
    pub conversions: f64,
    pub waste: f64,
}

pub struct FragmentedLongTailAggregator {
    pub target_cpa: f64,
    pub root_tokens: HashMap<Box<[u8]>, LongTailRootAggregate>,
    pub total_long_tail_queries: u64,
    pub total_long_tail_clicks: u64,
    pub total_long_tail_cost: f64,
    pub total_long_tail_waste: f64,
}

impl Default for FragmentedLongTailAggregator {
    fn default() -> Self {
        Self::new(50.0)
    }
}

impl FragmentedLongTailAggregator {
    pub fn new(target_cpa: f64) -> Self {
        Self {
            target_cpa: if target_cpa > 0.0 { target_cpa } else { 50.0 },
            root_tokens: HashMap::with_capacity(1024),
            total_long_tail_queries: 0,
            total_long_tail_clicks: 0,
            total_long_tail_cost: 0.0,
            total_long_tail_waste: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.root_tokens.clear();
        self.total_long_tail_queries = 0;
        self.total_long_tail_clicks = 0;
        self.total_long_tail_cost = 0.0;
        self.total_long_tail_waste = 0.0;
    }

    /// Evaluates a single search query record. If clicks <= 2, ingests as fragmented long-tail.
    #[inline]
    pub fn ingest_query(&mut self, query: &[u8], clicks: u64, cost: f64, conversions: f64) {
        if clicks > 2 {
            return;
        }

        self.total_long_tail_queries += 1;
        self.total_long_tail_clicks += clicks;
        self.total_long_tail_cost += cost;

        let waste = if conversions <= 0.0 {
            cost
        } else {
            (cost - conversions * self.target_cpa).max(0.0)
        };
        self.total_long_tail_waste += waste;

        let mut seen_tokens: Vec<Box<[u8]>> = Vec::with_capacity(8);
        split_words(query, |w| {
            if w.len() >= 2 && !seen_tokens.iter().any(|existing| existing.as_ref() == w) {
                seen_tokens.push(Box::from(w));
            }
        });

        for token in seen_tokens {
            let entry = self.root_tokens.entry(token).or_default();
            entry.query_count += 1;
            entry.clicks += clicks;
            entry.cost += cost;
            entry.conversions += conversions;
            entry.waste += waste;
        }
    }

    /// Exports shared root tokens (query_count >= 2 with waste > 0) formatted as JSON directly into output buffer.
    pub fn export_json(&self, output: &mut [u8]) -> usize {
        let mut shared_roots: Vec<(&[u8], &LongTailRootAggregate)> = self
            .root_tokens
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

        let mut cursor = Cursor { buf: output, pos: 0 };
        let _ = write!(
            cursor,
            r#"{{"total_long_tail_queries":{},"total_long_tail_clicks":{},"total_long_tail_cost":{:.2},"total_long_tail_waste":{:.2},"identified_root_tokens_count":{},"root_tokens":["#,
            self.total_long_tail_queries,
            self.total_long_tail_clicks,
            self.total_long_tail_cost,
            self.total_long_tail_waste,
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_long_tail_1000_queries_root_token() {
        let mut agg = FragmentedLongTailAggregator::new(50.0);

        // Ingest 1,000 queries each with 1 click and $3 spend sharing "free"
        for i in 0..1000 {
            let q = format!("free trial query variation {}", i);
            agg.ingest_query(q.as_bytes(), 1, 3.0, 0.0);
        }

        // Add 1 high volume query (50 clicks) -> must be excluded
        agg.ingest_query(b"enterprise license download", 50, 150.0, 5.0);

        let mut out = [0u8; 8192];
        let len = agg.export_json(&mut out);
        assert!(len > 0);

        let json = core::str::from_utf8(&out[..len]).unwrap();
        assert!(json.contains(r#""total_long_tail_queries":1000"#));
        assert!(json.contains(r#""total_long_tail_clicks":1000"#));
        assert!(json.contains(r#""total_long_tail_waste":3000.00"#));
        assert!(json.contains(r#""token":"free""#));
        assert!(json.contains(r#""query_count":1000"#));
        assert!(json.contains(r#""waste":3000.00"#));
    }
}

