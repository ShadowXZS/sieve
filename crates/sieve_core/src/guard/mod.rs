//! Safe-list and negative collision guard module.

pub mod collision;
pub mod dilution;
pub mod safe_list;

pub use collision::CollisionGuard;
pub use dilution::MatchTypeDilutionGuard;
pub use safe_list::SafeListIndex;

