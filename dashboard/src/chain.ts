// Live Starknet reads (and best-effort wallet writes) for the console.
// All display data comes from the deployed Sepolia contracts — nothing is mocked.

import { Contract, RpcProvider, hash, type AccountInterface } from "starknet";
import config from "./config.json";
import registryAbi from "./abi/registry.json";
import vaultAbi from "./abi/vault.json";
import executorAbi from "./abi/executor.json";
import erc20Abi from "./abi/erc20.json";
import { commit, randomBlinding } from "./lib/commitments.ts";
import { buildTree } from "./lib/merkle.ts";

export const CFG = config;
export const provider = new RpcProvider({ nodeUrl: config.rpcUrl });

const registry = new Contract({ abi: registryAbi as any, address: config.addresses.registry, providerOrAccount: provider });
const vault = new Contract({ abi: vaultAbi as any, address: config.addresses.vault, providerOrAccount: provider });
const executor = new Contract({ abi: executorAbi as any, address: config.addresses.executor, providerOrAccount: provider });
const token = new Contract({ abi: erc20Abi as any, address: config.addresses.token, providerOrAccount: provider });

export interface Policy {
  owner: bigint;
  payeeRoot: bigint;
  maxPerPayee: bigint;
  maxPerCycle: bigint;
  cadence: bigint;
  lastCycleAt: bigint;
  paused: boolean;
  agent: bigint;
  agentSessionPubkey: bigint;
}

export interface CycleSummary {
  cycleId: number;
  payeeCount: number;
  totalCommitment: { x: bigint; y: bigint };
  executedAt: bigint;
  exists: boolean;
}

export async function getPolicy(): Promise<Policy> {
  const p: any = await registry.call("get_policy");
  return {
    owner: BigInt(p.owner),
    payeeRoot: BigInt(p.payee_root),
    maxPerPayee: BigInt(p.max_per_payee),
    maxPerCycle: BigInt(p.max_per_cycle),
    cadence: BigInt(p.cadence),
    lastCycleAt: BigInt(p.last_cycle_at),
    paused: Boolean(p.paused),
    agent: BigInt(p.agent),
    agentSessionPubkey: BigInt(p.agent_session_pubkey),
  };
}

export async function getVaultBalance(): Promise<bigint> {
  return BigInt((await token.call("balance_of", [config.addresses.vault])) as any);
}

export async function getTokenSymbol(): Promise<string> {
  try {
    const s: any = await token.call("symbol");
    // ByteArray decodes to string in starknet.js
    return typeof s === "string" ? s : String(s);
  } catch {
    return "mUSD";
  }
}

export async function getCycle(cycleId: number): Promise<CycleSummary> {
  const c: any = await executor.call("get_cycle", [cycleId]);
  const payeeCount = Number(c.payee_count);
  return {
    cycleId,
    payeeCount,
    totalCommitment: { x: BigInt(c.total_commitment.x), y: BigInt(c.total_commitment.y) },
    executedAt: BigInt(c.executed_at),
    exists: payeeCount > 0 || BigInt(c.executed_at) > 0n,
  };
}

export async function verifyAggregate(cycleId: number): Promise<boolean> {
  return Boolean(await executor.call("verify_aggregate", [cycleId]));
}

export async function commitmentOf(cycleId: number, payee: string): Promise<{ x: bigint; y: bigint }> {
  const c: any = await executor.call("commitment_of", [cycleId, payee]);
  return { x: BigInt(c.x), y: BigInt(c.y) };
}

export interface CycleEvent {
  cycleId: number;
  payeeCount: number;
  txHash: string;
  blockNumber: number;
}

/** Read CycleExecuted events from the executor (real activity log). */
export async function getCycleEvents(): Promise<CycleEvent[]> {
  const key = hash.getSelectorFromName("CycleExecuted");
  const out: CycleEvent[] = [];
  let continuation: string | undefined = undefined;
  // Follow the RPC pagination token so events across a wide block range aren't missed.
  do {
    const res: any = await provider.getEvents({
      address: config.addresses.executor,
      from_block: { block_number: (config as any).fromBlock ?? 0 },
      to_block: "latest",
      keys: [[key]],
      chunk_size: 100,
      ...(continuation ? { continuation_token: continuation } : {}),
    });
    for (const ev of res.events ?? []) {
      // keys = [selector, cycle_id]; data = [payee_count, cx, cy, caller, ts]
      out.push({
        cycleId: ev.keys?.[1] ? Number(BigInt(ev.keys[1])) : 0,
        payeeCount: ev.data?.[0] ? Number(BigInt(ev.data[0])) : 0,
        txHash: ev.transaction_hash,
        blockNumber: ev.block_number ?? 0,
      });
    }
    continuation = res.continuation_token;
  } while (continuation);
  // newest first
  return out.sort((a, b) => b.cycleId - a.cycleId);
}

// ---------------- writes (via connected wallet) ----------------

async function send(account: AccountInterface, calls: any[]): Promise<string> {
  const { transaction_hash } = await account.execute(calls);
  await provider.waitForTransaction(transaction_hash, { retryInterval: 4000 });
  return transaction_hash;
}

/** Owner: fund the vault (approve + deposit in one multicall). */
export function deposit(account: AccountInterface, amount: bigint): Promise<string> {
  return send(account, [
    token.populate("approve", [config.addresses.vault, amount]),
    vault.populate("deposit", [amount]),
  ]);
}

/** Owner: withdraw from the vault back to the owner. */
export function withdraw(account: AccountInterface, amount: bigint): Promise<string> {
  return send(account, [vault.populate("withdraw", [amount])]);
}

/** Owner: pause / unpause the policy. */
export function setPaused(account: AccountInterface, paused: boolean): Promise<string> {
  return send(account, [registry.populate(paused ? "pause" : "unpause", [])]);
}

/** Owner: revoke the agent session key. */
export function revokeAgent(account: AccountInterface): Promise<string> {
  return send(account, [registry.populate("revoke", [])]);
}

/** Payee: prove your own amount on-chain (reverts for anyone else). */
export function openOwn(
  account: AccountInterface,
  cycleId: number,
  payee: string,
  amount: bigint,
  blinding: bigint,
): Promise<string> {
  return send(account, [executor.populate("open_own", [cycleId, payee, amount, blinding])]);
}

export interface BuiltCycle {
  cycleId: number;
  payouts: any[];
  total: bigint;
}

/** Build a fresh cycle (new blindings) over the configured payees + run it. */
export async function runCycle(account: AccountInterface): Promise<{ txHash: string; cycleId: number }> {
  const events = await getCycleEvents();
  const cycleId = (events.length ? events[0].cycleId : 0) + 1;
  const payees = config.demoCycle.payouts as any[];
  const tree = buildTree(payees.map((p) => BigInt(p.payee)));
  const payouts = payees.map((p, i) => {
    const amount = BigInt(p.amount);
    const blinding = randomBlinding();
    return {
      payee: p.payee,
      amount,
      blinding,
      commitment: commit(amount, blinding),
      merkle_proof: tree.proof(i),
    };
  });
  const txHash = await send(account, [executor.populate("execute_cycle", [cycleId, payouts])]);
  return { txHash, cycleId };
}

export const explorerTx = (h: string) => `${config.explorer}/tx/${h}`;
export const explorerContract = (a: string) => `${config.explorer}/contract/${a}`;
export const short = (a: string | bigint) => {
  const s = typeof a === "bigint" ? "0x" + a.toString(16) : a;
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
};
