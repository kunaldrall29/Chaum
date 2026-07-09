//! StubYieldAdapter — Grow preview only. Implements IYieldAdapter with fixed,
//! illustrative values so the console renders the Grow panel (marked IN
//! DEVELOPMENT). Deposits/withdrawals REVERT — no funds move in V1.

#[starknet::contract]
pub mod StubYieldAdapter {
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::ContractAddress;
    use crate::interfaces::i_yield_adapter::IYieldAdapter;

    #[storage]
    struct Storage {
        vault: ContractAddress,
    }

    pub mod Errors {
        pub const NOT_LIVE: felt252 = 'GROW: not live in V1 (T3)';
    }

    #[constructor]
    fn constructor(ref self: ContractState, vault: ContractAddress) {
        self.vault.write(vault);
    }

    #[abi(embed_v0)]
    impl StubYieldImpl of IYieldAdapter<ContractState> {
        fn deposit(ref self: ContractState, amount: u256) {
            core::panic_with_felt252(Errors::NOT_LIVE);
        }
        fn withdraw(ref self: ContractState, amount: u256) {
            core::panic_with_felt252(Errors::NOT_LIVE);
        }
        // Illustrative preview values (no real position).
        fn position_value(self: @ContractState) -> u256 {
            0
        }
        fn solvency_commitment(self: @ContractState) -> (felt252, felt252) {
            (0, 0)
        }
        fn vault(self: @ContractState) -> ContractAddress {
            self.vault.read()
        }
    }
}
