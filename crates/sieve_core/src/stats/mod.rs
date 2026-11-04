//! Statistical analysis module.

pub mod bayesian;
pub mod cpa_drag;

pub use bayesian::{beta_cdf, calculate_beta_posterior, calculate_wilson_score};
pub use cpa_drag::calculate_cpa_drag;

