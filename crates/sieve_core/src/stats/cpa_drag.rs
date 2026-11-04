//! Marginal CPA drag metrics and spend efficiency analysis.
//!
//! Architectural Guarantees:
//! - Pure numerical primitives without dynamic standard library heap allocations.
//! - Non-negative drag clamping and bounded waste ratios.
//! - Strict mathematical invariants: Zero division-by-zero, Zero NaN, Zero Infinity.

/// Calculates CPA efficiency metrics and marginal waste drag.
///
/// Strict Marginal Waste Definition:
/// - Non-converting terms (conversions <= 0.0): Marginal Waste = Total Spend (`cost.max(0.0)`).
/// - Converting terms (conversions > 0.0): Marginal Waste = `(cost - (conversions * target_cpa)).max(0.0)`.
///
/// Mathematical Invariants:
/// - Any NaN, Infinite, or negative input is sanitized to safe finite bounds.
/// - When conversions <= 0.0, realized CPA safely defaults to cost.
/// - Waste ratio is strictly clamped to [0.0, 1.0].
///
/// Returns `(realized_cpa, marginal_drag, waste_ratio)`.
#[inline]
pub fn calculate_cpa_drag(cost: f64, conversions: f64, target_cpa: f64) -> (f64, f64, f64) {
    let cost = if cost.is_finite() { cost.max(0.0) } else { 0.0 };
    let conversions = if conversions.is_finite() { conversions.max(0.0) } else { 0.0 };
    let target_cpa = if target_cpa.is_finite() { target_cpa.max(0.0) } else { 0.0 };

    let realized_cpa = if conversions > 0.0 {
        cost / conversions
    } else {
        cost
    };

    let marginal_drag = if conversions <= 0.0 {
        cost
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

    #[test]
    fn test_cpa_drag_invariants_and_nan_safety() {
        // NaN inputs must produce finite 0.0 or safe results, never NaN
        let (cpa_nan, drag_nan, ratio_nan) = calculate_cpa_drag(f64::NAN, f64::NAN, f64::NAN);
        assert!(!cpa_nan.is_nan(), "realized CPA must not be NaN");
        assert!(!drag_nan.is_nan(), "marginal drag must not be NaN");
        assert!(!ratio_nan.is_nan(), "waste ratio must not be NaN");
        assert_eq!(cpa_nan, 0.0);
        assert_eq!(drag_nan, 0.0);
        assert_eq!(ratio_nan, 0.0);

        // Infinity inputs
        let (cpa_inf, drag_inf, ratio_inf) = calculate_cpa_drag(f64::INFINITY, 0.0, 50.0);
        assert!(cpa_inf.is_finite());
        assert!(drag_inf.is_finite());
        assert!(ratio_inf.is_finite());

        // Negative spend and conversions
        let (cpa_neg, drag_neg, ratio_neg) = calculate_cpa_drag(-100.0, -5.0, -20.0);
        assert_eq!(cpa_neg, 0.0);
        assert_eq!(drag_neg, 0.0);
        assert_eq!(ratio_neg, 0.0);

        // Division by zero with 0 conversions
        let (cpa_div0, drag_div0, ratio_div0) = calculate_cpa_drag(0.0, 0.0, 50.0);
        assert!(!cpa_div0.is_nan());
        assert!(!drag_div0.is_nan());
        assert!(!ratio_div0.is_nan());
        assert_eq!(cpa_div0, 0.0);
        assert_eq!(drag_div0, 0.0);
        assert_eq!(ratio_div0, 0.0);
    }
}
