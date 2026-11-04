//! In-Engine Currency Symbol and Locale Parser (Phase 9)
//!
//! Architectural Guarantees:
//! - Streaming &[u8] detection across advertising CSV reports (Google Ads, Amazon PPC, Microsoft).
//! - Strictly supports: Dollar ($), Inr (₹), Eur (€), Jpy (¥), and Gbp (£).
//! - Zero dynamic heap allocations in parsing routines.

#[repr(u32)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum CurrencySymbol {
    Unknown = 0,
    Dollar = 1, // $
    Inr = 2,    // ₹
    Eur = 3,    // €
    Jpy = 4,    // ¥
    Gbp = 5,    // £
}

impl CurrencySymbol {
    #[inline]
    pub fn as_str(&self) -> &'static str {
        match self {
            CurrencySymbol::Dollar => "$",
            CurrencySymbol::Inr => "₹",
            CurrencySymbol::Eur => "€",
            CurrencySymbol::Jpy => "¥",
            CurrencySymbol::Gbp => "£",
            CurrencySymbol::Unknown => "$",
        }
    }

    #[inline]
    pub fn default_decimals(&self) -> u32 {
        match self {
            CurrencySymbol::Jpy => 0,
            _ => 2,
        }
    }
}

/// Helper function to check if haystack contains needle case-insensitively on &[u8].
#[inline(always)]
fn contains_ignore_case(haystack: &[u8], needle: &[u8]) -> bool {
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

/// Sniffs a byte slice for localized currency symbols or platform currency headers.
pub fn parse_currency_symbol(mut bytes: &[u8]) -> CurrencySymbol {
    if bytes.is_empty() {
        return CurrencySymbol::Unknown;
    }

    // Strip UTF-8 BOM if present
    if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
        bytes = &bytes[3..];
    }

    // Handle UTF-16LE BOM: [0xFF, 0xFE]
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let utf16_slice = &bytes[2..];
        let mut ascii_buf = [0u8; 2048];
        let mut count = 0;
        let mut i = 0;
        while i + 1 < utf16_slice.len() && count < ascii_buf.len() {
            let low = utf16_slice[i];
            let high = utf16_slice[i + 1];
            if high == 0 {
                ascii_buf[count] = low;
                count += 1;
            } else if high == 0x20 && low == 0xAC {
                // UTF-16LE € -> write UTF-8 €
                if count + 2 < ascii_buf.len() {
                    ascii_buf[count] = 0xE2;
                    ascii_buf[count + 1] = 0x82;
                    ascii_buf[count + 2] = 0xAC;
                    count += 3;
                }
            } else if high == 0x20 && low == 0xB9 {
                // UTF-16LE ₹ -> write UTF-8 ₹
                if count + 2 < ascii_buf.len() {
                    ascii_buf[count] = 0xE2;
                    ascii_buf[count + 1] = 0x82;
                    ascii_buf[count + 2] = 0xB9;
                    count += 3;
                }
            }
            i += 2;
        }
        return sniff_currency_slice(&ascii_buf[..count]);
    }

    let sniff_len = bytes.len().min(8192);
    sniff_currency_slice(&bytes[..sniff_len])
}

fn sniff_currency_slice(slice: &[u8]) -> CurrencySymbol {
    // 1. INR (₹: UTF-8 [0xE2, 0x82, 0xB9] or text markers)
    if slice.windows(3).any(|w| w == [0xE2, 0x82, 0xB9])
        || contains_ignore_case(slice, b"inr")
        || contains_ignore_case(slice, b"rupee")
        || contains_ignore_case(slice, b"rs.")
    {
        return CurrencySymbol::Inr;
    }

    // 2. EUR (€: UTF-8 [0xE2, 0x82, 0xAC] or text markers)
    if slice.windows(3).any(|w| w == [0xE2, 0x82, 0xAC])
        || contains_ignore_case(slice, b"eur")
        || contains_ignore_case(slice, b"euro")
    {
        return CurrencySymbol::Eur;
    }

    // 3. JPY (¥: UTF-8 [0xC2, 0xA5] or fullwidth ￥ [0xEF, 0xBF, 0xA5] or text markers)
    if slice.windows(2).any(|w| w == [0xC2, 0xA5])
        || slice.windows(3).any(|w| w == [0xEF, 0xBF, 0xA5])
        || contains_ignore_case(slice, b"jpy")
        || contains_ignore_case(slice, b"yen")
    {
        return CurrencySymbol::Jpy;
    }

    // 4. GBP (£: UTF-8 [0xC2, 0xA3] or text markers)
    if slice.windows(2).any(|w| w == [0xC2, 0xA3])
        || contains_ignore_case(slice, b"gbp")
        || contains_ignore_case(slice, b"pound")
    {
        return CurrencySymbol::Gbp;
    }

    // 5. USD ($ or text markers)
    if slice.contains(&b'$') || contains_ignore_case(slice, b"usd") {
        return CurrencySymbol::Dollar;
    }

    CurrencySymbol::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_currency_symbol_parsing() {
        assert_eq!(parse_currency_symbol(b"Cost (EUR),Clicks,Impressions"), CurrencySymbol::Eur);
        assert_eq!(parse_currency_symbol(b"Spend ($),Conversions"), CurrencySymbol::Dollar);
        assert_eq!(parse_currency_symbol(b"Cost (INR),Campaign"), CurrencySymbol::Inr);
        assert_eq!(parse_currency_symbol(b"Impressions, Clicks, Spend (\xc2\xa3)"), CurrencySymbol::Gbp);
        assert_eq!(parse_currency_symbol("Spend (¥),Conversions".as_bytes()), CurrencySymbol::Jpy);
        assert_eq!(parse_currency_symbol(b"Random header without currency"), CurrencySymbol::Unknown);
    }
}

