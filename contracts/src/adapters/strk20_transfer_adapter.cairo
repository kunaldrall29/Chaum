//! Strk20TransferAdapter — the shielded transfer leg (T2). Interface-complete
//! stub. STRK20 (Starknet's note-based shielded-transfer standard) launched in
//! March 2026, but its developer SDK / programmatic interface is a subsequent
//! phase and is NOT yet available. Per the project's working rule we DO NOT
//! fabricate STRK20 entrypoints or addresses.
//!
//! This adapter implements `IShieldedTransfer` so the executor can target it
//! unchanged once the real interface lands. Today `transfer` reverts with a clear
//! message. Integration plan + status are recorded in docs/DECISIONS.md and the
//! T2 milestone in docs/GRANT_MILESTONES.md.
//!
//! INTEGRATION TODO (T2): inside `transfer`, replace the revert with a call to the
//! STRK20 shielded-pool entrypoint (shield/unshield/private-transfer) using `note`
//! as the encrypted note blob, once the verified ABI + pool address are published.

#[starknet::contract]
pub mod Strk20TransferAdapter {
    use openzeppelin::access::ownable::OwnableComponent;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use crate::interfaces::i_shielded_transfer::{IShieldedTransfer, ITransferAdapterAdmin};

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        token: ContractAddress,
        vault: ContractAddress,
        executor: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        ExecutorSet: ExecutorSet,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[derive(Drop, starknet::Event)]
    struct ExecutorSet {
        executor: ContractAddress,
    }

    pub mod Errors {
        pub const ONLY_EXECUTOR: felt252 = 'CHAUM: caller not executor';
        pub const NOT_INTEGRATED: felt252 = 'STRK20: SDK not available (T2)';
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        token: ContractAddress,
        vault: ContractAddress,
    ) {
        self.ownable.initializer(owner);
        self.token.write(token);
        self.vault.write(vault);
    }

    #[abi(embed_v0)]
    impl ShieldedTransferImpl of IShieldedTransfer<ContractState> {
        fn transfer(
            ref self: ContractState, to: ContractAddress, amount: u256, note: Span<felt252>,
        ) {
            assert(get_caller_address() == self.executor.read(), Errors::ONLY_EXECUTOR);
            // TODO(T2): call the STRK20 shielded-pool entrypoint here once the SDK
            // / verified ABI is published. Until then, fail loudly rather than
            // silently doing a public transfer.
            core::panic_with_felt252(Errors::NOT_INTEGRATED);
        }
    }

    #[abi(embed_v0)]
    impl AdapterAdminImpl of ITransferAdapterAdmin<ContractState> {
        fn set_executor(ref self: ContractState, executor: ContractAddress) {
            self.ownable.assert_only_owner();
            self.executor.write(executor);
            self.emit(ExecutorSet { executor });
        }

        fn executor(self: @ContractState) -> ContractAddress {
            self.executor.read()
        }
    }
}
