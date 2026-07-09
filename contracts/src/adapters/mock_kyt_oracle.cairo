//! MockKytOracle — devnet/demo screening oracle with owner-settable verdicts.
//! Stands in for a real TRM/Chainalysis-class provider behind IKytOracle.

#[starknet::contract]
pub mod MockKytOracle {
    use openzeppelin::access::ownable::OwnableComponent;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::ContractAddress;
    use crate::interfaces::i_kyt_oracle::{IKytOracle, IMockKyt};

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        verdict: Map<ContractAddress, u8>,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        VerdictSet: VerdictSet,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[derive(Drop, starknet::Event)]
    struct VerdictSet {
        account: ContractAddress,
        verdict: u8,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initializer(owner);
    }

    #[abi(embed_v0)]
    impl KytOracleImpl of IKytOracle<ContractState> {
        fn screen(self: @ContractState, account: ContractAddress) -> u8 {
            self.verdict.read(account) // 0 unknown by default
        }
    }

    #[abi(embed_v0)]
    impl MockKytImpl of IMockKyt<ContractState> {
        fn set_verdict(ref self: ContractState, account: ContractAddress, verdict: u8) {
            self.ownable.assert_only_owner();
            self.verdict.write(account, verdict);
            self.emit(VerdictSet { account, verdict });
        }
    }
}
