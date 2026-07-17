use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use chaum::interfaces::i_executor::{IDisbursementVaultDispatcher, IDisbursementVaultDispatcherTrait};
use starknet::ContractAddress;

fn OWNER() -> ContractAddress {
    'owner'.try_into().unwrap()
}
fn STRANGER() -> ContractAddress {
    'stranger'.try_into().unwrap()
}
fn ADAPTER() -> ContractAddress {
    'adapter'.try_into().unwrap()
}

const SUPPLY: u256 = 1_000_000;

fn deploy_token(recipient: ContractAddress) -> IERC20Dispatcher {
    let contract = declare("MockERC20").unwrap().contract_class();
    let mut cd = array![];
    let name: ByteArray = "Mock USD";
    name.serialize(ref cd);
    let symbol: ByteArray = "mUSD";
    symbol.serialize(ref cd);
    SUPPLY.serialize(ref cd);
    recipient.serialize(ref cd);
    let (addr, _) = contract.deploy(@cd).unwrap();
    IERC20Dispatcher { contract_address: addr }
}

fn deploy_vault(owner: ContractAddress, token: ContractAddress) -> IDisbursementVaultDispatcher {
    let contract = declare("DisbursementVault").unwrap().contract_class();
    let cd = array![owner.into(), token.into()];
    let (addr, _) = contract.deploy(@cd).unwrap();
    IDisbursementVaultDispatcher { contract_address: addr }
}

fn setup() -> (IERC20Dispatcher, IDisbursementVaultDispatcher) {
    let token = deploy_token(OWNER());
    let vault = deploy_vault(OWNER(), token.contract_address);
    (token, vault)
}

#[test]
fn test_deposit_and_balance() {
    let (token, vault) = setup();
    // owner approves the vault, then deposits
    start_cheat_caller_address(token.contract_address, OWNER());
    token.approve(vault.contract_address, 500);
    stop_cheat_caller_address(token.contract_address);

    start_cheat_caller_address(vault.contract_address, OWNER());
    vault.deposit(500);
    stop_cheat_caller_address(vault.contract_address);

    assert(vault.balance() == 500, 'vault bal');
    assert(token.balance_of(OWNER()) == SUPPLY - 500, 'owner bal');
}

#[test]
fn test_withdraw() {
    let (token, vault) = setup();
    start_cheat_caller_address(token.contract_address, OWNER());
    token.approve(vault.contract_address, 500);
    stop_cheat_caller_address(token.contract_address);

    start_cheat_caller_address(vault.contract_address, OWNER());
    vault.deposit(500);
    vault.withdraw(200);
    stop_cheat_caller_address(vault.contract_address);

    assert(vault.balance() == 300, 'vault bal');
    assert(token.balance_of(OWNER()) == SUPPLY - 300, 'owner bal');
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn test_deposit_non_owner() {
    let (_token, vault) = setup();
    start_cheat_caller_address(vault.contract_address, STRANGER());
    vault.deposit(100);
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn test_withdraw_non_owner() {
    let (_token, vault) = setup();
    start_cheat_caller_address(vault.contract_address, STRANGER());
    vault.withdraw(100);
}

#[test]
fn test_set_spender_approves_adapter() {
    let (token, vault) = setup();
    start_cheat_caller_address(vault.contract_address, OWNER());
    vault.set_spender(ADAPTER());
    stop_cheat_caller_address(vault.contract_address);
    // adapter now has a (large) allowance to pull from the vault
    let allowance = token.allowance(vault.contract_address, ADAPTER());
    assert(allowance > SUPPLY, 'adapter allowance');
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn test_set_spender_non_owner() {
    let (_token, vault) = setup();
    start_cheat_caller_address(vault.contract_address, STRANGER());
    vault.set_spender(ADAPTER());
}

#[test]
fn test_payment_token() {
    let (token, vault) = setup();
    assert(vault.payment_token() == token.contract_address, 'token addr');
}
