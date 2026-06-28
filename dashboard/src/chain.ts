// Live Starknet reads (and best-effort wallet writes) for the console.
// All display data comes from the deployed Sepolia contracts — nothing is mocked.

import { Contract, RpcProvider, hash } from "starknet";
import config from "./config.json";
import registryAbi from "./abi/registry.json";
import executorAbi from "./abi/executor.json";
import erc20Abi from "./abi/erc20.json";

export const CFG = config;
export const provider = new RpcProvider({ nodeUrl: config.rpcUrl });

const registry = new Contract({ abi: registryAbi as any, address: config.addresses.registry, providerOrAccount: provider });
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
  const res: any = await provider.getEvents({
    address: config.addresses.executor,
    from_block: { block_number: (config as any).fromBlock ?? 0 },
    to_block: "latest",
    keys: [[key]],
    chunk_size: 100,
  });
  const out: CycleEvent[] = [];
  for (const ev of res.events ?? []) {
    // keys = [selector, cycle_id]; data = [payee_count, cx, cy, caller, ts]
    const cycleId = ev.keys?.[1] ? Number(BigInt(ev.keys[1])) : 0;
    const payeeCount = ev.data?.[0] ? Number(BigInt(ev.data[0])) : 0;
    out.push({
      cycleId,
      payeeCount,
      txHash: ev.transaction_hash,
      blockNumber: ev.block_number ?? 0,
    });
  }
  return out.reverse();
}

export const explorerTx = (h: string) => `${config.explorer}/tx/${h}`;
export const explorerContract = (a: string) => `${config.explorer}/contract/${a}`;
export const short = (a: string | bigint) => {
  const s = typeof a === "bigint" ? "0x" + a.toString(16) : a;
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
};
