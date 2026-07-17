//! Bridge-in seam (phase 2, RFS #6). Funds bridge into the STRK20 pool from
//! Ethereum / L2s / Solana; private operations happen on Starknet; withdrawals
//! exit to any chain with no on-chain link. V1 ships this interface only — no
//! implementation. See docs/ARCHITECTURE.md and docs/GROW_DESIGN.md.

#[starknet::interface]
pub trait IBridgeIn<TContractState> {
    /// Receive value bridged from `source_chain` into the operating account.
    fn bridge_in(
        ref self: TContractState, source_chain: felt252, amount: u256, note: Span<felt252>,
    );
    /// Whether a source chain is supported by this bridge adapter.
    fn supported_source(self: @TContractState, source_chain: felt252) -> bool;
}
