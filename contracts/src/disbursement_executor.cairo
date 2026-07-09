//! DisbursementExecutor — the single agent-callable entrypoint. The agent
//! proposes a cycle; this contract re-validates EVERY policy condition on-chain
//! before any token moves, stores the per-payee + cycle-total commitments, and
//! executes transfers through the swappable adapter. It also serves the two
//! disclosure functions (verify_aggregate, open_own).
//!
//! Bounded delegation: a compromised agent key can only call this entrypoint,
//! pay Merkle-proven payees within caps, no more often than the cadence.

#[starknet::contract]
pub mod DisbursementExecutor {
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use crate::commitments::{Commitment, commit, add};
    use crate::generators::CURVE_ORDER;
    use crate::merkle;
    use crate::types::{PayoutInput, CycleSummary, Stream, stream_felt, stream_index, Role, role_index};
    use crate::interfaces::i_executor::{
        IDisbursementExecutor, IExecutorAdmin, IPayrollRegistryDispatcher,
        IPayrollRegistryDispatcherTrait, IDisbursementVaultDispatcher,
        IDisbursementVaultDispatcherTrait,
    };
    use crate::interfaces::i_shielded_transfer::{
        IShieldedTransferDispatcher, IShieldedTransferDispatcherTrait,
    };
    use erc8004::interfaces::validation_registry::{
        IValidationRegistryDispatcher, IValidationRegistryDispatcherTrait,
    };

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: ReentrancyGuardComponent, storage: reentrancy, event: ReentrancyEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    impl ReentrancyInternalImpl = ReentrancyGuardComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        registry: ContractAddress,
        vault: ContractAddress,
        adapter: ContractAddress,
        validation_registry: ContractAddress,
        agent_id: u256,
        // per-cycle commitment ledger
        executed: Map<u64, bool>,
        payee_count: Map<u64, u32>,
        payee_at: Map<(u64, u32), ContractAddress>,
        commit_of: Map<(u64, ContractAddress), Commitment>,
        total_commit: Map<u64, Commitment>,
        total_amount: Map<u64, u256>,
        total_blinding: Map<u64, felt252>,
        executed_at: Map<u64, u64>,
        // per-stream subtotals per cycle, keyed by (cycle_id, stream_index)
        stream_commit: Map<(u64, u8), Commitment>,
        stream_amount: Map<(u64, u8), u256>,
        stream_blinding: Map<(u64, u8), felt252>,
        stream_has: Map<(u64, u8), bool>,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        reentrancy: ReentrancyGuardComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        CycleExecuted: CycleExecuted,
        PayoutCommitted: PayoutCommitted,
        AdapterSet: AdapterSet,
        AttestationSet: AttestationSet,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        ReentrancyEvent: ReentrancyGuardComponent::Event,
    }

    #[derive(Drop, starknet::Event)]
    struct CycleExecuted {
        #[key]
        cycle_id: u64,
        payee_count: u32,
        total_commit_x: felt252,
        total_commit_y: felt252,
        caller: ContractAddress,
        timestamp: u64,
    }
    #[derive(Drop, starknet::Event)]
    struct PayoutCommitted {
        #[key]
        cycle_id: u64,
        #[key]
        payee: ContractAddress,
        commit_x: felt252,
        commit_y: felt252,
    }
    #[derive(Drop, starknet::Event)]
    struct AdapterSet {
        adapter: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    struct AttestationSet {
        validation_registry: ContractAddress,
        agent_id: u256,
    }

    pub mod Errors {
        pub const EMPTY: felt252 = 'CHAUM: empty payouts';
        pub const PAUSED: felt252 = 'CHAUM: paused';
        pub const REVOKED: felt252 = 'CHAUM: agent revoked';
        pub const UNAUTHORIZED: felt252 = 'CHAUM: unauthorized caller';
        pub const CYCLE_EXISTS: felt252 = 'CHAUM: cycle already run';
        pub const CADENCE: felt252 = 'CHAUM: cadence not elapsed';
        pub const NOT_MEMBER: felt252 = 'CHAUM: payee not in set';
        pub const OVER_PAYEE: felt252 = 'CHAUM: over per-payee cap';
        pub const OVER_CYCLE: felt252 = 'CHAUM: over per-cycle cap';
        pub const UNDERFUNDED: felt252 = 'CHAUM: vault underfunded';
        pub const ZERO_BLINDING: felt252 = 'CHAUM: zero blinding';
        pub const BAD_COMMIT: felt252 = 'CHAUM: commitment mismatch';
        pub const AMOUNT_RANGE: felt252 = 'CHAUM: amount exceeds felt';
        pub const SUM_MISMATCH: felt252 = 'CHAUM: sum inconsistency';
        pub const NOT_EXECUTED: felt252 = 'CHAUM: cycle not found';
        pub const ONLY_PAYEE: felt252 = 'CHAUM: caller not payee';
        pub const BAD_OPENING: felt252 = 'CHAUM: bad opening';
        pub const WINDOW: felt252 = 'CHAUM: past exec window';
        pub const FORBIDDEN: felt252 = 'CHAUM: role not permitted';
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        registry: ContractAddress,
        vault: ContractAddress,
        adapter: ContractAddress,
    ) {
        self.ownable.initializer(owner);
        self.registry.write(registry);
        self.vault.write(vault);
        self.adapter.write(adapter);
    }

    #[abi(embed_v0)]
    impl ExecutorImpl of IDisbursementExecutor<ContractState> {
        fn execute_cycle(ref self: ContractState, cycle_id: u64, payouts: Array<PayoutInput>) {
            self.reentrancy.start();

            let n = payouts.len();
            assert(n != 0, Errors::EMPTY);
            assert(!self.executed.entry(cycle_id).read(), Errors::CYCLE_EXISTS);

            // 1. Load policy and re-validate authorization / state.
            let registry = IPayrollRegistryDispatcher { contract_address: self.registry.read() };
            let policy = registry.get_policy();
            assert(!policy.paused, Errors::PAUSED);
            assert(!policy.agent.is_zero(), Errors::REVOKED);
            let caller = get_caller_address();
            assert(caller == policy.agent || caller == policy.owner, Errors::UNAUTHORIZED);

            // 2. Cadence + execution window (jitter room): once a first cycle has run,
            //    a cycle must land in [due, due + exec_window].
            let now = get_block_timestamp();
            assert(now >= policy.last_cycle_at + policy.cadence, Errors::CADENCE);
            if policy.exec_window != 0 && policy.last_cycle_at != 0 {
                assert(
                    now <= policy.last_cycle_at + policy.cadence + policy.exec_window, Errors::WINDOW,
                );
            }

            // 3. Validate every payout; accumulate grand + per-stream totals; store.
            let mut total_amount: u256 = 0;
            let mut blind_sum: u256 = 0;
            let mut running: Commitment = Commitment { x: 0, y: 0 };
            let mut i: u32 = 0;
            while i != n {
                let p = payouts.at(i);
                let payee = *p.payee;
                let stream = *p.stream;
                let amount = *p.amount;
                let blinding = *p.blinding;
                let c = *p.commitment;

                // membership over the (payee, stream) leaf
                let leaf = merkle::hash_leaf(payee, stream_felt(stream));
                assert(merkle::verify(policy.payee_root, leaf, *p.merkle_proof), Errors::NOT_MEMBER);
                // caps + binding
                assert(amount <= policy.max_per_payee, Errors::OVER_PAYEE);
                assert(blinding != 0, Errors::ZERO_BLINDING);
                let amount_felt: felt252 = amount.try_into().expect(Errors::AMOUNT_RANGE);
                assert(commit(amount_felt, blinding) == c, Errors::BAD_COMMIT);

                // accumulate grand totals
                total_amount += amount;
                blind_sum = (blind_sum + (blinding.into() % CURVE_ORDER)) % CURVE_ORDER;
                running = if i == 0 {
                    c
                } else {
                    add(running, c)
                };

                // accumulate the stream subtotal (read-modify-write)
                let si = stream_index(stream);
                let key = (cycle_id, si);
                let s_new = if self.stream_has.entry(key).read() {
                    add(self.stream_commit.entry(key).read(), c)
                } else {
                    self.stream_has.entry(key).write(true);
                    c
                };
                self.stream_commit.entry(key).write(s_new);
                self.stream_amount.entry(key).write(self.stream_amount.entry(key).read() + amount);
                let sb = (self.stream_blinding.entry(key).read().into() + (blinding.into() % CURVE_ORDER))
                    % CURVE_ORDER;
                let sb_felt: felt252 = sb.try_into().unwrap();
                self.stream_blinding.entry(key).write(sb_felt);

                // store per-payee
                self.payee_at.entry((cycle_id, i)).write(payee);
                self.commit_of.entry((cycle_id, payee)).write(c);
                self.emit(PayoutCommitted { cycle_id, payee, commit_x: c.x, commit_y: c.y });

                i += 1;
            }

            // 4. Cycle-level caps + funding.
            assert(total_amount <= policy.max_per_cycle, Errors::OVER_CYCLE);
            let vault = IDisbursementVaultDispatcher { contract_address: self.vault.read() };
            assert(total_amount <= vault.balance(), Errors::UNDERFUNDED);

            // 5. Homomorphic consistency: Σ C_i == commit(Σ amount, Σ blinding).
            let total_amount_felt: felt252 = total_amount.try_into().expect(Errors::AMOUNT_RANGE);
            let blind_sum_felt: felt252 = blind_sum.try_into().unwrap();
            assert(running == commit(total_amount_felt, blind_sum_felt), Errors::SUM_MISMATCH);

            // 6. Persist cycle record.
            self.executed.entry(cycle_id).write(true);
            self.payee_count.entry(cycle_id).write(n);
            self.total_commit.entry(cycle_id).write(running);
            self.total_amount.entry(cycle_id).write(total_amount);
            self.total_blinding.entry(cycle_id).write(blind_sum_felt);
            self.executed_at.entry(cycle_id).write(now);

            // 7. Execute transfers via the adapter (after all validation passed).
            let adapter = IShieldedTransferDispatcher { contract_address: self.adapter.read() };
            let note: Span<felt252> = array![].span();
            let mut j: u32 = 0;
            while j != n {
                let p = payouts.at(j);
                adapter.transfer(*p.payee, *p.amount, note);
                j += 1;
            }

            // 8. Record the cycle in the registry (cadence anchor).
            registry.record_cycle(now);

            // 9. Optional ERC-8004 attestation (self-validated cycle execution).
            self.attest(cycle_id, running);

            // 10. Emit.
            self
                .emit(
                    CycleExecuted {
                        cycle_id,
                        payee_count: n,
                        total_commit_x: running.x,
                        total_commit_y: running.y,
                        caller,
                        timestamp: now,
                    },
                );

            self.reentrancy.end();
        }

        fn verify_aggregate(self: @ContractState, cycle_id: u64) -> bool {
            assert(self.executed.entry(cycle_id).read(), Errors::NOT_EXECUTED);
            let n = self.payee_count.entry(cycle_id).read();
            let mut running: Commitment = Commitment { x: 0, y: 0 };
            let mut i: u32 = 0;
            while i != n {
                let payee = self.payee_at.entry((cycle_id, i)).read();
                let c = self.commit_of.entry((cycle_id, payee)).read();
                running = if i == 0 {
                    c
                } else {
                    add(running, c)
                };
                i += 1;
            }
            let stored_total = self.total_commit.entry(cycle_id).read();
            // Σ stored commitments must equal the stored total commitment, AND that
            // total must open to the recorded (public) amount/blinding sum.
            let total_amount_felt: felt252 = self
                .total_amount
                .entry(cycle_id)
                .read()
                .try_into()
                .unwrap();
            let total_blinding = self.total_blinding.entry(cycle_id).read();
            running == stored_total && stored_total == commit(total_amount_felt, total_blinding)
        }

        fn verify_stream_aggregate(self: @ContractState, cycle_id: u64, stream: Stream) -> bool {
            assert(self.executed.entry(cycle_id).read(), Errors::NOT_EXECUTED);
            // Role gate: Stakeholder scope (and above) may see category totals; a bare
            // Payee or an unassigned address may not.
            let registry = IPayrollRegistryDispatcher { contract_address: self.registry.read() };
            let ri = role_index(registry.get_role(get_caller_address()));
            assert(ri != role_index(Role::None) && ri != role_index(Role::Payee), Errors::FORBIDDEN);

            let key = (cycle_id, stream_index(stream));
            if !self.stream_has.entry(key).read() {
                return false;
            }
            // The stored stream subtotal must open to the recorded stream amount/blinding.
            let sc = self.stream_commit.entry(key).read();
            let sa_felt: felt252 = self.stream_amount.entry(key).read().try_into().unwrap();
            let sb = self.stream_blinding.entry(key).read();
            sc == commit(sa_felt, sb)
        }

        fn open_own(
            ref self: ContractState,
            cycle_id: u64,
            payee: ContractAddress,
            amount: u256,
            blinding: felt252,
        ) -> bool {
            assert(get_caller_address() == payee, Errors::ONLY_PAYEE);
            let c = self.commit_of.entry((cycle_id, payee)).read();
            let amount_felt: felt252 = amount.try_into().expect(Errors::AMOUNT_RANGE);
            assert(commit(amount_felt, blinding) == c, Errors::BAD_OPENING);
            true
        }

        fn get_cycle(self: @ContractState, cycle_id: u64) -> CycleSummary {
            CycleSummary {
                cycle_id,
                payee_count: self.payee_count.entry(cycle_id).read(),
                total_commitment: self.total_commit.entry(cycle_id).read(),
                executed_at: self.executed_at.entry(cycle_id).read(),
            }
        }

        fn commitment_of(
            self: @ContractState, cycle_id: u64, payee: ContractAddress,
        ) -> Commitment {
            self.commit_of.entry((cycle_id, payee)).read()
        }

        fn total_commitment(self: @ContractState, cycle_id: u64) -> Commitment {
            self.total_commit.entry(cycle_id).read()
        }

        fn stream_commitment(self: @ContractState, cycle_id: u64, stream: Stream) -> Commitment {
            self.stream_commit.entry((cycle_id, stream_index(stream))).read()
        }
    }

    #[abi(embed_v0)]
    impl ExecutorAdminImpl of IExecutorAdmin<ContractState> {
        fn set_adapter(ref self: ContractState, adapter: ContractAddress) {
            self.ownable.assert_only_owner();
            self.adapter.write(adapter);
            self.emit(AdapterSet { adapter });
        }

        fn set_attestation(
            ref self: ContractState, validation_registry: ContractAddress, agent_id: u256,
        ) {
            self.ownable.assert_only_owner();
            self.validation_registry.write(validation_registry);
            self.agent_id.write(agent_id);
            self.emit(AttestationSet { validation_registry, agent_id });
        }

        fn registry(self: @ContractState) -> ContractAddress {
            self.registry.read()
        }
        fn vault(self: @ContractState) -> ContractAddress {
            self.vault.read()
        }
        fn adapter(self: @ContractState) -> ContractAddress {
            self.adapter.read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Write an ERC-8004 attestation that this cycle executed, if configured.
        /// The executor is the validator and gives the cycle a passing score.
        fn attest(ref self: ContractState, cycle_id: u64, total: Commitment) {
            let vr = self.validation_registry.read();
            if vr.is_zero() {
                return;
            }
            let agent_id = self.agent_id.read();
            let request_hash: u256 = poseidon_hash_span(
                array![cycle_id.into(), total.x, total.y].span(),
            )
                .into();
            let registry = IValidationRegistryDispatcher { contract_address: vr };
            registry
                .validation_request(
                    starknet::get_contract_address(), agent_id, "chaum://cycle", request_hash,
                );
            registry
                .validation_response(
                    request_hash, 100_u8, "chaum://cycle/ok", request_hash, "chaum-cycle",
                );
        }
    }
}
