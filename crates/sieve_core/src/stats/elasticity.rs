//! Bid Elasticity and CPC Distribution Analysis.
//!
//! Architectural Guarantees:
//! - Pure numerical evaluation of converting vs non-converting CPC distributions.
//! - Deterministic median calculation without standard library runtime panics.
//! - Computes the boundary delta between converting median CPC and non-converting median CPC.
//! - Zero division-by-zero, Zero NaN, Zero Infinity.

/// Evaluated CPC distribution and elasticity boundaries.
#[derive(Debug, Clone, PartialEq)]
pub struct CpcElasticityResult {
    /// Median CPC for converting search queries.
    pub converting_median_cpc: f64,
    /// Median CPC for non-converting search queries.
    pub non_converting_median_cpc: f64,
    /// Boundary delta: `converting_median_cpc - non_converting_median_cpc`.
    pub boundary_delta: f64,
    /// Elasticity index: ratio between converting and non-converting medians.
    pub elasticity_index: f64,
    /// Calculated optimal bid ceiling.
    pub optimal_bid_ceiling: f64,
}

/// Helper function to compute median from an f64 slice.
/// Returns 0.0 for empty or invalid slices.
pub fn calculate_median(values: &[f64]) -> f64 {
    let mut valid_values: Vec<f64> = values
        .iter()
        .copied()
        .filter(|v| v.is_finite() && *v >= 0.0)
        .collect();

    if valid_values.is_empty() {
        return 0.0;
    }

    valid_values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let len = valid_values.len();
    if len % 2 == 1 {
        valid_values[len / 2]
    } else {
        (valid_values[len / 2 - 1] + valid_values[len / 2]) / 2.0
    }
}

/// Evaluates CPC distributions and computes elasticity boundary delta.
pub fn calculate_cpc_elasticity(
    converting_cpcs: &[f64],
    non_converting_cpcs: &[f64],
    target_cpa: f64,
) -> CpcElasticityResult {
    let safe_target_cpa = if target_cpa.is_finite() {
        target_cpa.max(0.0)
    } else {
        0.0
    };

    let converting_median = calculate_median(converting_cpcs);
    let non_converting_median = calculate_median(non_converting_cpcs);

    let boundary_delta = (converting_median - non_converting_median).max(0.0);

    let elasticity_index = if non_converting_median > 0.0 {
        (converting_median / non_converting_median).clamp(0.0, 100.0)
    } else if converting_median > 0.0 {
        2.0
    } else {
        1.0
    };

    let optimal_bid_ceiling = if converting_median > 0.0 {
        (converting_median * 1.15).min(safe_target_cpa * 0.25)
    } else if safe_target_cpa > 0.0 {
        safe_target_cpa * 0.05
    } else {
        0.0
    };

    CpcElasticityResult {
        converting_median_cpc: converting_median,
        non_converting_median_cpc: non_converting_median,
        boundary_delta,
        elasticity_index,
        optimal_bid_ceiling,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cpc_elasticity_median_and_delta() {
        let converting = vec![5.0, 7.0, 9.0]; // median = 7.0
        let non_converting = vec![2.0, 3.0, 4.0]; // median = 3.0

        let result = calculate_cpc_elasticity(&converting, &non_converting, 50.0);
        assert_eq!(result.converting_median_cpc, 7.0);
        assert_eq!(result.non_converting_median_cpc, 3.0);
        assert_eq!(result.boundary_delta, 4.0);
        assert!((result.elasticity_index - (7.0 / 3.0)).abs() < 1e-6);
    }

    #[test]
    fn test_cpc_elasticity_empty_and_nan_safety() {
        let result = calculate_cpc_elasticity(&[], &[], f64::NAN);
        assert_eq!(result.converting_median_cpc, 0.0);
        assert_eq!(result.non_converting_median_cpc, 0.0);
        assert_eq!(result.boundary_delta, 0.0);
        assert_eq!(result.elasticity_index, 1.0);
        assert_eq!(result.optimal_bid_ceiling, 0.0);
    }

    #[test]
    fn test_median_even_and_odd() {
        assert_eq!(calculate_median(&[1.0, 3.0, 5.0]), 3.0);
        assert_eq!(calculate_median(&[1.0, 2.0, 4.0, 5.0]), 3.0);
        assert_eq!(calculate_median(&[]), 0.0);
    }
}

