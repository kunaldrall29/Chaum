// Declare + deploy all Chaum contracts with a deployer/owner account, wire them,
// and fund the vault. Returns the deployed addresses. Used by the demo and the
// (credential-gated) Sepolia deploy.

import { Account, CallData, Contract, type RpcProvider } from "starknet";
import { artifact } from "./artifacts.ts";

export interface Addresses {
  token: string;
  registry: string;
  vault: string;
  adapter: string;
  executor: string;
}

export interface DeployParams {
  owner: string;
  agentAddress: string;
  agentPubkey: string;
  payeeRoot: bigint;
  maxPerPayee: bigint;
  maxPerCycle: bigint;
  cadence: bigint;
  tokenName: string;
  tokenSymbol: string;
  initialSupply: bigint;
  fundAmount: bigint;
}

async function declareDeploy(account: Account, name: string, calldata: Record<string, any>): Promise<string> {
  const { sierra, casm } = artifact(name);
  const constructorCalldata = new CallData(sierra.abi).compile("constructor", calldata);
  const res = await account.declareAndDeploy({ contract: sierra, casm, constructorCalldata });
  return res.deploy.contract_address;
}

function connect(account: Account, name: string, address: string): Contract {
  return new Contract({ abi: artifact(name).sierra.abi, address, providerOrAccount: account });
}

export async function deployAll(
  account: Account,
  provider: RpcProvider,
  p: DeployParams,
): Promise<Addresses> {
  const token = await declareDeploy(account, "MockERC20", {
    name: p.tokenName,
    symbol: p.tokenSymbol,
    initial_supply: p.initialSupply,
    recipient: p.owner,
  });
  const registry = await declareDeploy(account, "PayrollRegistry", { owner: p.owner });
  const vault = await declareDeploy(account, "DisbursementVault", { owner: p.owner, token });
  const adapter = await declareDeploy(account, "PublicTransferAdapter", {
    owner: p.owner,
    token,
    vault,
  });
  const executor = await declareDeploy(account, "DisbursementExecutor", {
    owner: p.owner,
    registry,
    vault,
    adapter,
  });

  const reg = connect(account, "PayrollRegistry", registry);
  const vlt = connect(account, "DisbursementVault", vault);
  const adp = connect(account, "PublicTransferAdapter", adapter);
  const tok = connect(account, "MockERC20", token);

  // Wire executor + register the policy (owner multicall).
  const tx1 = await account.execute([
    reg.populate("set_executor", [executor]),
    adp.populate("set_executor", [executor]),
    reg.populate("create_policy", [
      p.payeeRoot,
      p.maxPerPayee,
      p.maxPerCycle,
      p.cadence,
      p.agentAddress,
      p.agentPubkey,
    ]),
  ]);
  await provider.waitForTransaction(tx1.transaction_hash);

  // Fund the vault and approve the adapter (owner multicall).
  const tx2 = await account.execute([
    tok.populate("approve", [vault, p.fundAmount]),
    vlt.populate("deposit", [p.fundAmount]),
    vlt.populate("set_spender", [adapter]),
  ]);
  await provider.waitForTransaction(tx2.transaction_hash);

  return { token, registry, vault, adapter, executor };
}
