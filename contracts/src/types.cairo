//! Shared data types across the registry, vault, executor, and disclosure.

use starknet::ContractAddress;
use crate::commitments::Commitment;

/// Every payout belongs to a stream. Stream subtotals power the Stakeholder
/// (category-total) disclosure scope without revealing any individual amount.
#[derive(Drop, Serde, Copy, PartialEq)]
pub enum Stream {
    Payroll,
    Vendor,
    Grant,
}

pub const STREAM_COUNT: u8 = 3;

/// Stream → its felt tag (used in Merkle leaves `(payee, stream)` and storage keys).
pub fn stream_felt(s: Stream) -> felt252 {
    match s {
        Stream::Payroll => 0,
        Stream::Vendor => 1,
        Stream::Grant => 2,
    }
}
pub fn stream_index(s: Stream) -> u8 {
    match s {
        Stream::Payroll => 0_u8,
        Stream::Vendor => 1_u8,
        Stream::Grant => 2_u8,
    }
}

/// Organizational roles (read from `PayrollRegistry`), gating disclosure scopes.
#[derive(Drop, Serde, Copy, PartialEq)]
pub enum Role {
    None,
    Owner,
    Operator,
    Auditor,
    Payee,
    Stakeholder,
}

pub fn role_index(r: Role) -> u8 {
    match r {
        Role::None => 0_u8,
        Role::Owner => 1_u8,
        Role::Operator => 2_u8,
        Role::Auditor => 3_u8,
        Role::Payee => 4_u8,
        Role::Stakeholder => 5_u8,
    }
}

pub fn role_from_index(i: u8) -> Role {
    if i == 1 {
        Role::Owner
    } else if i == 2 {
        Role::Operator
    } else if i == 3 {
        Role::Auditor
    } else if i == 4 {
        Role::Payee
    } else if i == 5 {
        Role::Stakeholder
    } else {
        Role::None
    }
}

/// The full policy, as returned by `PayrollRegistry::get_policy`.
/// `agent == 0` or `paused` blocks cycles. `exec_window` is the jitter room: a
/// cycle may land anywhere in `[due, due + exec_window]`. The anomaly deltas are
/// stored for the agent to read (payee-set / total shift thresholds, in bps).
#[derive(Drop, Serde, Copy)]
pub struct Policy {
    pub owner: ContractAddress,
    pub payee_root: felt252,
    pub max_per_payee: u256,
    pub max_per_cycle: u256,
    pub cadence: u64,
    pub exec_window: u64,
    pub last_cycle_at: u64,
    pub paused: bool,
    pub agent: ContractAddress,
    pub agent_session_pubkey: felt252,
    pub anomaly_payee_delta_bps: u16,
    pub anomaly_total_delta_bps: u16,
}

/// One private payout in a cycle. `stream` classifies it (payroll/vendor/grant);
/// membership is proven against the committed set on the leaf `(payee, stream)`.
#[derive(Drop, Serde, Clone)]
pub struct PayoutInput {
    pub payee: ContractAddress,
    pub stream: Stream,
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
