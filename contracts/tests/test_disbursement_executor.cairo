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
use chaum::types::PayoutInput;
use chaum::commitments::commit;
use chaum::merkle::{hash_leaf, commutative_hash};
use starknet::ContractAddress;

fn OWNER() -> ContractAddress {
    'owner'.try_into().unwrap()
}
fn AGENT() -> ContractAddress {
    'agent'.try_into().unwrap()
}
fn STRANGER() -> ContractAddress {
    'stranger'.try_into().unwrap()
}
fn P0() -> ContractAddress {
    'payee0'.try_into().unwrap()
}
fn P1() -> ContractAddress {
    'payee1'.try_into().unwrap()
}
fn P2() -> ContractAddress {
    'payee2'.try_into().unwrap()
}
fn P3() -> ContractAddress {
    'payee3'.try_into().unwrap()
}

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

// 4-leaf Merkle tree over the payee set.
fn payee_root() -> felt252 {
    let n01 = commutative_hash(hash_leaf(P0()), hash_leaf(P1()));
    let n23 = commutative_hash(hash_leaf(P2()), hash_leaf(P3()));
    commutative_hash(n01, n23)
}
fn proof_p0() -> Span<felt252> {
    let n23 = commutative_hash(hash_leaf(P2()), hash_leaf(P3()));
    array![hash_leaf(P1()), n23].span()
}
fn proof_p1() -> Span<felt252> {
    let n23 = commutative_hash(hash_leaf(P2()), hash_leaf(P3()));
    array![hash_leaf(P0()), n23].span()
}
fn proof_p2() -> Span<felt252> {
    let n01 = commutative_hash(hash_leaf(P0()), hash_leaf(P1()));
    array![hash_leaf(P3()), n01].span()
}
fn proof_p3() -> Span<felt252> {
    let n01 = commutative_hash(hash_leaf(P0()), hash_leaf(P1()));
    array![hash_leaf(P2()), n01].span()
}

fn payout(payee: ContractAddress, amount: u256, blinding: felt252, proof: Span<felt252>) -> PayoutInput {
    let amount_felt: felt252 = amount.try_into().unwrap();
    PayoutInput { payee, amount, blinding, commitment: commit(amount_felt, blinding), merkle_proof: proof }
}

// Standard 4-payee cycle totalling 1000, all within caps.
fn standard_payouts() -> Array<PayoutInput> {
    array![
        payout(P0(), 100, 11, proof_p0()),
        payout(P1(), 200, 22, proof_p1()),
        payout(P2(), 300, 33, proof_p2()),
        payout(P3(), 400, 44, proof_p3()),
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

    // wire as owner
    start_cheat_caller_address(reg_a, OWNER());
    registry.set_executor(exec_a);
    registry.create_policy(payee_root(), MAX_PER_PAYEE, MAX_PER_CYCLE, CADENCE, AGENT(), 0xabc);
    stop_cheat_caller_address(reg_a);

    start_cheat_caller_address(adapter_a, OWNER());
    adapter_admin.set_executor(exec_a);
    stop_cheat_caller_address(adapter_a);

    // fund the vault and approve the adapter
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

    // payees were paid
    assert(env.token.balance_of(P0()) == 100, 'p0 paid');
    assert(env.token.balance_of(P3()) == 400, 'p3 paid');
    assert(env.vault.balance() == 10_000 - 1000, 'vault debited');

    // aggregate verifies (Σ commitments == total, opens to public total)
    assert(env.exec.verify_aggregate(1), 'aggregate verifies');

    // cycle summary
    let s = env.exec.get_cycle(1);
    assert(s.payee_count == 4, 'count');
    assert(s.executed_at == NOW, 'ts');

    // registry cadence anchor advanced
    assert(env.registry.get_policy().last_cycle_at == NOW, 'last_cycle_at');
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
    // second cycle immediately after — cadence has not elapsed
    start_cheat_block_timestamp(env.exec.contract_address, NOW + 10);
    start_cheat_caller_address(env.exec.contract_address, AGENT());
    env.exec.execute_cycle(2, standard_payouts());
}

#[test]
#[should_panic(expected: 'CHAUM: cycle already run')]
fn test_idempotent_cycle_id() {
    let env = setup();
    run_cycle(env, 1, standard_payouts());
    // re-run same cycle id (cadence satisfied) — must reject duplicate
    start_cheat_block_timestamp(env.exec.contract_address, NOW + CADENCE * 2);
    start_cheat_caller_address(env.exec.contract_address, AGENT());
    env.exec.execute_cycle(1, standard_payouts());
}

#[test]
#[should_panic(expected: 'CHAUM: over per-payee cap')]
fn test_over_per_payee() {
    let env = setup();
    let payouts = array![payout(P0(), 600, 11, proof_p0())]; // > MAX_PER_PAYEE 500
    run_cycle(env, 1, payouts);
}

#[test]
#[should_panic(expected: 'CHAUM: over per-cycle cap')]
fn test_over_per_cycle() {
    let env = setup();
    // 5 payouts of 500 = 2500 > MAX_PER_CYCLE 2000 (reuse payees within per-payee cap)
    let payouts = array![
        payout(P0(), 500, 11, proof_p0()),
        payout(P1(), 500, 22, proof_p1()),
        payout(P2(), 500, 33, proof_p2()),
        payout(P3(), 500, 44, proof_p3()),
        payout(P0(), 500, 55, proof_p0()),
    ];
    run_cycle(env, 1, payouts);
}

#[test]
#[should_panic(expected: 'CHAUM: payee not in set')]
fn test_non_member() {
    let env = setup();
    // STRANGER with P0's proof — membership fails
    let payouts = array![payout(STRANGER(), 100, 11, proof_p0())];
    run_cycle(env, 1, payouts);
}

#[test]
#[should_panic(expected: 'CHAUM: zero blinding')]
fn test_zero_blinding() {
    let env = setup();
    // hand-build a payout with blinding 0 (commit would be amount*G only)
    let amount_felt: felt252 = 100;
    let p = PayoutInput {
        payee: P0(), amount: 100, blinding: 0, commitment: commit(amount_felt, 1), merkle_proof: proof_p0(),
    };
    run_cycle(env, 1, array![p]);
}

#[test]
#[should_panic(expected: 'CHAUM: commitment mismatch')]
fn test_bad_commitment() {
    let env = setup();
    // commitment computed for a different amount than declared
    let p = PayoutInput {
        payee: P0(), amount: 100, blinding: 11, commitment: commit(999, 11), merkle_proof: proof_p0(),
    };
    run_cycle(env, 1, array![p]);
}

#[test]
#[should_panic(expected: 'CHAUM: vault underfunded')]
fn test_underfunded() {
    // fresh env but withdraw nearly all funds first
    let env = setup();
    start_cheat_caller_address(env.vault.contract_address, OWNER());
    env.vault.withdraw(9_900); // leaves 100 < 1000 cycle total
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
    // owner is an allowed caller (not just the agent)
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
