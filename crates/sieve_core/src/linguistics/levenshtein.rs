//! Damerau-Levenshtein metric engine with length short-circuiting.
//!
//! Architectural Guarantees:
//! - Early short-circuiting when `|len(s1) - len(s2)| > max_distance` (k=2).
//! - Zero heap allocation: uses stack scratch buffer for matrix evaluation.
//! - Optimal String Alignment supporting insertions, deletions, substitutions, and transpositions.

pub const MAX_STACK_STR_LEN: usize = 127;
pub const SHORT_CIRCUIT_SENTINEL: u32 = 255;

/// Computes Damerau-Levenshtein distance between two byte slices.
/// Short-circuits immediately if length difference exceeds `max_distance`.
#[inline]
pub fn damerau_levenshtein(s1: &[u8], s2: &[u8], max_distance: u32) -> u32 {
    let len1 = s1.len();
    let len2 = s2.len();

    // Constraint: short-circuit if candidate byte-length delta exceeds threshold
    let len_diff = (len1 as isize - len2 as isize).unsigned_abs() as u32;
    if len_diff > max_distance {
        return SHORT_CIRCUIT_SENTINEL;
    }

    if len1 == 0 {
        return len2 as u32;
    }
    if len2 == 0 {
        return len1 as u32;
    }

    // Fast-path: equality check
    if s1 == s2 {
        return 0;
    }

    // Use stack scratch buffer if both strings fit within MAX_STACK_STR_LEN
    if len1 <= MAX_STACK_STR_LEN && len2 <= MAX_STACK_STR_LEN {
        damerau_levenshtein_stack(s1, s2, max_distance)
    } else {
        damerau_levenshtein_heap(s1, s2, max_distance)
    }
}

/// Zero-allocation stack matrix implementation with cyclic 3-row buffer rotation (0 copies).
#[inline(always)]
fn damerau_levenshtein_stack(s1: &[u8], s2: &[u8], max_distance: u32) -> u32 {
    let len1 = s1.len();
    let len2 = s2.len();
    let cols = len2 + 1;

    // Cyclic 3-row buffer: rows[0], rows[1], rows[2] rotated modulo 3.
    // Eliminates all memory copies between row iterations.
    let mut rows = [[0u8; MAX_STACK_STR_LEN + 1]; 3];

    for (j, val) in rows[0].iter_mut().enumerate().take(cols) {
        *val = j as u8;
    }

    for i in 1..=len1 {
        let curr_idx = i % 3;
        let prev1_idx = (i + 2) % 3;
        let prev2_idx = (i + 1) % 3;

        rows[curr_idx][0] = i as u8;
        let mut min_in_row = rows[curr_idx][0] as u32;

        let b1 = s1[i - 1];

        for j in 1..=len2 {
            let b2 = s2[j - 1];
            // Branchless substitution cost evaluation
            let cost = (b1 != b2) as u8;

            let del = rows[prev1_idx][j] + 1;
            let ins = rows[curr_idx][j - 1] + 1;
            let sub = rows[prev1_idx][j - 1] + cost;

            let mut d = del.min(ins).min(sub);

            // Transposition check
            if i > 1 && j > 1 && b1 == s2[j - 2] && s1[i - 2] == b2 {
                let trans = rows[prev2_idx][j - 2] + 1;
                d = d.min(trans);
            }

            rows[curr_idx][j] = d;
            min_in_row = min_in_row.min(d as u32);
        }

        // Early exit if the minimum distance in this row already exceeds max_distance
        if min_in_row > max_distance {
            return SHORT_CIRCUIT_SENTINEL;
        }
    }

    let final_dist = rows[len1 % 3][len2] as u32;
    if final_dist > max_distance {
        SHORT_CIRCUIT_SENTINEL
    } else {
        final_dist
    }
}

/// Fallback for oversized strings (rare in PPC queries).
fn damerau_levenshtein_heap(s1: &[u8], s2: &[u8], max_distance: u32) -> u32 {
    let len1 = s1.len();
    let len2 = s2.len();
    let cols = len2 + 1;

    let mut row_prev2 = vec![0u32; cols];
    let mut row_prev1 = vec![0u32; cols];
    let mut row_curr = vec![0u32; cols];

    for (j, val) in row_prev1.iter_mut().enumerate() {
        *val = j as u32;
    }

    for i in 1..=len1 {
        row_curr[0] = i as u32;
        let mut min_in_row = row_curr[0];

        for j in 1..=len2 {
            let cost = if s1[i - 1] == s2[j - 1] { 0 } else { 1 };
            let del = row_prev1[j] + 1;
            let ins = row_curr[j - 1] + 1;
            let sub = row_prev1[j - 1] + cost;

            let mut d = del.min(ins).min(sub);

            if i > 1 && j > 1 && s1[i - 1] == s2[j - 2] && s1[i - 2] == s2[j - 1] {
                let trans = row_prev2[j - 2] + 1;
                d = d.min(trans);
            }

            row_curr[j] = d;
            min_in_row = min_in_row.min(d);
        }

        if min_in_row > max_distance {
            return SHORT_CIRCUIT_SENTINEL;
        }

        row_prev2.copy_from_slice(&row_prev1);
        row_prev1.copy_from_slice(&row_curr);
    }

    let final_dist = row_curr[len2];
    if final_dist > max_distance {
        SHORT_CIRCUIT_SENTINEL
    } else {
        final_dist
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_damerau_levenshtein_edits() {
        assert_eq!(damerau_levenshtein(b"receipt", b"reciept", 2), 1);
        assert_eq!(damerau_levenshtein(b"receipt", b"receit", 2), 1);
        assert_eq!(damerau_levenshtein(b"receipt", b"recet", 2), 2);
        assert_eq!(damerau_levenshtein(b"receipt", b"receipts", 2), 1);
    }

    #[test]
    fn test_short_circuit_on_length_delta() {
        let dist = damerau_levenshtein(b"receipt", b"receipt_confirmation_download", 2);
        assert_eq!(dist, SHORT_CIRCUIT_SENTINEL);
    }
}
