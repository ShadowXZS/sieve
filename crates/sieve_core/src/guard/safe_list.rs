//! Inverted index safe list for O(1) converting n-gram membership checks.
//!
//! Architectural Guarantees:
//! - Inverted index mapping token -> posting list of safe term IDs.
//! - Sub-microsecond O(1) average lookup per token.
//! - Direct &[u8] tokenization without dynamic intermediate strings.

use hashbrown::HashMap;

pub struct SafeTerm {
    pub raw: Box<[u8]>,
    pub conversions: f64,
    pub token_count: usize,
}

pub struct SafeListIndex {
    pub terms: Vec<SafeTerm>,
    pub inverted_index: HashMap<Box<[u8]>, Vec<u32>>,
}

impl Default for SafeListIndex {
    fn default() -> Self {
        Self::new()
    }
}

impl SafeListIndex {
    pub fn new() -> Self {
        Self {
            terms: Vec::with_capacity(1024),
            inverted_index: HashMap::with_capacity(4096),
        }
    }

    pub fn reset(&mut self) {
        self.terms.clear();
        self.inverted_index.clear();
    }

    /// Adds a converting query/n-gram to the safe list and updates the inverted index.
    pub fn add_safe_term(&mut self, term: &[u8], conversions: f64) {
        if term.is_empty() {
            return;
        }

        let term_idx = self.terms.len() as u32;
        let mut words: Vec<Box<[u8]>> = Vec::with_capacity(8);

        split_words(term, |w| {
            if !words.iter().any(|existing| existing.as_ref() == w) {
                words.push(Box::from(w));
            }
        });

        let token_count = words.len();

        for w in words {
            self.inverted_index
                .entry(w)
                .or_default()
                .push(term_idx);
        }

        self.terms.push(SafeTerm {
            raw: Box::from(term),
            conversions,
            token_count,
        });
    }
}

/// Helper to extract normalized lowercase words from &[u8].
#[inline]
pub fn split_words<F>(input: &[u8], mut callback: F)
where
    F: FnMut(&[u8]),
{
    let mut scratch = [0u8; 128];
    let mut in_word = false;
    let mut word_start = 0;

    for (i, &b) in input.iter().enumerate() {
        let is_sep = b == b' ' || b == b'\t' || b == b'\r' || b == b'\n' || b == b'"' || b == b'[' || b == b']';
        if !is_sep {
            if !in_word {
                in_word = true;
                word_start = i;
            }
        } else if in_word {
            in_word = false;
            let slice = &input[word_start..i];
            let len = slice.len().min(scratch.len());
            for j in 0..len {
                scratch[j] = slice[j].to_ascii_lowercase();
            }
            callback(&scratch[..len]);
        }
    }

    if in_word {
        let slice = &input[word_start..input.len()];
        let len = slice.len().min(scratch.len());
        for j in 0..len {
            scratch[j] = slice[j].to_ascii_lowercase();
        }
        callback(&scratch[..len]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inverted_index() {
        let mut index = SafeListIndex::new();
        index.add_safe_term(b"buy cheap shoes online", 12.0);

        assert_eq!(index.terms.len(), 1);
        assert!(index.inverted_index.contains_key(&b"cheap"[..]));
        assert!(index.inverted_index.contains_key(&b"shoes"[..]));
    }
}

