//! Low-level zero-allocation N-Gram tokenizer with circular byte scratch buffer.
//!
//! Architectural Guarantees:
//! - Direct single-pass byte iteration on &[u8].
//! - Fixed-size circular byte buffer for n-gram assembly.
//! - On-the-fly case normalization avoiding heap strings or large intermediate buffers.

pub const MAX_WORDS_PER_QUERY: usize = 64;
pub const NGRAM_BUFFER_SIZE: usize = 256;

#[derive(Copy, Clone, Debug)]
struct WordRange {
    start: usize,
    end: usize,
}

/// Tokenizes a query byte slice into unigrams, bigrams, and trigrams without dynamic allocations.
/// Normalizes to ASCII lowercase on-the-fly into fixed circular scratch memory.
#[inline(always)]
pub fn tokenize_ngrams<F>(query: &[u8], mut visitor: F)
where
    F: FnMut(usize, &[u8]),
{
    if query.is_empty() {
        return;
    }

    // Single-pass word boundary detection directly on raw query &[u8]
    let mut words = [WordRange { start: 0, end: 0 }; MAX_WORDS_PER_QUERY];
    let mut word_count = 0;
    let mut in_word = false;
    let mut word_start = 0;

    for (i, &b) in query.iter().enumerate() {
        let is_space = b == b' ' || b == b'\t' || b == b'\r' || b == b'\n' || b == b'"';
        if !is_space {
            if !in_word {
                in_word = true;
                word_start = i;
            }
        } else if in_word {
            in_word = false;
            if word_count < MAX_WORDS_PER_QUERY {
                words[word_count] = WordRange {
                    start: word_start,
                    end: i,
                };
                word_count += 1;
            }
        }
    }

    if in_word && word_count < MAX_WORDS_PER_QUERY {
        words[word_count] = WordRange {
            start: word_start,
            end: query.len(),
        };
        word_count += 1;
    }

    if word_count == 0 {
        return;
    }

    let mut scratch = [0u8; NGRAM_BUFFER_SIZE];

    // 1. Unigrams (n = 1)
    for w in words.iter().take(word_count) {
        let len = (w.end - w.start).min(NGRAM_BUFFER_SIZE);
        for j in 0..len {
            scratch[j] = query[w.start + j].to_ascii_lowercase();
        }
        visitor(1, &scratch[..len]);
    }

    // 2. Bigrams (n = 2)
    if word_count >= 2 {
        for i in 0..word_count - 1 {
            let w1 = &words[i];
            let w2 = &words[i + 1];
            let len1 = w1.end - w1.start;
            let len2 = w2.end - w2.start;

            if len1 + 1 + len2 <= NGRAM_BUFFER_SIZE {
                let mut offset = 0;
                for j in 0..len1 {
                    scratch[offset] = query[w1.start + j].to_ascii_lowercase();
                    offset += 1;
                }
                scratch[offset] = b' ';
                offset += 1;
                for j in 0..len2 {
                    scratch[offset] = query[w2.start + j].to_ascii_lowercase();
                    offset += 1;
                }
                visitor(2, &scratch[..offset]);
            }
        }
    }

    // 3. Trigrams (n = 3)
    if word_count >= 3 {
        for i in 0..word_count - 2 {
            let w1 = &words[i];
            let w2 = &words[i + 1];
            let w3 = &words[i + 2];
            let len1 = w1.end - w1.start;
            let len2 = w2.end - w2.start;
            let len3 = w3.end - w3.start;

            if len1 + 1 + len2 + 1 + len3 <= NGRAM_BUFFER_SIZE {
                let mut offset = 0;
                for j in 0..len1 {
                    scratch[offset] = query[w1.start + j].to_ascii_lowercase();
                    offset += 1;
                }
                scratch[offset] = b' ';
                offset += 1;
                for j in 0..len2 {
                    scratch[offset] = query[w2.start + j].to_ascii_lowercase();
                    offset += 1;
                }
                scratch[offset] = b' ';
                offset += 1;
                for j in 0..len3 {
                    scratch[offset] = query[w3.start + j].to_ascii_lowercase();
                    offset += 1;
                }
                visitor(3, &scratch[..offset]);
            }
        }
    }
}
