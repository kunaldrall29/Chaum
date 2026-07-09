// Declare + deploy all Chaum contracts with a deployer/owner account, wire them,
// and fund the vault. Returns the deployed addresses. Used by the demo and the
// (credential-gated) Sepolia deploy.
//
// Hardened for flaky/rate-limited public RPCs: idempotent declares (skip if the
// class is already on-chain), retry on rate-limit errors with backoff, and slow
// transaction polling to avoid hammering the node.

import { Account, CallData, Contract, hash, type RpcProvider } from "starknet";
import { artifact } from "./artifacts.ts";

export interface Addresses {
  token: string;
  registry: string;
  vault: string;
  adapter: string;
  executor: string;
  kyt: string;
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
  execWindow: bigint;
  anomalyPayeeBps: number;
  anomalyTotalBps: number;
  kytRevertOnDeny: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimited(e: unknown): boolean {
  return /-32011|too fast|rate.?limit|429|limit exceeded|too many/i.test(String(e));
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let delay = 4000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRateLimited(e) || attempt >= 7) throw e;
      console.log(`  …${label} rate-limited, retry ${attempt} in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
      delay = Math.min(Math.round(delay * 1.7), 25000);
    }
  }
}

async function waitSlow(provider: RpcProvider, txHash: string) {
  await withRetry("wait", () => provider.waitForTransaction(txHash, { retryInterval: 6000 }));
}

async function declareDeploy(
  account: Account,
  provider: RpcProvider,
  name: string,
  calldata: Record<string, any>,
): Promise<string> {
  const { sierra, casm } = artifact(name);
  const classHash = hash.computeContractClassHash(sierra);

  // Idempotent + fee-efficient: skip declare entirely if the class is already
  // on-chain (avoids paying/estimating a declare for unchanged contracts).
  let onChain = false;
  try {
    await provider.getClassByHash(classHash);
    onChain = true;
  } catch {
    onChain = false;
  }
  if (onChain) {
    console.log(`  ${name} already declared (${classHash})`);
  } else {
    try {
      const dRes = await withRetry(`declare ${name}`, () => account.declare({ contract: sierra, casm }));
      await waitSlow(provider, dRes.transaction_hash);
      console.log(`  declared ${name} (${classHash})`);
    } catch (e) {
      if (/already declared|is already/i.test(String(e))) {
        console.log(`  ${name} already declared (${classHash})`);
      } else {
        throw e;
      }
    }
  }

  const constructorCalldata = new CallData(sierra.abi).compile("constructor", calldata);
  const dep = await withRetry(`deploy ${name}`, () =>
    account.deployContract({ classHash, constructorCalldata }),
  );
  await waitSlow(provider, dep.transaction_hash);
  console.log(`  deployed ${name} → ${dep.contract_address}`);
  await sleep(1500);
  return dep.contract_address;
}

function connect(account: Account, name: string, address: string): Contract {
  return new Contract({ abi: artifact(name).sierra.abi, address, providerOrAccount: account });
}

export async function deployAll(
  account: Account,
  provider: RpcProvider,
  p: DeployParams,
): Promise<Addresses> {
  const token = await declareDeploy(account, provider, "MockERC20", {
    name: p.tokenName,
    symbol: p.tokenSymbol,
    initial_supply: p.initialSupply,
    recipient: p.owner,
  });
  const registry = await declareDeploy(account, provider, "PayrollRegistry", { owner: p.owner });
  const vault = await declareDeploy(account, provider, "DisbursementVault", {
    owner: p.owner,
    token,
  });
  const adapter = await declareDeploy(account, provider, "PublicTransferAdapter", {
    owner: p.owner,
    token,
    vault,
  });
  const executor = await declareDeploy(account, provider, "DisbursementExecutor", {
    owner: p.owner,
    registry,
    vault,
    adapter,
  });
  const kyt = await declareDeploy(account, provider, "MockKytOracle", { owner: p.owner });

  const reg = connect(account, "PayrollRegistry", registry);
  const vlt = connect(account, "DisbursementVault", vault);
  const adp = connect(account, "PublicTransferAdapter", adapter);
  const tok = connect(account, "MockERC20", token);
  const exe = connect(account, "DisbursementExecutor", executor);

  // Wire executor + register the policy (owner multicall).
  const tx1 = await withRetry("wire", () =>
    account.execute([
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
    ]),
  );
  await waitSlow(provider, tx1.transaction_hash);
  console.log("  wired executor + policy");

  // Execution window + anomaly thresholds + compliance (owner multicall).
  const tx2 = await withRetry("config", () =>
    account.execute([
      reg.populate("set_execution", [p.execWindow, p.anomalyPayeeBps, p.anomalyTotalBps]),
      exe.populate("set_compliance", [kyt, p.kytRevertOnDeny]),
    ]),
  );
  await waitSlow(provider, tx2.transaction_hash);
  console.log("  set execution window + compliance");

  // Fund the vault and approve the adapter (owner multicall).
  const tx3 = await withRetry("fund", () =>
    account.execute([
      tok.populate("approve", [vault, p.fundAmount]),
      vlt.populate("deposit", [p.fundAmount]),
      vlt.populate("set_spender", [adapter]),
    ]),
  );
  await waitSlow(provider, tx3.transaction_hash);
  console.log("  funded vault + approved adapter");

  return { token, registry, vault, adapter, executor, kyt };
}
