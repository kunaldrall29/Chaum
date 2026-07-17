//! Grow seam (phase 2/3). The interface every private-yield venue implements.
//! V1 ships this trait + a stub only — NO live yield logic. Positions are
//! shielded; solvency is provable via viewing roles (reusing the disclosure core).
//! See docs/GROW_DESIGN.md.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IYieldAdapter<TContractState> {
    /// Deposit idle treasury into the venue (owner/executor only, when live).
    fn deposit(ref self: TContractState, amount: u256);
    /// Withdraw from the venue back to the vault (owner only, when live).
    fn withdraw(ref self: TContractState, amount: u256);
    /// Current position value in the payout asset (may be a shielded read).
    fn position_value(self: @TContractState) -> u256;
    /// (x, y) of a commitment to solvency, verifiable by a viewing role without
    /// revealing the strategy split.
    fn solvency_commitment(self: @TContractState) -> (felt252, felt252);
    /// The vault this adapter serves.
    fn vault(self: @TContractState) -> ContractAddress;
}
