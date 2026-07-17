// Live Starknet reads (and best-effort wallet writes) for the console.
// All display data comes from the deployed Sepolia contracts — nothing is mocked.

import { Contract, RpcProvider, hash, CairoCustomEnum, type AccountInterface } from "starknet";
import config from "./config.json";
import registryAbi from "./abi/registry.json";
import vaultAbi from "./abi/vault.json";
import executorAbi from "./abi/executor.json";
import erc20Abi from "./abi/erc20.json";
import { commit, randomBlinding } from "./lib/commitments.ts";
import { buildTree, type Stream } from "./lib/merkle.ts";

export const CFG = config;
export const provider = new RpcProvider({ nodeUrl: config.rpcUrl });

const registry = new Contract({ abi: registryAbi as any, address: config.addresses.registry, providerOrAccount: provider });
const vault = new Contract({ abi: vaultAbi as any, address: config.addresses.vault, providerOrAccount: provider });
const executor = new Contract({ abi: executorAbi as any, address: config.addresses.executor, providerOrAccount: provider });
const token = new Contract({ abi: erc20Abi as any, address: config.addresses.token, providerOrAccount: provider });

// Cairo Stream enum for calldata (Payroll / Vendor / Grant).
export const streamCairo = (s: Stream) =>
  new CairoCustomEnum({
    Payroll: s === "payroll" ? {} : undefined,
    Vendor: s === "vendor" ? {} : undefined,
    Grant: s === "grant" ? {} : undefined,
  });

// Role enum index → name (mirror of contracts/src/types.cairo).
export const ROLE_NAMES = ["None", "Owner", "Operator", "Auditor", "Payee", "Stakeholder"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export interface Policy {
  owner: bigint;
  payeeRoot: bigint;
  maxPerPayee: bigint;
  maxPerCycle: bigint;
  cadence: bigint;
  execWindow: bigint;
  lastCycleAt: bigint;
  paused: boolean;
  agent: bigint;
  agentSessionPubkey: bigint;
  anomalyPayeeBps: number;
  anomalyTotalBps: number;
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
    execWindow: BigInt(p.exec_window),
    lastCycleAt: BigInt(p.last_cycle_at),
    paused: Boolean(p.paused),
    agent: BigInt(p.agent),
    agentSessionPubkey: BigInt(p.agent_session_pubkey),
    anomalyPayeeBps: Number(p.anomaly_payee_delta_bps),
    anomalyTotalBps: Number(p.anomaly_total_delta_bps),
  };
}

/** Read the on-chain role for an address (Owner / Operator / Auditor / Payee / Stakeholder / None). */
export async function getRole(address: string): Promise<RoleName> {
  const r: any = await registry.call("get_role", [address]);
  // CairoCustomEnum decode → activeVariant() name, or fall back to numeric index.
  const name = typeof r?.activeVariant === "function" ? r.activeVariant() : undefined;
  if (name && (ROLE_NAMES as readonly string[]).includes(name)) return name as RoleName;
  const idx = Number(typeof r === "object" && r !== null && "variant" in r ? 0 : r);
  return ROLE_NAMES[idx] ?? "None";
}

export async function getVaultBalance(): Promise<bigint> {
  return BigInt((await token.call("balance_of", [config.addresses.vault])) as any);
}

export async function getTokenSymbol(): Promise<string> {
  try {
    const s: any = await token.call("symbol");
    return typeof s === "string" ? s : String(s);
  } catch {
    return "cUSD";
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

/** Read the stored per-stream subtotal commitment (public; no role gate on the read). */
export async function streamCommitment(cycleId: number, stream: Stream): Promise<{ x: bigint; y: bigint }> {
  const c: any = await executor.call("stream_commitment", [cycleId, streamCairo(stream)]);
  return { x: BigInt(c.x), y: BigInt(c.y) };
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
      out.push({
        cycleId: ev.keys?.[1] ? Number(BigInt(ev.keys[1])) : 0,
        payeeCount: ev.data?.[0] ? Number(BigInt(ev.data[0])) : 0,
        txHash: ev.transaction_hash,
        blockNumber: ev.block_number ?? 0,
      });
    }
    continuation = res.continuation_token;
  } while (continuation);
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

/**
 * Payee: prove your own amount on-chain (reverts for anyone else). Caller-gated —
 * must be sent from the payee's own account.
 */
export function openOwn(
  account: AccountInterface,
  cycleId: number,
  payee: string,
  amount: bigint,
  blinding: bigint,
): Promise<string> {
  return send(account, [executor.populate("open_own", [cycleId, payee, amount, blinding])]);
}

/**
 * Stakeholder: verify a stream's subtotal on-chain. Role-gated on `get_caller_address()`,
 * so this must be an invoke from the stakeholder's account (a bare RPC read reverts
 * `CHAUM: role not permitted`). The tx succeeding IS the proof.
 */
export function verifyStreamAggregate(
  account: AccountInterface,
  cycleId: number,
  stream: Stream,
): Promise<string> {
  return send(account, [executor.populate("verify_stream_aggregate", [cycleId, streamCairo(stream)])]);
}

export interface BuiltCycle {
  cycleId: number;
  payouts: any[];
  total: bigint;
}

/** Build a fresh cycle (new blindings) over the configured payees+streams + run it. */
export async function runCycle(account: AccountInterface): Promise<{ txHash: string; cycleId: number }> {
  const events = await getCycleEvents();
  const cycleId = (events.length ? events[0].cycleId : 0) + 1;
  const payees = config.demoCycle.payouts as any[];
  const tree = buildTree(payees.map((p) => ({ payee: BigInt(p.payee), stream: p.stream as Stream })));
  const payouts = payees.map((p, i) => {
    const amount = BigInt(p.amount);
    const blinding = randomBlinding();
    return {
      payee: p.payee,
      stream: streamCairo(p.stream as Stream),
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
