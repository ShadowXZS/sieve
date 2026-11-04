//! Zero-loss collision safety and negative match type forcing.
//!
//! Architectural Guarantees:
//! - Queries inverted index in O(1) per token to detect collisions with converting terms.
//! - Strictly forces bracketed exact exclusion `[term]` when a broad candidate collides.
//! - Direct serialization into output buffer without intermediate String allocation.

use core::fmt::Write;
use hashbrown::HashMap;

use crate::guard::safe_list::{split_words, SafeListIndex};

pub struct CollisionGuard {
    pub safe_list: SafeListIndex,
}

impl Default for CollisionGuard {
    fn default() -> Self {
        Self::new()
    }
}

pub struct CollisionResult<'a> {
    pub has_collision: bool,
    pub forced_match: &'a [u8],
    pub exclusion_type: &'static str,
    pub colliding_terms: Vec<&'a [u8]>,
}

impl CollisionGuard {
    pub fn new() -> Self {
        Self {
            safe_list: SafeListIndex::new(),
        }
    }

    pub fn reset(&mut self) {
        self.safe_list.reset();
    }

    pub fn add_safe_term(&mut self, term: &[u8], conversions: f64) {
        self.safe_list.add_safe_term(term, conversions);
    }

    /// Evaluates a candidate negative term against the inverted safe list.
    /// Writes JSON evaluation output directly into `out`.
    pub fn evaluate_negative_json(&self, candidate: &[u8], out: &mut [u8]) -> usize {
        let mut candidate_words: Vec<Box<[u8]>> = Vec::with_capacity(8);
        split_words(candidate, |w| {
            if !candidate_words.iter().any(|existing| existing.as_ref() == w) {
                candidate_words.push(Box::from(w));
            }
        });

        let mut term_match_counts: HashMap<u32, usize> = HashMap::with_capacity(16);
        let cand_token_count = candidate_words.len();
        let mut missing_token = false;

        if cand_token_count > 0 {
            for word in &candidate_words {
                if let Some(postings) = self.safe_list.inverted_index.get(word) {
                    for &term_idx in postings {
                        *term_match_counts.entry(term_idx).or_insert(0) += 1;
                    }
                } else {
                    // Branch prediction fast-path: if any word from candidate is absent in the inverted
                    // index, no safe term can possibly contain all words of this candidate negative.
                    missing_token = true;
                    break;
                }
            }
        } else {
            missing_token = true;
        }

        let mut colliding_terms: Vec<&[u8]> = Vec::new();
        if !missing_token {
            for (&term_idx, &match_count) in &term_match_counts {
                // Collision: all words of the candidate negative appear in the converting safe term
                if match_count == cand_token_count {
                    if let Some(safe_term) = self.safe_list.terms.get(term_idx as usize) {
                        colliding_terms.push(&safe_term.raw);
                    }
                }
            }
        }

        let has_collision = !colliding_terms.is_empty();

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

        let mut cursor = Cursor { buf: out, pos: 0 };
        let cand_str = core::str::from_utf8(candidate).unwrap_or("");

        let _ = cursor.write_str(r#"{"has_collision":"#);
        let _ = if has_collision {
            cursor.write_str("true")
        } else {
            cursor.write_str("false")
        };

        if has_collision {
            let _ = write!(cursor, r#","forced_match":"[{}]","exclusion_type":"exact""#, cand_str);
        } else {
            let _ = write!(cursor, r#","forced_match":"{}","exclusion_type":"broad""#, cand_str);
        }

        let _ = cursor.write_str(r#","colliding_terms":["#);
        for (i, term) in colliding_terms.iter().enumerate() {
            if i > 0 {
                let _ = cursor.write_str(",");
            }
            let term_str = core::str::from_utf8(term).unwrap_or("");
            let _ = write!(cursor, r#""{}""#, term_str);
        }
        let _ = cursor.write_str("]}");

        cursor.pos
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collision_detection() {
        let mut guard = CollisionGuard::new();
        guard.add_safe_term(b"buy cheap shoes online", 12.0);

        let mut out = [0u8; 1024];
        let len = guard.evaluate_negative_json(b"cheap shoes", &mut out);
        assert!(len > 0);
        let json = core::str::from_utf8(&out[..len]).unwrap();
        assert!(json.contains(r#""has_collision":true"#));
        assert!(json.contains(r#""forced_match":"[cheap shoes]""#));
        assert!(json.contains(r#""exclusion_type":"exact""#));
        assert!(json.contains("buy cheap shoes online"));

        let len2 = guard.evaluate_negative_json(b"expensive boots", &mut out);
        let json2 = core::str::from_utf8(&out[..len2]).unwrap();
        assert!(json2.contains(r#""has_collision":false"#));
        assert!(json2.contains(r#""forced_match":"expensive boots""#));
        assert!(json2.contains(r#""exclusion_type":"broad""#));
    }
}
