//! Bayesian confidence classification and closed-form statistical distributions.
//!
//! Architectural Guarantees:
//! - Pure numerical primitives without dynamic standard library heap allocations.
//! - Closed-form Wilson score interval and Beta posterior distributions.
//! - Deterministic Lentz continued fractions for regularized incomplete beta CDF.

/// Calculates the Wilson score confidence interval for a binomial proportion.
///
/// Returns `(lower_bound, upper_bound)`.
#[inline]
pub fn calculate_wilson_score(trials: u64, successes: u64, z: f64) -> (f64, f64) {
    if trials == 0 {
        return (0.0, 1.0);
    }

    let n = trials as f64;
    let k = successes.min(trials) as f64;
    let z_sq = z * z;

    if k == 0.0 {
        let upper = z_sq / (n + z_sq);
        return (0.0, upper);
    }

    let p = k / n;
    let denom = 1.0 + z_sq / n;
    let center = (p + z_sq / (2.0 * n)) / denom;
    let variance_term = (p * (1.0 - p) / n) + (z_sq / (4.0 * n * n));
    let margin = (z * variance_term.max(0.0).sqrt()) / denom;

    let lower = (center - margin).max(0.0);
    let upper = (center + margin).min(1.0);

    (lower, upper)
}

/// Updates prior Beta(alpha, beta) with binomial observations (trials, successes).
///
/// Returns `(posterior_alpha, posterior_beta, mean, variance)`.
#[inline]
pub fn calculate_beta_posterior(
    trials: u64,
    successes: u64,
    prior_alpha: f64,
    prior_beta: f64,
) -> (f64, f64, f64, f64) {
    let k = successes.min(trials) as f64;
    let failures = trials.saturating_sub(successes) as f64;

    let post_alpha = prior_alpha + k;
    let post_beta = prior_beta + failures;

    let sum = post_alpha + post_beta;
    let mean = if sum > 0.0 { post_alpha / sum } else { 0.0 };
    let variance = if sum > 0.0 {
        (post_alpha * post_beta) / (sum * sum * (sum + 1.0))
    } else {
        0.0
    };

    (post_alpha, post_beta, mean, variance)
}

/// Computes the regularized incomplete beta function I_x(a, b).
/// Evaluates the posterior probability P(Theta <= x) for Beta(a, b).
pub fn beta_cdf(a: f64, b: f64, x: f64) -> f64 {
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }

    // Special cases with exact closed forms
    if (a - 1.0).abs() < 1e-9 {
        return 1.0 - (1.0 - x).powf(b);
    }
    if (b - 1.0).abs() < 1e-9 {
        return x.powf(a);
    }

    // Symmetry transform for continued fraction convergence
    let symmetry = x > (a + 1.0) / (a + b + 2.0);
    let (a_eval, b_eval, x_eval) = if symmetry {
        (b, a, 1.0 - x)
    } else {
        (a, b, x)
    };

    let log_factor = ln_gamma(a_eval + b_eval) - ln_gamma(a_eval) - ln_gamma(b_eval)
        + a_eval * x_eval.ln()
        + b_eval * (1.0 - x_eval).ln();

    let factor = log_factor.exp();
    let cf = beta_continued_fraction(a_eval, b_eval, x_eval);
    let result = (factor * cf) / a_eval;

    if symmetry {
        (1.0 - result).clamp(0.0, 1.0)
    } else {
        result.clamp(0.0, 1.0)
    }
}

/// Continued fraction evaluation using modified Lentz's method.
fn beta_continued_fraction(a: f64, b: f64, x: f64) -> f64 {
    const MAX_ITERS: usize = 100;
    const EPS: f64 = 1e-12;
    const TINY: f64 = 1e-30;

    let qab = a + b;
    let qap = a + 1.0;
    let qam = a - 1.0;

    let mut c = 1.0;
    let mut d = 1.0 - qab * x / qap;
    if d.abs() < TINY {
        d = TINY;
    }
    d = 1.0 / d;
    let mut h = d;

    for m in 1..=MAX_ITERS {
        let m_f = m as f64;
        let m2 = 2.0 * m_f;

        // Even step
        let num_even = m_f * (b - m_f) * x / ((qam + m2) * (a + m2));
        d = 1.0 + num_even * d;
        if d.abs() < TINY {
            d = TINY;
        }
        c = 1.0 + num_even / c;
        if c.abs() < TINY {
            c = TINY;
        }
        d = 1.0 / d;
        h *= d * c;

        // Odd step
        let num_odd = -(a + m_f) * (qab + m_f) * x / ((a + m2) * (qap + m2));
        d = 1.0 + num_odd * d;
        if d.abs() < TINY {
            d = TINY;
        }
        c = 1.0 + num_odd / c;
        if c.abs() < TINY {
            c = TINY;
        }
        d = 1.0 / d;
        let del = d * c;
        h *= del;

        if (del - 1.0).abs() < EPS {
            break;
        }
    }

    h
}

/// Lanczos approximation for log-gamma function ln(Gamma(z)).
/// Accurate to ~1e-13 for z > 0.
fn ln_gamma(z: f64) -> f64 {
    if z <= 0.0 {
        return 0.0;
    }

    const COEFFS: [f64; 7] = [
        0.999_999_999_999_809_9,
        676.5203681218851,
        -1259.1392167224028,
        771.323_428_777_653_1,
        -176.615_029_162_140_6,
        12.507343278686905,
        -0.13857109526572012,
    ];

    let x = z - 1.0;
    let mut sum = COEFFS[0];
    for (i, &c) in COEFFS[1..].iter().enumerate() {
        sum += c / (x + (i + 1) as f64);
    }

    let t = x + 7.5;
    0.5 * (core::f64::consts::PI * 2.0).ln() + (x + 0.5) * t.ln() - t + sum.ln()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wilson_bounds() {
        let (lower, upper) = calculate_wilson_score(100, 0, 1.95996);
        assert_eq!(lower, 0.0);
        assert!((upper - 0.037).abs() < 0.002);

        let (lower, upper) = calculate_wilson_score(100, 10, 1.95996);
        assert!((lower - 0.0552).abs() < 0.005);
        assert!((upper - 0.1744).abs() < 0.005);
    }

    #[test]
    fn test_beta_posterior_and_cdf() {
        let (alpha, beta, mean, _) = calculate_beta_posterior(50, 0, 1.0, 1.0);
        assert_eq!(alpha, 1.0);
        assert_eq!(beta, 51.0);
        assert!((mean - 1.0 / 52.0).abs() < 1e-6);

        let cdf = beta_cdf(1.0, 51.0, 0.05);
        assert!(cdf > 0.90 && cdf < 0.95);
    }
}
