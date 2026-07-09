use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp, stop_cheat_block_timestamp,
};
use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use chaum::interfaces::i_executor::{
    IPayrollRegistryDispatcher, IPayrollRegistryDispatcherTrait, IDisbursementVaultDispatcher,
    IDisbursementVaultDispatcherTrait, IDisbursementExecutorDispatcher,
    IDisbursementExecutorDispatcherTrait,
};
use chaum::interfaces::i_shielded_transfer::{
    ITransferAdapterAdminDispatcher, ITransferAdapterAdminDispatcherTrait,
};
use chaum::types::{PayoutInput, Stream, stream_felt, Role};
use chaum::commitments::commit;
use chaum::merkle::{hash_leaf, commutative_hash};
use starknet::ContractAddress;

fn OWNER() -> ContractAddress { 'owner'.try_into().unwrap() }
fn AGENT() -> ContractAddress { 'agent'.try_into().unwrap() }
fn STRANGER() -> ContractAddress { 'stranger'.try_into().unwrap() }
fn AUDITOR() -> ContractAddress { 'auditor'.try_into().unwrap() }
fn STAKEHOLDER() -> ContractAddress { 'stakeholder'.try_into().unwrap() }
fn P0() -> ContractAddress { 'payee0'.try_into().unwrap() }
fn P1() -> ContractAddress { 'payee1'.try_into().unwrap() }
fn P2() -> ContractAddress { 'payee2'.try_into().unwrap() }
fn P3() -> ContractAddress { 'payee3'.try_into().unwrap() }

const SUPPLY: u256 = 1_000_000;
const MAX_PER_PAYEE: u256 = 500;
const MAX_PER_CYCLE: u256 = 2000;
const CADENCE: u64 = 3600;
const NOW: u64 = 100_000;

#[derive(Drop, Copy)]
struct Env {
    token: IERC20Dispatcher,
    registry: IPayrollRegistryDispatcher,
    vault: IDisbursementVaultDispatcher,
    exec: IDisbursementExecutorDispatcher,
}

// Streams: P0,P1 = Payroll; P2 = Vendor; P3 = Grant.
fn L0() -> felt252 { hash_leaf(P0(), stream_felt(Stream::Payroll)) }
fn L1() -> felt252 { hash_leaf(P1(), stream_felt(Stream::Payroll)) }
fn L2() -> felt252 { hash_leaf(P2(), stream_felt(Stream::Vendor)) }
fn L3() -> felt252 { hash_leaf(P3(), stream_felt(Stream::Grant)) }

fn payee_root() -> felt252 {
    commutative_hash(commutative_hash(L0(), L1()), commutative_hash(L2(), L3()))
}
fn proof_p0() -> Span<felt252> { array![L1(), commutative_hash(L2(), L3())].span() }
fn proof_p1() -> Span<felt252> { array![L0(), commutative_hash(L2(), L3())].span() }
fn proof_p2() -> Span<felt252> { array![L3(), commutative_hash(L0(), L1())].span() }
fn proof_p3() -> Span<felt252> { array![L2(), commutative_hash(L0(), L1())].span() }

fn payout(
    payee: ContractAddress, stream: Stream, amount: u256, blinding: felt252, proof: Span<felt252>,
) -> PayoutInput {
    let amount_felt: felt252 = amount.try_into().unwrap();
    PayoutInput {
        payee, stream, amount, blinding, commitment: commit(amount_felt, blinding), merkle_proof: proof,
    }
}

// Standard cycle: 1000 total, Payroll 300 / Vendor 300 / Grant 400.
fn standard_payouts() -> Array<PayoutInput> {
    array![
        payout(P0(), Stream::Payroll, 100, 11, proof_p0()),
        payout(P1(), Stream::Payroll, 200, 22, proof_p1()),
        payout(P2(), Stream::Vendor, 300, 33, proof_p2()),
        payout(P3(), Stream::Grant, 400, 44, proof_p3()),
    ]
}

fn deploy_token() -> IERC20Dispatcher {
    let c = declare("MockERC20").unwrap().contract_class();
    let mut cd = array![];
    let name: ByteArray = "Mock USD";
    name.serialize(ref cd);
    let symbol: ByteArray = "mUSD";
    symbol.serialize(ref cd);
    SUPPLY.serialize(ref cd);
    OWNER().serialize(ref cd);
    let (a, _) = c.deploy(@cd).unwrap();
    IERC20Dispatcher { contract_address: a }
}

fn setup() -> Env {
    let token = deploy_token();
    let reg_c = declare("PayrollRegistry").unwrap().contract_class();
    let (reg_a, _) = reg_c.deploy(@array![OWNER().into()]).unwrap();
    let vault_c = declare("DisbursementVault").unwrap().contract_class();
    let (vault_a, _) = vault_c.deploy(@array![OWNER().into(), token.contract_address.into()]).unwrap();
    let adapter_c = declare("PublicTransferAdapter").unwrap().contract_class();
    let (adapter_a, _) = adapter_c
        .deploy(@array![OWNER().into(), token.contract_address.into(), vault_a.into()])
        .unwrap();
    let exec_c = declare("DisbursementExecutor").unwrap().contract_class();
    let (exec_a, _) = exec_c
        .deploy(@array![OWNER().into(), reg_a.into(), vault_a.into(), adapter_a.into()])
        .unwrap();

    let registry = IPayrollRegistryDispatcher { contract_address: reg_a };
    let vault = IDisbursementVaultDispatcher { contract_address: vault_a };
    let adapter_admin = ITransferAdapterAdminDispatcher { contract_address: adapter_a };
    let exec = IDisbursementExecutorDispatcher { contract_address: exec_a };

    start_cheat_caller_address(reg_a, OWNER());
    registry.set_executor(exec_a);
    registry.create_policy(payee_root(), MAX_PER_PAYEE, MAX_PER_CYCLE, CADENCE, AGENT(), 0xabc);
    // roles: auditor / stakeholder / a payee
    registry.set_role(AUDITOR(), Role::Auditor);
    registry.set_role(STAKEHOLDER(), Role::Stakeholder);
    registry.set_role(P2(), Role::Payee);
    stop_cheat_caller_address(reg_a);

    start_cheat_caller_address(adapter_a, OWNER());
    adapter_admin.set_executor(exec_a);
    stop_cheat_caller_address(adapter_a);

    start_cheat_caller_address(token.contract_address, OWNER());
    token.approve(vault_a, 10_000);
    stop_cheat_caller_address(token.contract_address);
    start_cheat_caller_address(vault_a, OWNER());
    vault.deposit(10_000);
    vault.set_spender(adapter_a);
    stop_cheat_caller_address(vault_a);

    Env { token, registry, vault, exec }
}

fn run_cycle(env: Env, cycle_id: u64, payouts: Array<PayoutInput>) {
    start_cheat_block_timestamp(env.exec.contract_address, NOW);
    start_cheat_caller_address(env.exec.contract_address, AGENT());
    env.exec.execute_cycle(cycle_id, payouts);
    stop_cheat_caller_address(env.exec.contract_address);
    stop_cheat_block_timestamp(env.exec.contract_address);
}

// ---------------- happy path + disclosure ----------------

#[test]
fn test_full_cycle_and_aggregate() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    assert(env.token.balance_of(P0()) == 100, 'p0 paid');
    assert(env.token.balance_of(P3()) == 400, 'p3 paid');
    assert(env.vault.balance() == 10_000 - 1000, 'vault debited');
    assert(env.exec.verify_aggregate(1), 'aggregate verifies');
    let s = env.exec.get_cycle(1);
    assert(s.payee_count == 4, 'count');
    assert(env.registry.get_policy().last_cycle_at == NOW, 'last_cycle_at');
}

#[test]
fn test_stream_subtotals_verify() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    // Stakeholder can verify each category total, without any individual split.
    start_cheat_caller_address(env.exec.contract_address, STAKEHOLDER());
    assert(env.exec.verify_stream_aggregate(1, Stream::Payroll), 'payroll ok');
    assert(env.exec.verify_stream_aggregate(1, Stream::Vendor), 'vendor ok');
    assert(env.exec.verify_stream_aggregate(1, Stream::Grant), 'grant ok');
    stop_cheat_caller_address(env.exec.contract_address);
}

#[test]
#[should_panic(expected: 'CHAUM: role not permitted')]
fn test_stream_aggregate_forbidden_stranger() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    // No role → cannot see category totals.
    start_cheat_caller_address(env.exec.contract_address, STRANGER());
    env.exec.verify_stream_aggregate(1, Stream::Payroll);
}

#[test]
#[should_panic(expected: 'CHAUM: role not permitted')]
fn test_stream_aggregate_forbidden_payee() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    // A bare payee cannot see category totals either.
    start_cheat_caller_address(env.exec.contract_address, P2());
    env.exec.verify_stream_aggregate(1, Stream::Payroll);
}

#[test]
#[should_panic(expected: 'CHAUM: caller not payee')]
fn test_stakeholder_cannot_open_individual() {
    // Scope isolation: Stakeholder proves categories but cannot open a single payee.
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    start_cheat_caller_address(env.exec.contract_address, STAKEHOLDER());
    env.exec.open_own(1, P0(), 100, 11);
}

#[test]
fn test_open_own_correct() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    start_cheat_caller_address(env.exec.contract_address, P2());
    let ok = env.exec.open_own(1, P2(), 300, 33);
    stop_cheat_caller_address(env.exec.contract_address);
    assert(ok, 'p2 opens own');
}

#[test]
#[should_panic(expected: 'CHAUM: caller not payee')]
fn test_open_own_wrong_caller() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    start_cheat_caller_address(env.exec.contract_address, STRANGER());
    env.exec.open_own(1, P2(), 300, 33);
}

#[test]
#[should_panic(expected: 'CHAUM: bad opening')]
fn test_open_own_wrong_amount() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    start_cheat_caller_address(env.exec.contract_address, P2());
    env.exec.open_own(1, P2(), 301, 33);
}

// ---------------- execution window (jitter room) ----------------

#[test]
fn test_within_window_ok() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    start_cheat_caller_address(env.registry.contract_address, OWNER());
    env.registry.set_execution(100, 0, 0);
    stop_cheat_caller_address(env.registry.contract_address);
    // due = NOW + CADENCE; within [due, due+100]
    start_cheat_block_timestamp(env.exec.contract_address, NOW + CADENCE + 50);
    start_cheat_caller_address(env.exec.contract_address, AGENT());
    env.exec.execute_cycle(2, standard_payouts());
    stop_cheat_caller_address(env.exec.contract_address);
    stop_cheat_block_timestamp(env.exec.contract_address);
    assert(env.exec.verify_aggregate(2), 'cycle 2 ok');
}

#[test]
#[should_panic(expected: 'CHAUM: past exec window')]
fn test_past_window_reverts() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    start_cheat_caller_address(env.registry.contract_address, OWNER());
    env.registry.set_execution(100, 0, 0);
    stop_cheat_caller_address(env.registry.contract_address);
    start_cheat_block_timestamp(env.exec.contract_address, NOW + CADENCE + 500); // past window
    start_cheat_caller_address(env.exec.contract_address, AGENT());
    env.exec.execute_cycle(2, standard_payouts());
}

// ---------------- revert matrix ----------------

#[test]
#[should_panic(expected: 'CHAUM: unauthorized caller')]
fn test_wrong_caller() {
    let env = setup();
    start_cheat_block_timestamp(env.exec.contract_address, NOW);
    start_cheat_caller_address(env.exec.contract_address, STRANGER());
    env.exec.execute_cycle(1, standard_payouts());
}

#[test]
#[should_panic(expected: 'CHAUM: paused')]
fn test_paused() {
    let env = setup();
    start_cheat_caller_address(env.registry.contract_address, OWNER());
    env.registry.pause();
    stop_cheat_caller_address(env.registry.contract_address);
    run_cycle(env, 1, standard_payouts());
}

#[test]
#[should_panic(expected: 'CHAUM: agent revoked')]
fn test_revoked() {
    let env = setup();
    start_cheat_caller_address(env.registry.contract_address, OWNER());
    env.registry.revoke();
    stop_cheat_caller_address(env.registry.contract_address);
    run_cycle(env, 1, standard_payouts());
}

#[test]
#[should_panic(expected: 'CHAUM: cadence not elapsed')]
fn test_cadence_too_soon() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    start_cheat_block_timestamp(env.exec.contract_address, NOW + 10);
    start_cheat_caller_address(env.exec.contract_address, AGENT());
    env.exec.execute_cycle(2, standard_payouts());
}

#[test]
#[should_panic(expected: 'CHAUM: cycle already run')]
fn test_idempotent_cycle_id() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    start_cheat_block_timestamp(env.exec.contract_address, NOW + CADENCE * 2);
    start_cheat_caller_address(env.exec.contract_address, AGENT());
    env.exec.execute_cycle(1, standard_payouts());
}

#[test]
#[should_panic(expected: 'CHAUM: over per-payee cap')]
fn test_over_per_payee() {
    let env = setup();
    let payouts = array![payout(P0(), Stream::Payroll, 600, 11, proof_p0())];
    run_cycle(env, 1, payouts);
}

#[test]
#[should_panic(expected: 'CHAUM: over per-cycle cap')]
fn test_over_per_cycle() {
    let env = setup();
    let payouts = array![
        payout(P0(), Stream::Payroll, 500, 11, proof_p0()),
        payout(P1(), Stream::Payroll, 500, 22, proof_p1()),
        payout(P2(), Stream::Vendor, 500, 33, proof_p2()),
        payout(P3(), Stream::Grant, 500, 44, proof_p3()),
        payout(P0(), Stream::Payroll, 500, 55, proof_p0()),
    ];
    run_cycle(env, 1, payouts);
}

#[test]
#[should_panic(expected: 'CHAUM: payee not in set')]
fn test_non_member() {
    let env = setup();
    let payouts = array![payout(STRANGER(), Stream::Payroll, 100, 11, proof_p0())];
    run_cycle(env, 1, payouts);
}

#[test]
#[should_panic(expected: 'CHAUM: payee not in set')]
fn test_wrong_stream_reverts() {
    // P0 is registered under Payroll; claiming Vendor breaks membership.
    let env = setup();
    let payouts = array![payout(P0(), Stream::Vendor, 100, 11, proof_p0())];
    run_cycle(env, 1, payouts);
}

#[test]
#[should_panic(expected: 'CHAUM: zero blinding')]
fn test_zero_blinding() {
    let env = setup();
    let p = PayoutInput {
        payee: P0(), stream: Stream::Payroll, amount: 100, blinding: 0,
        commitment: commit(100, 1), merkle_proof: proof_p0(),
    };
    run_cycle(env, 1, array![p]);
}

#[test]
#[should_panic(expected: 'CHAUM: commitment mismatch')]
fn test_bad_commitment() {
    let env = setup();
    let p = PayoutInput {
        payee: P0(), stream: Stream::Payroll, amount: 100, blinding: 11,
        commitment: commit(999, 11), merkle_proof: proof_p0(),
    };
    run_cycle(env, 1, array![p]);
}

#[test]
#[should_panic(expected: 'CHAUM: vault underfunded')]
fn test_underfunded() {
    let env = setup();
    start_cheat_caller_address(env.vault.contract_address, OWNER());
    env.vault.withdraw(9_900);
    stop_cheat_caller_address(env.vault.contract_address);
    run_cycle(env, 1, standard_payouts());
}

#[test]
#[should_panic(expected: 'CHAUM: empty payouts')]
fn test_empty_payouts() {
    let env = setup();
    run_cycle(env, 1, array![]);
}

#[test]
fn test_owner_can_also_execute() {
    let env = setup();
    start_cheat_block_timestamp(env.exec.contract_address, NOW);
    start_cheat_caller_address(env.exec.contract_address, OWNER());
    env.exec.execute_cycle(1, standard_payouts());
    stop_cheat_caller_address(env.exec.contract_address);
    assert(env.exec.verify_aggregate(1), 'verifies');
}

#[test]
fn test_second_cycle_after_cadence() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    start_cheat_block_timestamp(env.exec.contract_address, NOW + CADENCE + 1);
    start_cheat_caller_address(env.exec.contract_address, AGENT());
    env.exec.execute_cycle(2, standard_payouts());
    stop_cheat_caller_address(env.exec.contract_address);
    stop_cheat_block_timestamp(env.exec.contract_address);
    assert(env.exec.verify_aggregate(2), 'cycle 2 verifies');
    assert(env.token.balance_of(P0()) == 200, 'p0 paid twice');
}
