//! Shared data types across the registry, vault, and executor.

use starknet::ContractAddress;
use crate::commitments::Commitment;

/// The full policy, as returned by `PayrollRegistry::get_policy`.
/// `agent` is the authorized session-key account; `agent_session_pubkey` is the
/// registered key (record / off-chain use). `agent == 0` or `paused` blocks cycles.
#[derive(Drop, Serde, Copy)]
pub struct Policy {
    pub owner: ContractAddress,
    pub payee_root: felt252,
    pub max_per_payee: u256,
    pub max_per_cycle: u256,
    pub cadence: u64,
    pub last_cycle_at: u64,
    pub paused: bool,
    pub agent: ContractAddress,
    pub agent_session_pubkey: felt252,
}

/// One private payout in a cycle. The amount is supplied for on-chain cap and
/// commitment validation; `commitment = amount*G + blinding*H` is recomputed and
/// checked. `merkle_proof` proves `payee` is in the committed payee set.
#[derive(Drop, Serde, Clone)]
pub struct PayoutInput {
    pub payee: ContractAddress,
    pub amount: u256,
    pub blinding: felt252,
    pub commitment: Commitment,
    pub merkle_proof: Span<felt252>,
}

/// Public summary of an executed cycle (for the dashboard / Activity view).
#[derive(Drop, Serde, Copy)]
pub struct CycleSummary {
    pub cycle_id: u64,
    pub payee_count: u32,
    pub total_commitment: Commitment,
    pub executed_at: u64,
}
