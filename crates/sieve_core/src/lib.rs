//! Sieve Core: High-performance deterministic Rust WebAssembly pipeline.
//!
//! Architectural Guarantees:
//! - Strict zero-allocation parsing during record streaming via `csv-core`.
//! - WebAssembly memory allocations managed via exported `allocate_buffer` / `deallocate_buffer`.
//! - Zero dynamic strings in inner loops; direct operations on `&[u8]` byte slices.
//! - Platform schema auto-detection (Google Ads, Amazon PPC, Microsoft Advertising).
//! - N-Gram Radix Trie metric aggregation and reporting gap tracking.

#![deny(unsafe_op_in_unsafe_fn)]
#![allow(clippy::not_unsafe_ptr_arg_deref)]

pub mod engine;
pub mod guard;
pub mod linguistics;
pub mod matrix;
pub mod schema;
pub mod stats;
pub mod tokenizer;

use core::alloc::Layout;
use csv_core::{Reader, ReaderBuilder, ReadRecordResult};
use std::alloc::{alloc as sys_alloc, dealloc as sys_dealloc};
use wasm_bindgen::prelude::*;

pub use engine::{MetricAggregate, NGramAggregator, RadixTrie, SieveEngine, StreamingChunkFeeder};
pub use guard::{CollisionGuard, SafeListIndex};
pub use linguistics::{cluster_tokens, damerau_levenshtein, export_clusters_json, phonetic_code};
pub use matrix::evaluate_combinatorial_variations;
pub use schema::{detect_platform_schema, parse_localized_number, PlatformSchema, SchemaMapping};
pub use stats::{beta_cdf, calculate_beta_posterior, calculate_cpa_drag, calculate_wilson_score};
pub use tokenizer::tokenize_ngrams;

// -----------------------------------------------------------------------------
// WebAssembly Linear Memory Allocator ABI
// -----------------------------------------------------------------------------

/// Allocates linear WebAssembly memory with 8-byte alignment.
#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn allocate_buffer(size: usize) -> *mut u8 {
    if size == 0 {
        return core::ptr::null_mut();
    }
    let layout = match Layout::from_size_align(size, 8) {
        Ok(l) => l,
        Err(_) => return core::ptr::null_mut(),
    };
    // SAFETY: Layout validated above.
    unsafe { sys_alloc(layout) }
}

/// Deallocates linear WebAssembly memory previously allocated by `allocate_buffer`.
#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn deallocate_buffer(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }
    let layout = match Layout::from_size_align(size, 8) {
        Ok(l) => l,
        Err(_) => return,
    };
    // SAFETY: ptr allocated with identical 8-byte aligned layout.
    unsafe { sys_dealloc(ptr, layout) }
}

/// Aliases for backward compatibility
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    allocate_buffer(size)
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    deallocate_buffer(ptr, size);
}

// -----------------------------------------------------------------------------
// Platform Schema Sniffing ABI
// -----------------------------------------------------------------------------

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn detect_schema(ptr: *const u8, len: usize) -> u32 {
    if ptr.is_null() || len == 0 {
        return PlatformSchema::Unknown as u32;
    }
    // SAFETY: Pointer is valid for len bytes per caller contract.
    let slice = unsafe { core::slice::from_raw_parts(ptr, len) };
    detect_platform_schema(slice) as u32
}

// -----------------------------------------------------------------------------
// SieveEngine Lifecycle & Ingestion ABI
// -----------------------------------------------------------------------------

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn engine_new() -> *mut SieveEngine {
    Box::into_raw(Box::new(SieveEngine::new()))
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn engine_free(ptr: *mut SieveEngine) {
    if !ptr.is_null() {
        // SAFETY: Pointer originated from engine_new.
        unsafe {
            drop(Box::from_raw(ptr));
        }
    }
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn engine_reset(ptr: *mut SieveEngine) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        engine.reset();
    }
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn engine_ingest_chunk(
    ptr: *mut SieveEngine,
    chunk_ptr: *const u8,
    chunk_len: usize,
    is_final: i32,
) -> i32 {
    let engine = match unsafe { ptr.as_mut() } {
        Some(e) => e,
        None => return -1,
    };

    if chunk_ptr.is_null() && chunk_len > 0 {
        return -1;
    }

    let chunk = if chunk_len > 0 {
        unsafe { core::slice::from_raw_parts(chunk_ptr, chunk_len) }
    } else {
        &[]
    };

    engine.ingest_chunk(chunk, is_final != 0)
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn engine_export_ngram_metrics(
    ptr: *mut SieveEngine,
    n: usize,
    out_ptr: *mut u8,
    out_cap: usize,
) -> usize {
    let engine = match unsafe { ptr.as_mut() } {
        Some(e) => e,
        None => return 0,
    };

    if out_ptr.is_null() || out_cap == 0 {
        return 0;
    }

    let out_slice = unsafe { core::slice::from_raw_parts_mut(out_ptr, out_cap) };
    engine.export_ngram_metrics(n, out_slice)
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn engine_get_reporting_gap(
    ptr: *mut SieveEngine,
    gap_out_ptr: *mut f64,
) -> i32 {
    let engine = match unsafe { ptr.as_mut() } {
        Some(e) => e,
        None => return -1,
    };

    if gap_out_ptr.is_null() {
        return -1;
    }

    let mut gap = [0.0f64; 6];
    engine.write_reporting_gap(&mut gap);

    unsafe {
        for (i, &val) in gap.iter().enumerate() {
            *gap_out_ptr.add(i) = val;
        }
    }

    0
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn engine_detect_auction_collisions(
    ptr: *mut SieveEngine,
    out_ptr: *mut u8,
    out_cap: usize,
) -> usize {
    let engine = match unsafe { ptr.as_mut() } {
        Some(e) => e,
        None => return 0,
    };
    if out_ptr.is_null() || out_cap == 0 {
        return 0;
    }
    let out = unsafe { core::slice::from_raw_parts_mut(out_ptr, out_cap) };
    engine.detect_auction_collisions(out)
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn engine_detect_pmax_cannibalization(
    ptr: *mut SieveEngine,
    out_ptr: *mut u8,
    out_cap: usize,
) -> usize {
    let engine = match unsafe { ptr.as_mut() } {
        Some(e) => e,
        None => return 0,
    };
    if out_ptr.is_null() || out_cap == 0 {
        return 0;
    }
    let out = unsafe { core::slice::from_raw_parts_mut(out_ptr, out_cap) };
    engine.detect_pmax_cannibalization(out)
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn engine_export_query_records(
    ptr: *mut SieveEngine,
    out_ptr: *mut u8,
    out_cap: usize,
) -> usize {
    let engine = match unsafe { ptr.as_mut() } {
        Some(e) => e,
        None => return 0,
    };
    if out_ptr.is_null() || out_cap == 0 {
        return 0;
    }
    let out = unsafe { core::slice::from_raw_parts_mut(out_ptr, out_cap) };
    engine.export_query_records(out)
}

// -----------------------------------------------------------------------------
// Statistical Confidence & CPA Drag ABI
// -----------------------------------------------------------------------------

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn stats_calculate_wilson_score(
    trials: u64,
    successes: u64,
    z: f64,
    out_ptr: *mut f64,
) -> i32 {
    if out_ptr.is_null() {
        return -1;
    }
    let (lower, upper) = calculate_wilson_score(trials, successes, z);
    unsafe {
        *out_ptr = lower;
        *out_ptr.add(1) = upper;
    }
    0
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn stats_calculate_beta_posterior(
    trials: u64,
    successes: u64,
    prior_alpha: f64,
    prior_beta: f64,
    out_ptr: *mut f64,
) -> i32 {
    if out_ptr.is_null() {
        return -1;
    }
    let (post_alpha, post_beta, mean, var) =
        calculate_beta_posterior(trials, successes, prior_alpha, prior_beta);
    unsafe {
        *out_ptr = post_alpha;
        *out_ptr.add(1) = post_beta;
        *out_ptr.add(2) = mean;
        *out_ptr.add(3) = var;
    }
    0
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn stats_beta_cdf(a: f64, b: f64, x: f64) -> f64 {
    beta_cdf(a, b, x)
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn stats_calculate_cpa_drag(
    cost: f64,
    conversions: f64,
    target_cpa: f64,
    out_ptr: *mut f64,
) -> i32 {
    if out_ptr.is_null() {
        return -1;
    }
    let (realized_cpa, marginal_drag, waste_ratio) =
        calculate_cpa_drag(cost, conversions, target_cpa);
    unsafe {
        *out_ptr = realized_cpa;
        *out_ptr.add(1) = marginal_drag;
        *out_ptr.add(2) = waste_ratio;
    }
    0
}

// -----------------------------------------------------------------------------
// Safe-List Inversion & Collision Guard ABI
// -----------------------------------------------------------------------------

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn guard_new() -> *mut CollisionGuard {
    Box::into_raw(Box::new(CollisionGuard::new()))
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn guard_free(ptr: *mut CollisionGuard) {
    if !ptr.is_null() {
        unsafe {
            drop(Box::from_raw(ptr));
        }
    }
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn guard_add_safe_term(
    ptr: *mut CollisionGuard,
    term_ptr: *const u8,
    term_len: usize,
    conversions: f64,
) -> i32 {
    let guard = match unsafe { ptr.as_mut() } {
        Some(g) => g,
        None => return -1,
    };
    if term_ptr.is_null() || term_len == 0 {
        return -1;
    }
    let term = unsafe { core::slice::from_raw_parts(term_ptr, term_len) };
    guard.add_safe_term(term, conversions);
    0
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn guard_evaluate_negative(
    ptr: *mut CollisionGuard,
    cand_ptr: *const u8,
    cand_len: usize,
    out_ptr: *mut u8,
    out_cap: usize,
) -> usize {
    let guard = match unsafe { ptr.as_mut() } {
        Some(g) => g,
        None => return 0,
    };
    if cand_ptr.is_null() || cand_len == 0 || out_ptr.is_null() || out_cap == 0 {
        return 0;
    }
    let candidate = unsafe { core::slice::from_raw_parts(cand_ptr, cand_len) };
    let out = unsafe { core::slice::from_raw_parts_mut(out_ptr, out_cap) };
    guard.evaluate_negative_json(candidate, out)
}

// -----------------------------------------------------------------------------
// Linguistics: Damerau-Levenshtein, Phonetic & Clustering ABI
// -----------------------------------------------------------------------------

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn linguistics_damerau_levenshtein(
    s1_ptr: *const u8,
    s1_len: usize,
    s2_ptr: *const u8,
    s2_len: usize,
    max_distance: u32,
) -> u32 {
    let s1 = if s1_ptr.is_null() || s1_len == 0 {
        &[]
    } else {
        unsafe { core::slice::from_raw_parts(s1_ptr, s1_len) }
    };
    let s2 = if s2_ptr.is_null() || s2_len == 0 {
        &[]
    } else {
        unsafe { core::slice::from_raw_parts(s2_ptr, s2_len) }
    };
    damerau_levenshtein(s1, s2, max_distance)
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn linguistics_phonetic_code(
    src_ptr: *const u8,
    src_len: usize,
    out_ptr: *mut u8,
    out_cap: usize,
) -> usize {
    if src_ptr.is_null() || src_len == 0 || out_ptr.is_null() || out_cap == 0 {
        return 0;
    }
    let src = unsafe { core::slice::from_raw_parts(src_ptr, src_len) };
    let out = unsafe { core::slice::from_raw_parts_mut(out_ptr, out_cap) };
    phonetic_code(src, out)
}

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn linguistics_cluster_tokens(
    json_ptr: *const u8,
    json_len: usize,
    out_ptr: *mut u8,
    out_cap: usize,
) -> usize {
    if json_ptr.is_null() || json_len == 0 || out_ptr.is_null() || out_cap == 0 {
        return 0;
    }
    let json_bytes = unsafe { core::slice::from_raw_parts(json_ptr, json_len) };
    let out = unsafe { core::slice::from_raw_parts_mut(out_ptr, out_cap) };

    let mut tokens: Vec<&[u8]> = Vec::new();
    let mut in_str = false;
    let mut start = 0;
    for (i, &b) in json_bytes.iter().enumerate() {
        if b == b'"' {
            if in_str {
                tokens.push(&json_bytes[start..i]);
                in_str = false;
            } else {
                in_str = true;
                start = i + 1;
            }
        }
    }

    let clusters = cluster_tokens(&tokens);
    export_clusters_json(&clusters, out)
}

// -----------------------------------------------------------------------------
// Combinatorial Matrix Scale Benchmark ABI
// -----------------------------------------------------------------------------

#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn matrix_evaluate_combinatorial_scale(variations_count: usize) -> u32 {
    let tokens: &[&[u8]] = &[b"shoes", b"running", b"sneakers", b"boots", b"trail"];
    let (matches, _sum) = evaluate_combinatorial_variations(tokens, variations_count);
    matches as u32
}

// -----------------------------------------------------------------------------
// Legacy Phase 1 SievePipeline Support
// -----------------------------------------------------------------------------

#[repr(u32)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum FilterOp {
    PassThrough = 0,
    ExactMatch = 1,
    Contains = 2,
    StartsWith = 3,
    EndsWith = 4,
    ExactMatchCaseInsensitive = 5,
    ContainsCaseInsensitive = 6,
    NotEmpty = 7,
}

impl FilterOp {
    pub fn from_u32(val: u32) -> Self {
        match val {
            1 => FilterOp::ExactMatch,
            2 => FilterOp::Contains,
            3 => FilterOp::StartsWith,
            4 => FilterOp::EndsWith,
            5 => FilterOp::ExactMatchCaseInsensitive,
            6 => FilterOp::ContainsCaseInsensitive,
            7 => FilterOp::NotEmpty,
            _ => FilterOp::PassThrough,
        }
    }
}

#[inline(always)]
pub fn evaluate_predicate(field: &[u8], op: FilterOp, query: &[u8]) -> bool {
    match op {
        FilterOp::PassThrough => true,
        FilterOp::ExactMatch => field == query,
        FilterOp::Contains => {
            if query.is_empty() {
                true
            } else if query.len() > field.len() {
                false
            } else {
                field.windows(query.len()).any(|window| window == query)
            }
        }
        FilterOp::StartsWith => field.starts_with(query),
        FilterOp::EndsWith => field.ends_with(query),
        FilterOp::ExactMatchCaseInsensitive => {
            if field.len() != query.len() {
                false
            } else {
                field
                    .iter()
                    .zip(query.iter())
                    .all(|(&a, &b)| a.eq_ignore_ascii_case(&b))
            }
        }
        FilterOp::ContainsCaseInsensitive => {
            if query.is_empty() {
                true
            } else if query.len() > field.len() {
                false
            } else {
                field.windows(query.len()).any(|window| {
                    window
                        .iter()
                        .zip(query.iter())
                        .all(|(&a, &b)| a.eq_ignore_ascii_case(&b))
                })
            }
        }
        FilterOp::NotEmpty => !field.is_empty(),
    }
}

const MAX_RECORD_OUTPUT_BUFFER: usize = 64 * 1024;
const MAX_RECORD_FIELDS: usize = 1024;
const MAX_QUERY_LEN: usize = 256;

pub struct SievePipeline {
    reader: Reader,
    filter_col: u32,
    filter_op: FilterOp,
    query_buffer: [u8; MAX_QUERY_LEN],
    query_len: usize,
    record_scratch: Box<[u8; MAX_RECORD_OUTPUT_BUFFER]>,
    field_ends_scratch: Box<[usize; MAX_RECORD_FIELDS]>,
    total_records: u64,
    matched_records: u64,
    bytes_consumed: u64,
    bytes_written: u64,
}

impl Default for SievePipeline {
    fn default() -> Self {
        Self::new()
    }
}

impl SievePipeline {
    pub fn new() -> Self {
        Self {
            reader: ReaderBuilder::new().build(),
            filter_col: 0,
            filter_op: FilterOp::PassThrough,
            query_buffer: [0u8; MAX_QUERY_LEN],
            query_len: 0,
            record_scratch: Box::new([0u8; MAX_RECORD_OUTPUT_BUFFER]),
            field_ends_scratch: Box::new([0usize; MAX_RECORD_FIELDS]),
            total_records: 0,
            matched_records: 0,
            bytes_consumed: 0,
            bytes_written: 0,
        }
    }

    pub fn reset(&mut self) {
        self.reader = ReaderBuilder::new().build();
        self.total_records = 0;
        self.matched_records = 0;
        self.bytes_consumed = 0;
        self.bytes_written = 0;
    }

    pub fn set_filter(&mut self, col: u32, op: FilterOp, query: &[u8]) {
        self.filter_col = col;
        self.filter_op = op;
        let copy_len = query.len().min(MAX_QUERY_LEN);
        self.query_buffer[..copy_len].copy_from_slice(&query[..copy_len]);
        self.query_len = copy_len;
    }

    pub fn process_chunk(&mut self, mut input: &[u8], output: &mut [u8]) -> (i32, usize, usize) {
        let mut total_in = 0;
        let mut total_out = 0;
        let query_slice = &self.query_buffer[..self.query_len];

        while !input.is_empty() {
            let (result, bytes_in, _bytes_out, ends_out) = self.reader.read_record(
                input,
                &mut self.record_scratch[..],
                &mut self.field_ends_scratch[..],
            );

            match result {
                ReadRecordResult::Record => {
                    let raw_record = &input[..bytes_in];
                    self.total_records += 1;

                    let is_match = if self.filter_op == FilterOp::PassThrough {
                        true
                    } else {
                        let target_col = self.filter_col as usize;
                        if target_col < ends_out {
                            let start = if target_col == 0 {
                                0
                            } else {
                                self.field_ends_scratch[target_col - 1]
                            };
                            let end = self.field_ends_scratch[target_col];
                            let field = &self.record_scratch[start..end];
                            evaluate_predicate(field, self.filter_op, query_slice)
                        } else {
                            false
                        }
                    };

                    if is_match {
                        self.matched_records += 1;
                        if total_out + raw_record.len() > output.len() {
                            return (0, total_in, total_out);
                        }
                        output[total_out..total_out + raw_record.len()].copy_from_slice(raw_record);
                        total_out += raw_record.len();
                        self.bytes_written += raw_record.len() as u64;
                    }

                    input = &input[bytes_in..];
                    total_in += bytes_in;
                    self.bytes_consumed += bytes_in as u64;
                }
                ReadRecordResult::InputEmpty => {
                    total_in += bytes_in;
                    self.bytes_consumed += bytes_in as u64;
                    break;
                }
                ReadRecordResult::OutputFull | ReadRecordResult::OutputEndsFull => {
                    return (-2, total_in, total_out);
                }
                ReadRecordResult::End => {
                    total_in += bytes_in;
                    self.bytes_consumed += bytes_in as u64;
                    return (1, total_in, total_out);
                }
            }
        }

        (0, total_in, total_out)
    }
}

#[no_mangle]
pub extern "C" fn sieve_pipeline_new() -> *mut SievePipeline {
    Box::into_raw(Box::new(SievePipeline::new()))
}

#[no_mangle]
pub extern "C" fn sieve_pipeline_free(ptr: *mut SievePipeline) {
    if !ptr.is_null() {
        unsafe { drop(Box::from_raw(ptr)) }
    }
}

#[no_mangle]
pub extern "C" fn sieve_pipeline_reset(ptr: *mut SievePipeline) {
    if let Some(p) = unsafe { ptr.as_mut() } {
        p.reset();
    }
}

#[no_mangle]
pub extern "C" fn sieve_pipeline_set_filter(
    ptr: *mut SievePipeline,
    col: u32,
    op: u32,
    query_ptr: *const u8,
    query_len: usize,
) -> i32 {
    let pipeline = match unsafe { ptr.as_mut() } {
        Some(p) => p,
        None => return -1,
    };
    let query_slice = if query_len > 0 && !query_ptr.is_null() {
        unsafe { core::slice::from_raw_parts(query_ptr, query_len) }
    } else {
        &[]
    };
    pipeline.set_filter(col, FilterOp::from_u32(op), query_slice);
    0
}

#[no_mangle]
pub extern "C" fn sieve_pipeline_process_chunk(
    ptr: *mut SievePipeline,
    input_ptr: *const u8,
    input_len: usize,
    output_ptr: *mut u8,
    output_cap: usize,
    stats_out_ptr: *mut u64,
) -> i32 {
    let pipeline = match unsafe { ptr.as_mut() } {
        Some(p) => p,
        None => return -1,
    };

    let input_slice = if input_len > 0 && !input_ptr.is_null() {
        unsafe { core::slice::from_raw_parts(input_ptr, input_len) }
    } else {
        &[]
    };

    let output_slice = if output_cap > 0 && !output_ptr.is_null() {
        unsafe { core::slice::from_raw_parts_mut(output_ptr, output_cap) }
    } else {
        &mut []
    };

    let (status, bytes_in, bytes_out) = pipeline.process_chunk(input_slice, output_slice);

    if !stats_out_ptr.is_null() {
        unsafe {
            *stats_out_ptr.add(0) = pipeline.total_records;
            *stats_out_ptr.add(1) = pipeline.matched_records;
            *stats_out_ptr.add(2) = bytes_in as u64;
            *stats_out_ptr.add(3) = bytes_out as u64;
        }
    }

    status
}

#[no_mangle]
pub extern "C" fn sieve_filter_csv(
    input_ptr: *const u8,
    input_len: usize,
    col: u32,
    op: u32,
    query_ptr: *const u8,
    query_len: usize,
    output_ptr: *mut u8,
    output_cap: usize,
    stats_out_ptr: *mut u64,
) -> i32 {
    let mut pipeline = SievePipeline::new();
    let query_slice = if query_len > 0 && !query_ptr.is_null() {
        unsafe { core::slice::from_raw_parts(query_ptr, query_len) }
    } else {
        &[]
    };
    pipeline.set_filter(col, FilterOp::from_u32(op), query_slice);

    let input_slice = if input_len > 0 && !input_ptr.is_null() {
        unsafe { core::slice::from_raw_parts(input_ptr, input_len) }
    } else {
        &[]
    };

    let output_slice = if output_cap > 0 && !output_ptr.is_null() {
        unsafe { core::slice::from_raw_parts_mut(output_ptr, output_cap) }
    } else {
        &mut []
    };

    let (status, bytes_in, bytes_out) = pipeline.process_chunk(input_slice, output_slice);

    if !stats_out_ptr.is_null() {
        unsafe {
            *stats_out_ptr.add(0) = pipeline.total_records;
            *stats_out_ptr.add(1) = pipeline.matched_records;
            *stats_out_ptr.add(2) = bytes_in as u64;
            *stats_out_ptr.add(3) = bytes_out as u64;
        }
    }

    status
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    wasm_bindgen_test_configure!(run_in_browser);

    #[test]
    #[wasm_bindgen_test]
    fn test_memory_allocation() {
        let size = 2048;
        let ptr = allocate_buffer(size);
        assert!(!ptr.is_null());
        assert_eq!(ptr as usize % 8, 0);
        deallocate_buffer(ptr, size);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_platform_schema_detection() {
        let google = b"Search keyword,Clicks,Cost,Conversions\n";
        assert_eq!(detect_schema(google.as_ptr(), google.len()), 1);

        let amazon = b"Customer Search Term,Impressions,Clicks,Spend\n";
        assert_eq!(detect_schema(amazon.as_ptr(), amazon.len()), 2);

        // Real-world multi-line Google Ads export header
        let google_multiline = b"Search terms report\nOct 1, 2024 - Oct 31, 2024\n\nSearch term,Campaign,Ad group,Clicks,Cost,Conversions\n\"running shoes\",Camp 1,Adg 1,15,30.00,0\n";
        assert_eq!(detect_schema(google_multiline.as_ptr(), google_multiline.len()), 1);

        let engine = engine_new();
        assert!(!engine.is_null());
        let status = engine_ingest_chunk(engine, google_multiline.as_ptr(), google_multiline.len(), 1);
        assert_eq!(status, 0);

        let mut out_buf = [0u8; 1024];
        let written = engine_export_query_records(engine, out_buf.as_mut_ptr(), out_buf.len());
        assert!(written > 0);
        let json_str = core::str::from_utf8(&out_buf[..written]).unwrap();
        assert!(json_str.contains("running shoes"));
        assert!(json_str.contains("Camp 1"));
        engine_free(engine);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_engine_aggregation_and_reporting_gap() {
        let engine = engine_new();
        assert!(!engine.is_null());

        let csv = b"Search keyword,Clicks,Cost,Conversions\n\"running shoes\",10,\"20.00\",2\n\"Total: Account\",25,\"50.00\",5\n";
        let status = engine_ingest_chunk(engine, csv.as_ptr(), csv.len(), 1);
        assert_eq!(status, 0);

        let mut gap = [0.0f64; 6];
        engine_get_reporting_gap(engine, gap.as_mut_ptr());
        assert_eq!(gap[0], 25.0); // summary_clicks
        assert_eq!(gap[1], 10.0); // aggregated_clicks
        assert_eq!(gap[2], 15.0); // gap_clicks

        engine_free(engine);
    }
}
