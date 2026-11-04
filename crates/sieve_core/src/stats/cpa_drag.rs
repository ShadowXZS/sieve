//! Marginal CPA drag metrics and spend efficiency analysis.
//!
//! Architectural Guarantees:
//! - Pure numerical primitives without dynamic standard library heap allocations.
//! - Non-negative drag clamping and bounded waste ratios.

/// Calculates CPA efficiency metrics.
///
/// Returns `(realized_cpa, marginal_drag, waste_ratio)`.
#[inline]
pub fn calculate_cpa_drag(cost: f64, conversions: f64, target_cpa: f64) -> (f64, f64, f64) {
    let realized_cpa = if conversions > 0.0 {
        cost / conversions
    } else {
        cost
    };

    let target_spend = conversions * target_cpa;
    let marginal_drag = (cost - target_spend).max(0.0);

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
        let (cpa, drag, ratio) = calculate_cpa_drag(500.0, 5.0, 50.0);
        assert_eq!(cpa, 100.0);
        assert_eq!(drag, 250.0);
        assert_eq!(ratio, 0.5);
    }
}

