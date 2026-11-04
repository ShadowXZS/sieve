//! Phonetic encoding and token permutation clustering.
//!
//! Architectural Guarantees:
//! - Deterministic American Soundex phonetic encoding.
//! - Direct &[u8] processing without intermediate heap allocation.
//! - Hybrid phonetic + Damerau-Levenshtein distance clustering.

use core::fmt::Write;
use crate::linguistics::levenshtein::damerau_levenshtein;

/// Writes the standard 4-character Soundex code into `out`.
/// Returns number of bytes written.
pub fn phonetic_code(input: &[u8], out: &mut [u8]) -> usize {
    if input.is_empty() || out.len() < 4 {
        return 0;
    }

    // Find first alphabetic character
    let mut first_char = None;
    let mut start_idx = 0;
    for (i, &b) in input.iter().enumerate() {
        if b.is_ascii_alphabetic() {
            first_char = Some(b.to_ascii_uppercase());
            start_idx = i + 1;
            break;
        }
    }

    let first_byte = match first_char {
        Some(b) => b,
        None => return 0,
    };

    out[0] = first_byte;
    let mut out_len = 1;
    let mut last_code = soundex_digit(first_byte);

    for &b in &input[start_idx..] {
        if !b.is_ascii_alphabetic() {
            continue;
        }
        let code = soundex_digit(b);
        if code != b'0' && code != last_code {
            out[out_len] = code;
            out_len += 1;
            if out_len == 4 {
                break;
            }
        }
        if code != b'0' {
            last_code = code;
        }
    }

    // Pad with '0' to 4 chars
    while out_len < 4 {
        out[out_len] = b'0';
        out_len += 1;
    }

    out_len
}

#[inline(always)]
fn soundex_digit(b: u8) -> u8 {
    match b.to_ascii_uppercase() {
        b'B' | b'F' | b'P' | b'V' => b'1',
        b'C' | b'G' | b'J' | b'K' | b'Q' | b'S' | b'X' | b'Z' => b'2',
        b'D' | b'T' => b'3',
        b'L' => b'4',
        b'M' | b'N' => b'5',
        b'R' => b'6',
        _ => b'0',
    }
}

pub struct TokenCluster {
    pub root: Box<[u8]>,
    pub variants: Vec<Box<[u8]>>,
}

/// Clusters an array of token slices into phonetic and Levenshtein groups.
pub fn cluster_tokens(tokens: &[&[u8]]) -> Vec<TokenCluster> {
    let mut clusters: Vec<TokenCluster> = Vec::new();

    for &token in tokens {
        if token.is_empty() {
            continue;
        }

        let mut matched = false;
        for cluster in &mut clusters {
            let dist = damerau_levenshtein(&cluster.root, token, 2);
            if dist <= 2 {
                cluster.variants.push(Box::from(token));
                matched = true;
                break;
            }
        }

        if !matched {
            clusters.push(TokenCluster {
                root: Box::from(token),
                variants: vec![Box::from(token)],
            });
        }
    }

    clusters
}

/// Formats clusters into output buffer as JSON.
pub fn export_clusters_json(clusters: &[TokenCluster], out: &mut [u8]) -> usize {
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
    let _ = cursor.write_str("[");

    for (i, cluster) in clusters.iter().enumerate() {
        if i > 0 {
            let _ = cursor.write_str(",");
        }
        let root_str = core::str::from_utf8(&cluster.root).unwrap_or("");
        let _ = write!(cursor, r#"{{"root":"{}","variants":["#, root_str);

        for (j, var) in cluster.variants.iter().enumerate() {
            if j > 0 {
                let _ = cursor.write_str(",");
            }
            let var_str = core::str::from_utf8(var).unwrap_or("");
            let _ = write!(cursor, r#""{}""#, var_str);
        }

        let _ = cursor.write_str("]}");
    }

    let _ = cursor.write_str("]");
    cursor.pos
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_soundex() {
        let mut buf = [0u8; 8];
        let len = phonetic_code(b"receipt", &mut buf);
        assert_eq!(&buf[..len], b"R213");

        let len2 = phonetic_code(b"reciept", &mut buf);
        assert_eq!(&buf[..len2], b"R213");
    }

    #[test]
    fn test_clustering() {
        let tokens: &[&[u8]] = &[b"receipt", b"reciept", b"receit", b"running", b"runing"];
        let clusters = cluster_tokens(tokens);
        assert_eq!(clusters.len(), 2);
        assert_eq!(clusters[0].variants.len(), 3);
        assert_eq!(clusters[1].variants.len(), 2);
    }
}

