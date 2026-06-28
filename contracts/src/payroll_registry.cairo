//! PayrollRegistry — the owner/agent contract. Holds one treasury policy: the
//! payee Merkle root, caps, cadence, pause flag, and the registered agent. The
//! executor reads the policy and reports back `record_cycle`. Every mutator is
//! owner-only; the agent key can touch nothing here.

#[starknet::contract]
pub mod PayrollRegistry {
    use openzeppelin::access::ownable::OwnableComponent;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use core::num::traits::Zero;
    use crate::types::Policy;
    use crate::interfaces::i_executor::IPayrollRegistry;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        initialized: bool,
        payee_root: felt252,
        max_per_payee: u256,
        max_per_cycle: u256,
        cadence: u64,
        last_cycle_at: u64,
        paused: bool,
        agent: ContractAddress,
        agent_session_pubkey: felt252,
        executor: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        PolicyCreated: PolicyCreated,
        PolicyUpdated: PolicyUpdated,
        PayeesUpdated: PayeesUpdated,
        AgentRegistered: AgentRegistered,
        ExecutorSet: ExecutorSet,
        Paused: Paused,
        Unpaused: Unpaused,
        Revoked: Revoked,
        CycleRecorded: CycleRecorded,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[derive(Drop, starknet::Event)]
    struct PolicyCreated {
        payee_root: felt252,
        max_per_payee: u256,
        max_per_cycle: u256,
        cadence: u64,
        agent: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    struct PolicyUpdated {
        max_per_payee: u256,
        max_per_cycle: u256,
        cadence: u64,
    }
    #[derive(Drop, starknet::Event)]
    struct PayeesUpdated {
        new_root: felt252,
    }
    #[derive(Drop, starknet::Event)]
    struct AgentRegistered {
        agent: ContractAddress,
        agent_session_pubkey: felt252,
    }
    #[derive(Drop, starknet::Event)]
    struct ExecutorSet {
        executor: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    struct Paused {}
    #[derive(Drop, starknet::Event)]
    struct Unpaused {}
    #[derive(Drop, starknet::Event)]
    struct Revoked {}
    #[derive(Drop, starknet::Event)]
    struct CycleRecorded {
        timestamp: u64,
    }

    pub mod Errors {
        pub const ALREADY_INIT: felt252 = 'CHAUM: already initialized';
        pub const NOT_INIT: felt252 = 'CHAUM: not initialized';
        pub const CAPS_ZERO: felt252 = 'CHAUM: caps must be nonzero';
        pub const CAP_ORDER: felt252 = 'CHAUM: per-payee > per-cycle';
        pub const ROOT_ZERO: felt252 = 'CHAUM: payee root is zero';
        pub const ONLY_EXECUTOR: felt252 = 'CHAUM: caller not executor';
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initializer(owner);
    }

    #[abi(embed_v0)]
    impl PayrollRegistryImpl of IPayrollRegistry<ContractState> {
        fn create_policy(
            ref self: ContractState,
            payee_root: felt252,
            max_per_payee: u256,
            max_per_cycle: u256,
            cadence: u64,
            agent: ContractAddress,
            agent_session_pubkey: felt252,
        ) {
            self.ownable.assert_only_owner();
            assert(!self.initialized.read(), Errors::ALREADY_INIT);
            validate_caps(max_per_payee, max_per_cycle);
            assert(payee_root != 0, Errors::ROOT_ZERO);

            self.payee_root.write(payee_root);
            self.max_per_payee.write(max_per_payee);
            self.max_per_cycle.write(max_per_cycle);
            self.cadence.write(cadence);
            self.agent.write(agent);
            self.agent_session_pubkey.write(agent_session_pubkey);
            self.initialized.write(true);

            self
                .emit(
                    PolicyCreated { payee_root, max_per_payee, max_per_cycle, cadence, agent },
                );
        }

        fn update_policy(
            ref self: ContractState, max_per_payee: u256, max_per_cycle: u256, cadence: u64,
        ) {
            self.ownable.assert_only_owner();
            assert(self.initialized.read(), Errors::NOT_INIT);
            validate_caps(max_per_payee, max_per_cycle);
            self.max_per_payee.write(max_per_payee);
            self.max_per_cycle.write(max_per_cycle);
            self.cadence.write(cadence);
            self.emit(PolicyUpdated { max_per_payee, max_per_cycle, cadence });
        }

        fn update_payees(ref self: ContractState, new_root: felt252) {
            self.ownable.assert_only_owner();
            assert(new_root != 0, Errors::ROOT_ZERO);
            self.payee_root.write(new_root);
            self.emit(PayeesUpdated { new_root });
        }

        fn set_agent(
            ref self: ContractState, agent: ContractAddress, agent_session_pubkey: felt252,
        ) {
            self.ownable.assert_only_owner();
            self.agent.write(agent);
            self.agent_session_pubkey.write(agent_session_pubkey);
            self.emit(AgentRegistered { agent, agent_session_pubkey });
        }

        fn set_executor(ref self: ContractState, executor: ContractAddress) {
            self.ownable.assert_only_owner();
            self.executor.write(executor);
            self.emit(ExecutorSet { executor });
        }

        fn pause(ref self: ContractState) {
            self.ownable.assert_only_owner();
            self.paused.write(true);
            self.emit(Paused {});
        }

        fn unpause(ref self: ContractState) {
            self.ownable.assert_only_owner();
            self.paused.write(false);
            self.emit(Unpaused {});
        }

        fn revoke(ref self: ContractState) {
            self.ownable.assert_only_owner();
            self.agent.write(Zero::zero());
            self.agent_session_pubkey.write(0);
            self.emit(Revoked {});
        }

        fn get_policy(self: @ContractState) -> Policy {
            Policy {
                owner: self.ownable.owner(),
                payee_root: self.payee_root.read(),
                max_per_payee: self.max_per_payee.read(),
                max_per_cycle: self.max_per_cycle.read(),
                cadence: self.cadence.read(),
                last_cycle_at: self.last_cycle_at.read(),
                paused: self.paused.read(),
                agent: self.agent.read(),
                agent_session_pubkey: self.agent_session_pubkey.read(),
            }
        }

        fn get_executor(self: @ContractState) -> ContractAddress {
            self.executor.read()
        }

        fn is_paused(self: @ContractState) -> bool {
            self.paused.read()
        }

        fn record_cycle(ref self: ContractState, timestamp: u64) {
            assert(get_caller_address() == self.executor.read(), Errors::ONLY_EXECUTOR);
            self.last_cycle_at.write(timestamp);
            self.emit(CycleRecorded { timestamp });
        }
    }

    fn validate_caps(max_per_payee: u256, max_per_cycle: u256) {
        assert(max_per_payee != 0 && max_per_cycle != 0, Errors::CAPS_ZERO);
        assert(max_per_payee <= max_per_cycle, Errors::CAP_ORDER);
    }
}
