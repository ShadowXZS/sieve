//! Marginal CPA drag metrics and spend efficiency analysis.
//!
//! Architectural Guarantees:
//! - Pure numerical primitives without dynamic standard library heap allocations.
//! - Non-negative drag clamping and bounded waste ratios.

/// Calculates CPA efficiency metrics and marginal waste drag.
///
/// Strict Marginal Waste Definition:
/// - Non-converting terms (conversions <= 0.0): Marginal Waste = Total Spend (`cost.max(0.0)`).
/// - Converting terms (conversions > 0.0): Marginal Waste = `(cost - (conversions * target_cpa)).max(0.0)`.
///
/// Returns `(realized_cpa, marginal_drag, waste_ratio)`.
#[inline]
pub fn calculate_cpa_drag(cost: f64, conversions: f64, target_cpa: f64) -> (f64, f64, f64) {
    let realized_cpa = if conversions > 0.0 {
        cost / conversions
    } else {
        cost
    };

    let marginal_drag = if conversions <= 0.0 {
        cost.max(0.0)
    } else {
        (cost - (conversions * target_cpa)).max(0.0)
    };

    let waste_ratio = if cost > 0.0 {
        (marginal_drag / cost).clamp(0.0, 1.0)
    } else {
        0.0
    };

    (realized_cpa, marginal_drag, waste_ratio)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cpa_drag_calculation() {
        // Converting term exceeding target CPA
        let (cpa, drag, ratio) = calculate_cpa_drag(500.0, 5.0, 50.0);
        assert_eq!(cpa, 100.0);
        assert_eq!(drag, 250.0);
        assert_eq!(ratio, 0.5);

        // Non-converting term (Conversions == 0): Marginal Waste = Total Spend
        let (cpa_zero, drag_zero, ratio_zero) = calculate_cpa_drag(150.0, 0.0, 50.0);
        assert_eq!(cpa_zero, 150.0);
        assert_eq!(drag_zero, 150.0);
        assert_eq!(ratio_zero, 1.0);

        // Converting term below target CPA (no waste)
        let (cpa_low, drag_low, ratio_low) = calculate_cpa_drag(80.0, 2.0, 50.0);
        assert_eq!(cpa_low, 40.0);
        assert_eq!(drag_low, 0.0);
        assert_eq!(ratio_low, 0.0);
    }
}

