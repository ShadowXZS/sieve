//! Stateful CSV chunk streaming engine.
//!
//! Architectural Guarantees:
//! - Stateful chunk feeding with csv-core zero-allocation parser.
//! - Preserves unparsed line fragments across chunk boundaries.
//! - Bounded linear memory usage without monolithic allocations.

use csv_core::{Reader, ReaderBuilder, ReadRecordResult};

pub struct StreamingChunkFeeder {
    reader: Reader,
    remainder: Vec<u8>,
    record_buf: Vec<u8>,
    ends_buf: Vec<usize>,
    total_records: u64,
}

impl Default for StreamingChunkFeeder {
    fn default() -> Self {
        Self::new()
    }
}

impl StreamingChunkFeeder {
    pub fn new() -> Self {
        Self {
            reader: ReaderBuilder::new().build(),
            remainder: Vec::with_capacity(4096),
            record_buf: vec![0u8; 64 * 1024],
            ends_buf: vec![0usize; 128],
            total_records: 0,
        }
    }

    pub fn reset(&mut self) {
        self.reader = ReaderBuilder::new().build();
        self.remainder.clear();
        self.total_records = 0;
    }

    pub fn remainder(&self) -> &[u8] {
        &self.remainder
    }

    pub fn total_records(&self) -> u64 {
        self.total_records
    }

    /// Feeds a chunk into the streaming feeder. Preserves incomplete lines across chunk boundaries.
    /// Calls `on_record` for each complete parsed record `(record_bytes, field_ends)`.
    pub fn feed_chunk<F>(&mut self, chunk: &[u8], is_final: bool, mut on_record: F) -> usize
    where
        F: FnMut(&[u8], &[usize]),
    {
        if chunk.is_empty() {
            if is_final && !self.remainder.is_empty() {
                let remainder_copy = core::mem::take(&mut self.remainder);
                self.process_slice(&remainder_copy, true, on_record);
            }
            return 0;
        }

        // If we have unparsed bytes from a previous chunk, glue them with the start of current chunk
        let mut rest_of_chunk = chunk;
        if !self.remainder.is_empty() {
            if let Some(pos) = memchr::memchr(b'\n', chunk) {
                self.remainder.extend_from_slice(&chunk[..=pos]);
                let complete_line = core::mem::take(&mut self.remainder);
                self.process_slice(&complete_line, true, &mut on_record);
                rest_of_chunk = &chunk[pos + 1..];
            } else {
                self.remainder.extend_from_slice(chunk);
                if is_final {
                    let complete_line = core::mem::take(&mut self.remainder);
                    self.process_slice(&complete_line, true, &mut on_record);
                }
                return 0;
            }
        }

        if rest_of_chunk.is_empty() {
            return 0;
        }

        if !is_final {
            if let Some(last_nl) = memchr::memrchr(b'\n', rest_of_chunk) {
                let complete_part = &rest_of_chunk[..=last_nl];
                let trailing = &rest_of_chunk[last_nl + 1..];
                self.remainder.extend_from_slice(trailing);
                self.process_slice(complete_part, false, on_record)
            } else {
                self.remainder.extend_from_slice(rest_of_chunk);
                0
            }
        } else {
            self.process_slice(rest_of_chunk, true, on_record)
        }
    }

    fn process_slice<F>(&mut self, mut slice: &[u8], is_final_slice: bool, mut on_record: F) -> usize
    where
        F: FnMut(&[u8], &[usize]),
    {
        let mut processed_records = 0;
        while !slice.is_empty() {
            let (result, bytes_in, _bytes_out, ends_out) = self.reader.read_record(
                slice,
                &mut self.record_buf,
                &mut self.ends_buf,
            );

            match result {
                ReadRecordResult::Record => {
                    let end_pos = if ends_out > 0 {
                        self.ends_buf[ends_out - 1]
                    } else {
                        0
                    };
                    let record_slice = &self.record_buf[..end_pos];
                    let field_ends = &self.ends_buf[..ends_out];
                    on_record(record_slice, field_ends);
                    self.total_records += 1;
                    processed_records += 1;
                    slice = &slice[bytes_in..];
                }
                ReadRecordResult::InputEmpty => {
                    if !is_final_slice && bytes_in < slice.len() {
                        self.remainder.extend_from_slice(&slice[bytes_in..]);
                    }
                    break;
                }
                ReadRecordResult::OutputFull | ReadRecordResult::OutputEndsFull => {
                    self.record_buf.resize(self.record_buf.len() * 2, 0);
                    self.ends_buf.resize(self.ends_buf.len() * 2, 0);
                }
                ReadRecordResult::End => {
                    break;
                }
            }
        }
        processed_records
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_streaming_chunk_boundary_preservation() {
        let mut feeder = StreamingChunkFeeder::new();
        let mut record_count = 0;

        // Feed chunk 1: ends in middle of second row
        let chunk1 = b"term,clicks,cost\n\"running shoes\",10,20.00\n\"ski ";
        feeder.feed_chunk(chunk1, false, |_rec, _ends| {
            record_count += 1;
        });

        assert_eq!(record_count, 2); // header and first record
        assert_eq!(feeder.remainder(), b"\"ski ");

        // Feed chunk 2: finishes second row and gives third row
        let chunk2 = b"boots\",5,15.00\n\"jackets\",3,30.00\n";
        feeder.feed_chunk(chunk2, true, |_rec, _ends| {
            record_count += 1;
        });

        assert_eq!(record_count, 4);
        assert_eq!(feeder.remainder(), b"");
    }
}

