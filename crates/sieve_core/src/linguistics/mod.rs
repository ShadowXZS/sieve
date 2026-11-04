//! Linguistics, string distance metrics, and phonetic clustering.

pub mod levenshtein;
pub mod phonetic;

pub use levenshtein::{damerau_levenshtein, SHORT_CIRCUIT_SENTINEL};
pub use phonetic::{cluster_tokens, export_clusters_json, phonetic_code, TokenCluster};

