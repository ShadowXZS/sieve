//! Match-Type Dilution Index Guard
//!
//! Architectural Guarantees:
//! - Sub-10ms evaluation via 64-bit normalized token hash matching.
//! - Invariant matching across brackets `[exact]`, quotes `"phrase"`, case, and spacing.
//! - Accurately calculates budget lost: sum((Broad CPC - Exact CPC) * Clicks).
//! - Direct JSON streaming to linear memory buffer without heap string allocations.

use core::fmt::Write;
use hashbrown::HashMap;
use crate::guard::safe_list::split_words;

#[derive(Clone, Debug)]
pub struct ExactBenchmarkRecord {
    pub query: Box<[u8]>,
    pub clicks: u64,
    pub cost: f64,
    pub conversions: f64,
}

#[derive(Clone, Debug)]
pub struct DilutedCandidate<'a> {
    pub query: &'a [u8],
    pub broad_cpc: f64,
    pub exact_cpc: f64,
    pub clicks: u64,
    pub budget_lost: f64,
    pub cpc_inflation_ratio: f64,
}

pub struct MatchTypeDilutionGuard {
    pub exact_benchmarks: HashMap<u64, ExactBenchmarkRecord>,
    pub total_account_spend: f64,
}

impl Default for MatchTypeDilutionGuard {
    fn default() -> Self {
        Self::new()
    }
}

impl MatchTypeDilutionGuard {
    pub fn new() -> Self {
        Self {
            exact_benchmarks: HashMap::with_capacity(1024),
            total_account_spend: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.exact_benchmarks.clear();
        self.total_account_spend = 0.0;
    }

    /// Computes a deterministic 64-bit normalized token hash.
    /// Case-insensitive, bracket-insensitive, quote-insensitive, space-normalized.
    #[inline(always)]
    pub fn compute_token_hash(raw: &[u8]) -> u64 {
        let mut hash = 0xcbf29ce484222325u64;
        split_words(raw, |w| {
            for &b in w {
                hash ^= b as u64;
                hash = hash.wrapping_mul(0x100000001b3);
            }
            hash ^= 0x20;
            hash = hash.wrapping_mul(0x100000001b3);
        });
        hash
    }

    /// Registers an exact match benchmark keyword with its traffic/CPC metrics.
    pub fn add_exact_benchmark(&mut self, query: &[u8], clicks: u64, cost: f64, conversions: f64) {
        let hash = Self::compute_token_hash(query);
        let entry = self.exact_benchmarks.entry(hash).or_insert_with(|| ExactBenchmarkRecord {
            query: Box::from(query),
            clicks: 0,
            cost: 0.0,
            conversions: 0.0,
        });
        entry.clicks += clicks;
        entry.cost += cost;
        entry.conversions += conversions;
    }

    /// Evaluates broad/phrase query candidates against registered exact benchmarks.
    /// Writes JSON evaluation output directly into `output`.
    pub fn evaluate_dilution_json<'a, I>(&self, candidates: I, total_spend: f64, output: &mut [u8]) -> usize
    where
        I: IntoIterator<Item = (&'a [u8], u64, f64)>, // (query, broad_clicks, broad_cost)
    {
        let mut diluted_items: Vec<DilutedCandidate<'a>> = Vec::with_capacity(64);
        let mut total_budget_lost = 0.0f64;
        let mut total_diluted_clicks = 0u64;
        let mut total_diluted_spend = 0.0f64;
        let mut total_benchmark_spend = 0.0f64;

        for (query, broad_clicks, broad_cost) in candidates {
            if broad_clicks == 0 || broad_cost <= 0.0 {
                continue;
            }

            let broad_cpc = broad_cost / broad_clicks as f64;
            let hash = Self::compute_token_hash(query);

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

                    diluted_items.push(DilutedCandidate {
                        query,
                        broad_cpc,
                        exact_cpc,
                        clicks: broad_clicks,
                        budget_lost,
                        cpc_inflation_ratio: cpc_inflation,
                    });
                }
            }
        }

        diluted_items.sort_by(|a, b| {
            b.budget_lost
                .partial_cmp(&a.budget_lost)
                .unwrap_or(core::cmp::Ordering::Equal)
        });

        let safe_total_spend = if total_spend > 0.0 {
            total_spend
        } else if self.total_account_spend > 0.0 {
            self.total_account_spend
        } else {
            total_diluted_spend
        };

        let dilution_index = if safe_total_spend > 0.0 {
            (total_budget_lost / safe_total_spend).min(1.0)
        } else {
            0.0
        };

        let avg_cpc_inflation = if total_benchmark_spend > 0.0 {
            total_diluted_spend / total_benchmark_spend
        } else if !diluted_items.is_empty() {
            diluted_items.iter().map(|d| d.cpc_inflation_ratio).sum::<f64>() / diluted_items.len() as f64
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

        let mut cursor = Cursor { buf: output, pos: 0 };
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dilution_guard_calculation() {
        let mut guard = MatchTypeDilutionGuard::new();

        // Exact keyword benchmark: "running shoes" at $1.20 CPC (50 clicks, $60 cost)
        guard.add_exact_benchmark(b"[running shoes]", 50, 60.0, 5.0);

        // Candidates:
        // 1. "running shoes" captured on Broad at $2.50 CPC (80 clicks, $200 cost)
        // 2. "leather boots" captured on Broad (no exact benchmark -> not diluted)
        let candidates = vec![
            (&b"running shoes"[..], 80u64, 200.0f64),
            (&b"leather boots"[..], 30u64, 60.0f64),
        ];

        let mut out = [0u8; 4096];
        let len = guard.evaluate_dilution_json(candidates, 260.0, &mut out);
        assert!(len > 0);

        let json = core::str::from_utf8(&out[..len]).unwrap();
        // Excess cost: (2.50 - 1.20) * 80 = 104.00
        assert!(json.contains(r#""budget_lost":104.00"#));
        assert!(json.contains(r#""diluted_queries_count":1"#));
        assert!(json.contains(r#""total_diluted_clicks":80"#));
        assert!(json.contains(r#""broad_cpc":2.50"#));
        assert!(json.contains(r#""exact_cpc":1.20"#));
        assert!(json.contains(r#""cpc_inflation_ratio":2.08"#));
    }
}

