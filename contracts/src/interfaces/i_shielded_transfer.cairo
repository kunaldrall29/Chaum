//! The transfer seam. Every token movement goes through this trait, so the
//! mechanism (public ERC-20 vs STRK20 shielded) is swappable without touching
//! the executor. `note` carries adapter-specific data (empty for the public
//! adapter; the shielded note blob for STRK20).

use starknet::ContractAddress;

#[starknet::interface]
pub trait IShieldedTransfer<TContractState> {
    /// Move `amount` of the payment asset to `to`. Implementations MUST restrict
    /// the caller to the authorized executor (they spend the vault's allowance).
    fn transfer(ref self: TContractState, to: ContractAddress, amount: u256, note: Span<felt252>);
}

/// Owner-side wiring for an adapter (the executor address is known only after the
/// executor is deployed, so it is set post-deploy).
#[starknet::interface]
pub trait ITransferAdapterAdmin<TContractState> {
    fn set_executor(ref self: TContractState, executor: ContractAddress);
    fn executor(self: @TContractState) -> ContractAddress;
}
