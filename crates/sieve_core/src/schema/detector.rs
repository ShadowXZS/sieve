//! Platform schema detection and localized number parsing.
//!
//! Architectural Guarantees:
//! - Streaming header sniffing across Google Ads, Amazon PPC, and Microsoft Advertising.
//! - UTF-16LE Byte Order Mark (BOM) handling without heap allocation.
//! - Direct &[u8] parsing for localized currency markers and comma decimals.

#[repr(u32)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum PlatformSchema {
    Unknown = 0,
    GoogleAds = 1,
    AmazonPPC = 2,
    MicrosoftAdvertising = 3,
}

#[derive(Copy, Clone, Debug)]
pub struct SchemaMapping {
    pub schema: PlatformSchema,
    pub query_col: usize,
    pub clicks_col: usize,
    pub cost_col: usize,
    pub conversions_col: usize,
    pub campaign_col: usize,
    pub adgroup_col: usize,
    pub has_campaign: bool,
    pub has_adgroup: bool,
}

impl Default for SchemaMapping {
    fn default() -> Self {
        Self {
            schema: PlatformSchema::Unknown,
            query_col: 0,
            clicks_col: 1,
            cost_col: 2,
            conversions_col: 3,
            campaign_col: usize::MAX,
            adgroup_col: usize::MAX,
            has_campaign: false,
            has_adgroup: false,
        }
    }
}

/// Helper function to check if haystack contains needle case-insensitively on &[u8].
#[inline(always)]
pub fn contains_ignore_case(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() {
        return true;
    }
    if needle.len() > haystack.len() {
        return false;
    }
    haystack.windows(needle.len()).any(|window| {
        window
            .iter()
            .zip(needle.iter())
            .all(|(&a, &b)| a.eq_ignore_ascii_case(&b))
    })
}

/// Helper function to check if haystack starts with needle case-insensitively on &[u8].
#[inline(always)]
pub fn starts_with_ignore_case(haystack: &[u8], needle: &[u8]) -> bool {
    if haystack.len() < needle.len() {
        return false;
    }
    haystack[..needle.len()]
        .iter()
        .zip(needle.iter())
        .all(|(&a, &b)| a.eq_ignore_ascii_case(&b))
}

/// Helper function to check equality case-insensitively on &[u8].
#[inline(always)]
pub fn equals_ignore_case(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).all(|(&x, &y)| x.eq_ignore_ascii_case(&y))
}

#[inline(always)]
fn trim_field(field: &[u8]) -> &[u8] {
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
    while slice.starts_with(b" ") || slice.starts_with(b"\t") {
        slice = &slice[1..];
    }
    while slice.ends_with(b" ") || slice.ends_with(b"\t") {
        slice = &slice[..slice.len() - 1];
    }
    slice
}

/// Scans streaming CSV lines and returns the byte offset where the recognized column definition row begins.
/// Skips initial preamble metadata rows (e.g., "Search terms report", date ranges, account identifiers).
pub fn find_header_row_offset(bytes: &[u8]) -> usize {
    let mut offset = 0;
    let mut slice = bytes;

    // Skip UTF-8 BOM if present
    if slice.len() >= 3 && slice[0] == 0xEF && slice[1] == 0xBB && slice[2] == 0xBF {
        offset += 3;
        slice = &slice[3..];
    }

    while !slice.is_empty() {
        let line_end = memchr::memchr(b'\n', slice).unwrap_or(slice.len());
        let mut line = &slice[..line_end];
        if line.ends_with(b"\r") {
            line = &line[..line.len() - 1];
        }

        let has_query = contains_ignore_case(line, b"search term")
            || contains_ignore_case(line, b"customer search term")
            || contains_ignore_case(line, b"search query")
            || contains_ignore_case(line, b"search keyword")
            || contains_ignore_case(line, b"keyword")
            || contains_ignore_case(line, b"query");

        let has_metric = contains_ignore_case(line, b"clicks")
            || contains_ignore_case(line, b"cost")
            || contains_ignore_case(line, b"spend")
            || contains_ignore_case(line, b"impressions")
            || contains_ignore_case(line, b"conversions")
            || contains_ignore_case(line, b"all conv.")
            || contains_ignore_case(line, b"7 day total sales");

        if has_query && has_metric {
            return offset;
        }

        if line_end < slice.len() {
            offset += line_end + 1;
            slice = &slice[line_end + 1..];
        } else {
            break;
        }
    }

    0
}

/// Detects advertising platform schema from streaming header bytes.
pub fn detect_platform_schema(mut header_bytes: &[u8]) -> PlatformSchema {
    if header_bytes.is_empty() {
        return PlatformSchema::Unknown;
    }

    // Strip UTF-8 BOM: [0xEF, 0xBB, 0xBF]
    if header_bytes.len() >= 3 && header_bytes[0] == 0xEF && header_bytes[1] == 0xBB && header_bytes[2] == 0xBF {
        header_bytes = &header_bytes[3..];
    }

    // Check for UTF-16LE BOM: [0xFF, 0xFE]
    if header_bytes.len() >= 2 && header_bytes[0] == 0xFF && header_bytes[1] == 0xFE {
        let utf16_slice = &header_bytes[2..];
        let mut ascii_buf = [0u8; 2048];
        let mut count = 0;
        let mut i = 0;
        while i + 1 < utf16_slice.len() && count < ascii_buf.len() {
            let low = utf16_slice[i];
            let high = utf16_slice[i + 1];
            if high == 0 {
                ascii_buf[count] = low;
                count += 1;
            }
            i += 2;
        }
        let ascii_header = &ascii_buf[..count];
        return detect_ascii_schema(ascii_header);
    }

    // Check for UTF-16BE BOM: [0xFE, 0xFF]
    if header_bytes.len() >= 2 && header_bytes[0] == 0xFE && header_bytes[1] == 0xFF {
        let utf16_slice = &header_bytes[2..];
        let mut ascii_buf = [0u8; 2048];
        let mut count = 0;
        let mut i = 0;
        while i + 1 < utf16_slice.len() && count < ascii_buf.len() {
            let high = utf16_slice[i];
            let low = utf16_slice[i + 1];
            if high == 0 {
                ascii_buf[count] = low;
                count += 1;
            }
            i += 2;
        }
        let ascii_header = &ascii_buf[..count];
        return detect_ascii_schema(ascii_header);
    }

    // Sniff across the header chunk (up to 4KB) to support multi-line report headers
    let sniff_len = header_bytes.len().min(4096);
    detect_ascii_schema(&header_bytes[..sniff_len])
}

fn detect_ascii_schema(header: &[u8]) -> PlatformSchema {
    // Amazon PPC signature
    if contains_ignore_case(header, b"customer search term")
        || contains_ignore_case(header, b"7 day total sales")
        || (contains_ignore_case(header, b"targeting") && contains_ignore_case(header, b"spend"))
    {
        return PlatformSchema::AmazonPPC;
    }

    // Microsoft Advertising signature
    if contains_ignore_case(header, b"all conv.")
        || (contains_ignore_case(header, b"search term") && contains_ignore_case(header, b"spend"))
    {
        return PlatformSchema::MicrosoftAdvertising;
    }

    // Google Ads signature (including multi-line reports with "Search terms report", "Search term", etc.)
    if contains_ignore_case(header, b"search terms report")
        || contains_ignore_case(header, b"search keyword")
        || contains_ignore_case(header, b"search query")
        || (contains_ignore_case(header, b"search term") && contains_ignore_case(header, b"cost"))
        || (contains_ignore_case(header, b"keyword") && contains_ignore_case(header, b"cost"))
        || contains_ignore_case(header, b"google ads")
    {
        return PlatformSchema::GoogleAds;
    }

    // Fallback for Microsoft Advertising if it has search term without cost
    if contains_ignore_case(header, b"search term") {
        return PlatformSchema::MicrosoftAdvertising;
    }

    PlatformSchema::Unknown
}

/// Resolves column indices for the given platform schema from header fields.
pub fn resolve_schema_mapping(fields: &[&[u8]]) -> SchemaMapping {
    let mut mapping = SchemaMapping::default();
    let mut query_priority = 0;
    let mut clicks_priority = 0;
    let mut cost_priority = 0;
    let mut conv_priority = 0;

    for (idx, &raw_field) in fields.iter().enumerate() {
        let field = trim_field(raw_field);

        // Query column resolution with priority
        if contains_ignore_case(field, b"customer search term")
            || contains_ignore_case(field, b"search query")
            || contains_ignore_case(field, b"search term")
        {
            if query_priority <= 3 {
                mapping.query_col = idx;
                query_priority = 3;
            }
        } else if contains_ignore_case(field, b"search keyword") {
            if query_priority < 2 {
                mapping.query_col = idx;
                query_priority = 2;
            }
        } else if contains_ignore_case(field, b"keyword") || contains_ignore_case(field, b"query") {
            if query_priority < 1 {
                mapping.query_col = idx;
                query_priority = 1;
            }
        }

        // Clicks column resolution: avoid CTR / rate / cost / cpc
        let is_click_candidate = contains_ignore_case(field, b"click")
            && !contains_ignore_case(field, b"rate")
            && !contains_ignore_case(field, b"ctr")
            && !contains_ignore_case(field, b"cost")
            && !contains_ignore_case(field, b"cpc")
            && !contains_ignore_case(field, b"thru")
            && !contains_ignore_case(field, b"through");

        if is_click_candidate {
            let priority = if equals_ignore_case(field, b"clicks") {
                3
            } else if equals_ignore_case(field, b"total clicks") {
                2
            } else {
                1
            };
            if priority > clicks_priority {
                mapping.clicks_col = idx;
                clicks_priority = priority;
            }
        }

        // Cost / Spend column resolution: avoid Cost / conv, Cost per click, Avg CPC, etc.
        let is_cost_candidate = (contains_ignore_case(field, b"cost") || contains_ignore_case(field, b"spend"))
            && !contains_ignore_case(field, b"conv")
            && !contains_ignore_case(field, b"click")
            && !contains_ignore_case(field, b"cpc")
            && !contains_ignore_case(field, b"ctr")
            && !contains_ignore_case(field, b"rate")
            && !contains_ignore_case(field, b"avg")
            && !contains_ignore_case(field, b"margin");

        if is_cost_candidate {
            let priority = if equals_ignore_case(field, b"cost") || equals_ignore_case(field, b"spend") {
                3
            } else if equals_ignore_case(field, b"total cost") || equals_ignore_case(field, b"total spend") {
                2
            } else {
                1
            };
            if priority > cost_priority {
                mapping.cost_col = idx;
                cost_priority = priority;
            }
        }

        // Conversions column resolution: avoid Cost / conv, Conv. value, Conversion rate, CPA, etc.
        let is_conv_candidate = (contains_ignore_case(field, b"conversions")
            || contains_ignore_case(field, b"all conv.")
            || contains_ignore_case(field, b"7 day total sales")
            || equals_ignore_case(field, b"conv.")
            || equals_ignore_case(field, b"conv"))
            && !contains_ignore_case(field, b"cost")
            && !contains_ignore_case(field, b"rate")
            && !contains_ignore_case(field, b"val")
            && !contains_ignore_case(field, b"cpa")
            && !contains_ignore_case(field, b"per");

        if is_conv_candidate {
            let priority = if equals_ignore_case(field, b"conversions")
                || equals_ignore_case(field, b"all conv.")
                || equals_ignore_case(field, b"7 day total sales")
            {
                3
            } else if equals_ignore_case(field, b"total conversions") {
                2
            } else {
                1
            };
            if priority > conv_priority {
                mapping.conversions_col = idx;
                conv_priority = priority;
            }
        }

        if contains_ignore_case(field, b"campaign") && !contains_ignore_case(field, b"id") {
            mapping.campaign_col = idx;
            mapping.has_campaign = true;
        } else if (contains_ignore_case(field, b"ad group")
            || contains_ignore_case(field, b"adgroup")
            || contains_ignore_case(field, b"asset group"))
            && !contains_ignore_case(field, b"id")
        {
            mapping.adgroup_col = idx;
            mapping.has_adgroup = true;
        }
    }

    mapping
}

/// Parses a localized numeric or currency byte slice into an f64.
/// Handles: "$1,234.56", "12,50 €", "£120.00", "1 234,56", "24.50", "12", etc.
/// Zero dynamic allocations.
#[inline(always)]
pub fn parse_localized_number(mut input: &[u8]) -> f64 {
    // Fast path: strip leading spaces, currency and quotes
    while let Some(&first) = input.first() {
        if first == b' ' || first == b'"' || first == b'$' || first == b'\'' {
            input = &input[1..];
        } else {
            break;
        }
    }
    while let Some(&last) = input.last() {
        if last == b' ' || last == b'"' || last == b'\'' {
            input = &input[..input.len() - 1];
        } else {
            break;
        }
    }

    if input.is_empty() {
        return 0.0;
    }

    // Fast-path: check if input is standard clean ASCII float e.g. "24.50" or "12"
    let mut is_simple = true;
    let mut dot_pos = None;
    for (i, &b) in input.iter().enumerate() {
        if b.is_ascii_digit() {
            continue;
        } else if b == b'.' && dot_pos.is_none() {
            dot_pos = Some(i);
        } else {
            is_simple = false;
            break;
        }
    }

    if is_simple {
        if let Some(pos) = dot_pos {
            let mut int_val = 0u64;
            for &b in &input[..pos] {
                int_val = int_val * 10 + (b - b'0') as u64;
            }
            let mut frac_val = 0u64;
            let mut div = 1.0f64;
            for &b in &input[pos + 1..] {
                frac_val = frac_val * 10 + (b - b'0') as u64;
                div *= 10.0;
            }
            return (int_val as f64) + (frac_val as f64) / div;
        } else {
            let mut int_val = 0u64;
            for &b in input {
                int_val = int_val * 10 + (b - b'0') as u64;
            }
            return int_val as f64;
        }
    }

    // Localized fallback path (comma as decimal, thousand separators, currency symbols)
    let mut buf = [0u8; 64];
    let mut len = 0;
    let mut has_comma = false;
    let mut has_dot = false;
    let mut last_comma_idx = 0;
    let mut last_dot_idx = 0;

    for &b in input {
        if b.is_ascii_digit() {
            if len < buf.len() {
                buf[len] = b;
                len += 1;
            }
        } else if b == b',' {
            has_comma = true;
            last_comma_idx = len;
            if len < buf.len() {
                buf[len] = b',';
                len += 1;
            }
        } else if b == b'.' {
            has_dot = true;
            last_dot_idx = len;
            if len < buf.len() {
                buf[len] = b'.';
                len += 1;
            }
        } else if b == b'-' && len == 0 {
            buf[len] = b'-';
            len += 1;
        }
    }

    if len == 0 {
        return 0.0;
    }

    let cleaned = &buf[..len];

    let is_comma_decimal = if has_comma && has_dot {
        last_comma_idx > last_dot_idx
    } else if has_comma {
        let digits_after_comma = len - 1 - last_comma_idx;
        digits_after_comma <= 3
    } else {
        false
    };

    let mut integer_part: f64 = 0.0;
    let mut fraction_part: f64 = 0.0;
    let mut fraction_divisor: f64 = 1.0;
    let mut in_fraction = false;
    let is_negative = cleaned[0] == b'-';
    let start_idx = if is_negative { 1 } else { 0 };

    for &b in &cleaned[start_idx..] {
        if b.is_ascii_digit() {
            let digit = (b - b'0') as f64;
            if !in_fraction {
                integer_part = integer_part * 10.0 + digit;
            } else {
                fraction_divisor *= 10.0;
                fraction_part += digit / fraction_divisor;
            }
        } else if (b == b',' && is_comma_decimal) || (b == b'.' && !is_comma_decimal) {
            in_fraction = true;
        }
    }

    let result = integer_part + fraction_part;
    if is_negative {
        -result
    } else {
        result
    }
}
