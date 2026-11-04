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

/// Detects advertising platform schema from streaming header bytes.
pub fn detect_platform_schema(header_bytes: &[u8]) -> PlatformSchema {
    if header_bytes.is_empty() {
        return PlatformSchema::Unknown;
    }

    // Check for UTF-16LE BOM: [0xFF, 0xFE]
    if header_bytes.len() >= 2 && header_bytes[0] == 0xFF && header_bytes[1] == 0xFE {
        let utf16_slice = &header_bytes[2..];
        let mut ascii_buf = [0u8; 1024];
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

    let first_line_end = header_bytes
        .iter()
        .position(|&b| b == b'\n' || b == b'\r')
        .unwrap_or(header_bytes.len());
    let header_line = &header_bytes[..first_line_end];

    detect_ascii_schema(header_line)
}

fn detect_ascii_schema(header: &[u8]) -> PlatformSchema {
    // Amazon PPC signature
    if contains_ignore_case(header, b"customer search term")
        || contains_ignore_case(header, b"7 day total sales")
        || (contains_ignore_case(header, b"targeting") && contains_ignore_case(header, b"spend"))
    {
        return PlatformSchema::AmazonPPC;
    }

    // Google Ads signature
    if contains_ignore_case(header, b"search keyword")
        || contains_ignore_case(header, b"search query")
        || (contains_ignore_case(header, b"keyword") && contains_ignore_case(header, b"cost"))
    {
        return PlatformSchema::GoogleAds;
    }

    // Microsoft Advertising signature
    if contains_ignore_case(header, b"search term")
        || contains_ignore_case(header, b"all conv.")
    {
        return PlatformSchema::MicrosoftAdvertising;
    }

    PlatformSchema::Unknown
}

/// Resolves column indices for the given platform schema from header fields.
pub fn resolve_schema_mapping(fields: &[&[u8]]) -> SchemaMapping {
    let mut mapping = SchemaMapping::default();

    for (idx, &field) in fields.iter().enumerate() {
        if contains_ignore_case(field, b"search keyword")
            || contains_ignore_case(field, b"search query")
            || contains_ignore_case(field, b"customer search term")
            || contains_ignore_case(field, b"search term")
            || contains_ignore_case(field, b"keyword")
        {
            mapping.query_col = idx;
        } else if contains_ignore_case(field, b"clicks") {
            mapping.clicks_col = idx;
        } else if contains_ignore_case(field, b"cost")
            || contains_ignore_case(field, b"spend")
        {
            mapping.cost_col = idx;
        } else if contains_ignore_case(field, b"conversions")
            || contains_ignore_case(field, b"all conv.")
            || contains_ignore_case(field, b"7 day total sales")
        {
            mapping.conversions_col = idx;
        } else if contains_ignore_case(field, b"campaign") {
            mapping.campaign_col = idx;
            mapping.has_campaign = true;
        } else if contains_ignore_case(field, b"ad group")
            || contains_ignore_case(field, b"adgroup")
            || contains_ignore_case(field, b"asset group")
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
