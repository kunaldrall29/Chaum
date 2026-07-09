//! KYT / sanctions-screening oracle seam. The executor consults this before a
//! payee is paid. Designed so a real TRM / Chainalysis-class provider can replace
//! the mock without touching the executor.
//!
//! Verdict codes: 0 = unknown (not screened), 1 = allow, 2 = deny.

use starknet::ContractAddress;

pub const KYT_UNKNOWN: u8 = 0;
pub const KYT_ALLOW: u8 = 1;
pub const KYT_DENY: u8 = 2;

#[starknet::interface]
pub trait IKytOracle<TContractState> {
    fn screen(self: @TContractState, account: ContractAddress) -> u8;
}

/// Admin surface for the mock (settable verdicts on devnet).
#[starknet::interface]
pub trait IMockKyt<TContractState> {
    fn set_verdict(ref self: TContractState, account: ContractAddress, verdict: u8);
}
