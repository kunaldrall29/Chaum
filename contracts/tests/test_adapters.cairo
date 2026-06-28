use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use chaum::interfaces::i_executor::{IDisbursementVaultDispatcher, IDisbursementVaultDispatcherTrait};
use chaum::interfaces::i_shielded_transfer::{
    IShieldedTransferDispatcher, IShieldedTransferDispatcherTrait, ITransferAdapterAdminDispatcher,
    ITransferAdapterAdminDispatcherTrait,
};
use starknet::ContractAddress;

fn OWNER() -> ContractAddress {
    'owner'.try_into().unwrap()
}
fn EXECUTOR() -> ContractAddress {
    'executor'.try_into().unwrap()
}
fn PAYEE() -> ContractAddress {
    'payee'.try_into().unwrap()
}
fn STRANGER() -> ContractAddress {
    'stranger'.try_into().unwrap()
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

fn deploy_vault(token: ContractAddress) -> IDisbursementVaultDispatcher {
    let contract = declare("DisbursementVault").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![OWNER().into(), token.into()]).unwrap();
    IDisbursementVaultDispatcher { contract_address: addr }
}

fn deploy_public_adapter(
    token: ContractAddress, vault: ContractAddress,
) -> (IShieldedTransferDispatcher, ITransferAdapterAdminDispatcher) {
    let contract = declare("PublicTransferAdapter").unwrap().contract_class();
    let (addr, _) = contract
        .deploy(@array![OWNER().into(), token.into(), vault.into()])
        .unwrap();
    (
        IShieldedTransferDispatcher { contract_address: addr },
        ITransferAdapterAdminDispatcher { contract_address: addr },
    )
}

// Fund the vault with `amount` and wire the adapter as spender + executor.
fn setup_funded(
    amount: u256,
) -> (IERC20Dispatcher, IDisbursementVaultDispatcher, IShieldedTransferDispatcher) {
    let token = deploy_token(OWNER());
    let vault = deploy_vault(token.contract_address);
    let (adapter, admin) = deploy_public_adapter(token.contract_address, vault.contract_address);

    start_cheat_caller_address(token.contract_address, OWNER());
    token.approve(vault.contract_address, amount);
    stop_cheat_caller_address(token.contract_address);

    start_cheat_caller_address(vault.contract_address, OWNER());
    vault.deposit(amount);
    vault.set_spender(adapter.contract_address);
    stop_cheat_caller_address(vault.contract_address);

    start_cheat_caller_address(adapter.contract_address, OWNER());
    admin.set_executor(EXECUTOR());
    stop_cheat_caller_address(adapter.contract_address);

    (token, vault, adapter)
}

#[test]
fn test_public_adapter_executor_can_pay() {
    let (token, vault, adapter) = setup_funded(1000);
    start_cheat_caller_address(adapter.contract_address, EXECUTOR());
    adapter.transfer(PAYEE(), 300, array![].span());
    stop_cheat_caller_address(adapter.contract_address);
    assert(token.balance_of(PAYEE()) == 300, 'payee bal');
    assert(vault.balance() == 700, 'vault bal');
}

#[test]
#[should_panic(expected: 'CHAUM: caller not executor')]
fn test_public_adapter_non_executor_reverts() {
    let (_token, _vault, adapter) = setup_funded(1000);
    start_cheat_caller_address(adapter.contract_address, STRANGER());
    adapter.transfer(PAYEE(), 300, array![].span());
}

#[test]
fn test_set_executor_view() {
    let token = deploy_token(OWNER());
    let vault = deploy_vault(token.contract_address);
    let (adapter, admin) = deploy_public_adapter(token.contract_address, vault.contract_address);
    start_cheat_caller_address(adapter.contract_address, OWNER());
    admin.set_executor(EXECUTOR());
    stop_cheat_caller_address(adapter.contract_address);
    assert(admin.executor() == EXECUTOR(), 'executor set');
}

#[test]
#[should_panic(expected: 'STRK20: SDK not available (T2)')]
fn test_strk20_stub_reverts() {
    let token = deploy_token(OWNER());
    let vault = deploy_vault(token.contract_address);
    let contract = declare("Strk20TransferAdapter").unwrap().contract_class();
    let (addr, _) = contract
        .deploy(@array![OWNER().into(), token.contract_address.into(), vault.contract_address.into()])
        .unwrap();
    let adapter = IShieldedTransferDispatcher { contract_address: addr };
    let admin = ITransferAdapterAdminDispatcher { contract_address: addr };
    start_cheat_caller_address(addr, OWNER());
    admin.set_executor(EXECUTOR());
    stop_cheat_caller_address(addr);
    start_cheat_caller_address(addr, EXECUTOR());
    adapter.transfer(PAYEE(), 300, array![].span());
}
