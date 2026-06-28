//! Chaum — private payroll & treasury disbursement on Starknet.
//!
//! Individual amounts are private (Pedersen commitments); the aggregate is
//! provable (homomorphic sum). The agent proposes, the contract disposes.

pub mod generators;
pub mod commitments;
pub mod types;
pub mod interfaces;
pub mod payroll_registry;
pub mod mocks;
