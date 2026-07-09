//! Interfaces for the three core contracts: registry (policy), vault (custody),
//! executor (cycle execution + disclosure).

use starknet::ContractAddress;
use crate::types::{Policy, PayoutInput, CycleSummary, Role, Stream};
use crate::commitments::Commitment;

#[starknet::interface]
pub trait IPayrollRegistry<TContractState> {
    // --- owner-only mutations ---
    fn create_policy(
        ref self: TContractState,
        payee_root: felt252,
        max_per_payee: u256,
        max_per_cycle: u256,
        cadence: u64,
        agent: ContractAddress,
        agent_session_pubkey: felt252,
    );
    fn update_policy(
        ref self: TContractState, max_per_payee: u256, max_per_cycle: u256, cadence: u64,
    );
    fn update_payees(ref self: TContractState, new_root: felt252);
    fn set_agent(ref self: TContractState, agent: ContractAddress, agent_session_pubkey: felt252);
    fn set_executor(ref self: TContractState, executor: ContractAddress);
    /// Jitter window + anomaly-halt thresholds (window < cadence).
    fn set_execution(
        ref self: TContractState,
        exec_window: u64,
        anomaly_payee_delta_bps: u16,
        anomaly_total_delta_bps: u16,
    );
    /// Assign an org role (gates disclosure scopes).
    fn set_role(ref self: TContractState, account: ContractAddress, role: Role);
    fn pause(ref self: TContractState);
    fn unpause(ref self: TContractState);
    fn revoke(ref self: TContractState);
    // --- views ---
    fn get_policy(self: @TContractState) -> Policy;
    fn get_role(self: @TContractState, account: ContractAddress) -> Role;
    fn get_executor(self: @TContractState) -> ContractAddress;
    fn is_paused(self: @TContractState) -> bool;
    // --- executor-only ---
    fn record_cycle(ref self: TContractState, timestamp: u64);
}

#[starknet::interface]
pub trait IDisbursementVault<TContractState> {
    fn deposit(ref self: TContractState, amount: u256);
    fn withdraw(ref self: TContractState, amount: u256);
    fn balance(self: @TContractState) -> u256;
    /// Owner approves a spender (the transfer adapter) for the payment token.
    fn set_spender(ref self: TContractState, spender: ContractAddress);
    fn payment_token(self: @TContractState) -> ContractAddress;
}

/// Owner-side wiring for the executor (adapter + optional ERC-8004 attestation).
#[starknet::interface]
pub trait IExecutorAdmin<TContractState> {
    fn set_adapter(ref self: TContractState, adapter: ContractAddress);
    /// Enable ERC-8004 attestation: the validation registry + this agent's id.
    /// Set registry to 0 to disable (cycles then emit only Chaum's own events).
    fn set_attestation(
        ref self: TContractState, validation_registry: ContractAddress, agent_id: u256,
    );
    fn registry(self: @TContractState) -> ContractAddress;
    fn vault(self: @TContractState) -> ContractAddress;
    fn adapter(self: @TContractState) -> ContractAddress;
}

#[starknet::interface]
pub trait IDisbursementExecutor<TContractState> {
    /// The single agent-callable entrypoint. Re-validates the entire policy
    /// on-chain, stores commitments, executes transfers via the adapter.
    fn execute_cycle(ref self: TContractState, cycle_id: u64, payouts: Array<PayoutInput>);
    /// Auditor scope (open to anyone): Σ per-payee commitments == cycle-total.
    fn verify_aggregate(self: @TContractState, cycle_id: u64) -> bool;
    /// Stakeholder scope: a stream's subtotal is consistent, without revealing any
    /// individual split. Caller must hold Stakeholder/Auditor/Operator/Owner role.
    fn verify_stream_aggregate(self: @TContractState, cycle_id: u64, stream: Stream) -> bool;
    /// A payee proves their own amount; reverts for any other caller.
    fn open_own(
        ref self: TContractState,
        cycle_id: u64,
        payee: ContractAddress,
        amount: u256,
        blinding: felt252,
    ) -> bool;
    // --- views ---
    fn get_cycle(self: @TContractState, cycle_id: u64) -> CycleSummary;
    fn commitment_of(
        self: @TContractState, cycle_id: u64, payee: ContractAddress,
    ) -> Commitment;
    fn total_commitment(self: @TContractState, cycle_id: u64) -> Commitment;
    fn stream_commitment(self: @TContractState, cycle_id: u64, stream: Stream) -> Commitment;
}
