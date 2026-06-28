//! PublicTransferAdapter — the devnet/demo transfer leg: a plain ERC-20 transfer.
//!
//! It pulls from the vault's allowance (set via `vault.set_spender`) and sends to
//! the payee. Only the executor may call `transfer`, so the vault's allowance can
//! only ever be spent through a fully-validated cycle.
//!
//! HONEST CAVEAT: the amount is public in the ERC-20 `Transfer` event here. The
//! commitment layer still hides the split on-chain; true amount confidentiality
//! arrives with the STRK20 adapter. See docs/COMPLIANCE_MODEL.md.

#[starknet::contract]
pub mod PublicTransferAdapter {
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
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
    impl PublicTransferImpl of IShieldedTransfer<ContractState> {
        fn transfer(
            ref self: ContractState, to: ContractAddress, amount: u256, note: Span<felt252>,
        ) {
            assert(get_caller_address() == self.executor.read(), Errors::ONLY_EXECUTOR);
            let erc20 = IERC20Dispatcher { contract_address: self.token.read() };
            // Pull from the vault's allowance and send to the payee.
            erc20.transfer_from(self.vault.read(), to, amount);
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
