use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use chaum::interfaces::i_executor::{IPayrollRegistryDispatcher, IPayrollRegistryDispatcherTrait};
use starknet::ContractAddress;

fn OWNER() -> ContractAddress {
    'owner'.try_into().unwrap()
}
fn AGENT() -> ContractAddress {
    'agent'.try_into().unwrap()
}
fn EXECUTOR() -> ContractAddress {
    'executor'.try_into().unwrap()
}
fn STRANGER() -> ContractAddress {
    'stranger'.try_into().unwrap()
}

const ROOT: felt252 = 0x1234;
const PUBKEY: felt252 = 0xabcd;

fn deploy() -> IPayrollRegistryDispatcher {
    let contract = declare("PayrollRegistry").unwrap().contract_class();
    let calldata = array![OWNER().into()];
    let (addr, _) = contract.deploy(@calldata).unwrap();
    IPayrollRegistryDispatcher { contract_address: addr }
}

fn deploy_and_init() -> IPayrollRegistryDispatcher {
    let reg = deploy();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.create_policy(ROOT, 1000_u256, 5000_u256, 3600_u64, AGENT(), PUBKEY);
    stop_cheat_caller_address(reg.contract_address);
    reg
}

#[test]
fn test_create_policy_happy() {
    let reg = deploy_and_init();
    let p = reg.get_policy();
    assert(p.owner == OWNER(), 'owner');
    assert(p.payee_root == ROOT, 'root');
    assert(p.max_per_payee == 1000, 'mpp');
    assert(p.max_per_cycle == 5000, 'mpc');
    assert(p.cadence == 3600, 'cadence');
    assert(p.agent == AGENT(), 'agent');
    assert(!p.paused, 'paused');
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn test_create_policy_non_owner() {
    let reg = deploy();
    start_cheat_caller_address(reg.contract_address, STRANGER());
    reg.create_policy(ROOT, 1000, 5000, 3600, AGENT(), PUBKEY);
}

#[test]
#[should_panic(expected: 'CHAUM: already initialized')]
fn test_create_policy_twice() {
    let reg = deploy_and_init();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.create_policy(ROOT, 1000, 5000, 3600, AGENT(), PUBKEY);
}

#[test]
#[should_panic(expected: 'CHAUM: caps must be nonzero')]
fn test_create_policy_zero_caps() {
    let reg = deploy();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.create_policy(ROOT, 0, 5000, 3600, AGENT(), PUBKEY);
}

#[test]
#[should_panic(expected: 'CHAUM: per-payee > per-cycle')]
fn test_create_policy_cap_order() {
    let reg = deploy();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.create_policy(ROOT, 6000, 5000, 3600, AGENT(), PUBKEY);
}

#[test]
#[should_panic(expected: 'CHAUM: payee root is zero')]
fn test_create_policy_zero_root() {
    let reg = deploy();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.create_policy(0, 1000, 5000, 3600, AGENT(), PUBKEY);
}

#[test]
fn test_update_policy() {
    let reg = deploy_and_init();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.update_policy(2000, 8000, 7200);
    stop_cheat_caller_address(reg.contract_address);
    let p = reg.get_policy();
    assert(p.max_per_payee == 2000, 'mpp');
    assert(p.max_per_cycle == 8000, 'mpc');
    assert(p.cadence == 7200, 'cadence');
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn test_update_policy_non_owner() {
    let reg = deploy_and_init();
    start_cheat_caller_address(reg.contract_address, STRANGER());
    reg.update_policy(2000, 8000, 7200);
}

#[test]
fn test_update_payees() {
    let reg = deploy_and_init();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.update_payees(0x9999);
    stop_cheat_caller_address(reg.contract_address);
    assert(reg.get_policy().payee_root == 0x9999, 'root');
}

#[test]
#[should_panic(expected: 'CHAUM: payee root is zero')]
fn test_update_payees_zero() {
    let reg = deploy_and_init();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.update_payees(0);
}

#[test]
fn test_pause_unpause() {
    let reg = deploy_and_init();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.pause();
    assert(reg.is_paused(), 'should pause');
    reg.unpause();
    assert(!reg.is_paused(), 'should unpause');
    stop_cheat_caller_address(reg.contract_address);
}

#[test]
fn test_revoke_zeroes_agent() {
    let reg = deploy_and_init();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.revoke();
    stop_cheat_caller_address(reg.contract_address);
    let p = reg.get_policy();
    assert(p.agent == Zeroable_zero(), 'agent zero');
    assert(p.agent_session_pubkey == 0, 'pubkey zero');
}

fn Zeroable_zero() -> ContractAddress {
    0.try_into().unwrap()
}

#[test]
fn test_set_executor_and_record_cycle() {
    let reg = deploy_and_init();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.set_executor(EXECUTOR());
    stop_cheat_caller_address(reg.contract_address);

    start_cheat_caller_address(reg.contract_address, EXECUTOR());
    reg.record_cycle(123456);
    stop_cheat_caller_address(reg.contract_address);

    assert(reg.get_policy().last_cycle_at == 123456, 'last_cycle_at');
}

#[test]
#[should_panic(expected: 'CHAUM: caller not executor')]
fn test_record_cycle_non_executor() {
    let reg = deploy_and_init();
    start_cheat_caller_address(reg.contract_address, OWNER());
    reg.set_executor(EXECUTOR());
    stop_cheat_caller_address(reg.contract_address);

    start_cheat_caller_address(reg.contract_address, STRANGER());
    reg.record_cycle(123456);
}
