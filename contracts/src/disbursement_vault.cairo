//! DisbursementVault — custody of the payout asset. Only the owner can deposit
//! or withdraw. To pay out, the owner approves the transfer adapter as spender
//! (`set_spender`); the adapter then pulls from the vault only when driven by the
//! executor. No fund path leaves the vault except to the owner (withdraw) or via
//! the adapter allowance (executor-gated). Reentrancy-guarded.

#[starknet::contract]
pub mod DisbursementVault {
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use core::num::traits::Bounded;
    use crate::interfaces::i_executor::IDisbursementVault;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: ReentrancyGuardComponent, storage: reentrancy, event: ReentrancyEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    impl ReentrancyInternalImpl = ReentrancyGuardComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        token: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        reentrancy: ReentrancyGuardComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Deposited: Deposited,
        Withdrawn: Withdrawn,
        SpenderApproved: SpenderApproved,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        ReentrancyEvent: ReentrancyGuardComponent::Event,
    }

    #[derive(Drop, starknet::Event)]
    struct Deposited {
        from: ContractAddress,
        amount: u256,
    }
    #[derive(Drop, starknet::Event)]
    struct Withdrawn {
        to: ContractAddress,
        amount: u256,
    }
    #[derive(Drop, starknet::Event)]
    struct SpenderApproved {
        spender: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, token: ContractAddress) {
        self.ownable.initializer(owner);
        self.token.write(token);
    }

    #[abi(embed_v0)]
    impl DisbursementVaultImpl of IDisbursementVault<ContractState> {
        fn deposit(ref self: ContractState, amount: u256) {
            self.ownable.assert_only_owner();
            self.reentrancy.start();
            let caller = get_caller_address();
            let erc20 = IERC20Dispatcher { contract_address: self.token.read() };
            erc20.transfer_from(caller, get_contract_address(), amount);
            self.reentrancy.end();
            self.emit(Deposited { from: caller, amount });
        }

        fn withdraw(ref self: ContractState, amount: u256) {
            self.ownable.assert_only_owner();
            self.reentrancy.start();
            let owner = self.ownable.owner();
            let erc20 = IERC20Dispatcher { contract_address: self.token.read() };
            erc20.transfer(owner, amount);
            self.reentrancy.end();
            self.emit(Withdrawn { to: owner, amount });
        }

        fn balance(self: @ContractState) -> u256 {
            let erc20 = IERC20Dispatcher { contract_address: self.token.read() };
            erc20.balance_of(get_contract_address())
        }

        fn set_spender(ref self: ContractState, spender: ContractAddress) {
            self.ownable.assert_only_owner();
            let erc20 = IERC20Dispatcher { contract_address: self.token.read() };
            erc20.approve(spender, Bounded::<u256>::MAX);
            self.emit(SpenderApproved { spender });
        }

        fn payment_token(self: @ContractState) -> ContractAddress {
            self.token.read()
        }
    }
}
