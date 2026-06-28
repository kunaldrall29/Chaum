// Deterministic cycle engine: (policy, payees, now, balance) -> CycleDecision.
// No randomness except the per-payee blindings (which are secrets, generated here
// and returned to be persisted). No network, no LLM — pure and testable.

import { commit, addCommitments, randomBlinding, type Commitment } from "./commitments.ts";
import { buildTree } from "./merkle.ts";
import type { Payee } from "./payroll.ts";

export interface Policy {
  payeeRoot: bigint;
  maxPerPayee: bigint;
  maxPerCycle: bigint;
  cadence: bigint;
  lastCycleAt: bigint;
  paused: boolean;
  agent: bigint;
}

export interface PlannedPayout {
  payee: string;
  amount: bigint;
  blinding: bigint;
  commitment: Commitment;
  proof: bigint[];
}

export interface CyclePlan {
  payouts: PlannedPayout[];
  payeeRoot: bigint;
  totalAmount: bigint;
  totalBlinding: bigint;
  totalCommitment: Commitment;
}

export type Skip =
  | { run: false; reason: string };
export type Go =
  | { run: true };
export type Decision = Skip | Go;

/** Should a cycle run now? Mirrors the on-chain pre-conditions (cheap pre-check). */
export function decide(
  policy: Policy,
  now: bigint,
  vaultBalance: bigint,
  totalAmount: bigint,
): Decision {
  if (policy.paused) return { run: false, reason: "policy paused" };
  if (policy.agent === 0n) return { run: false, reason: "agent revoked" };
  if (now < policy.lastCycleAt + policy.cadence)
    return {
      run: false,
      reason: `cadence not elapsed (next at ${policy.lastCycleAt + policy.cadence}, now ${now})`,
    };
  if (totalAmount === 0n) return { run: false, reason: "nothing to pay" };
  if (totalAmount > policy.maxPerCycle)
    return { run: false, reason: `total ${totalAmount} exceeds per-cycle cap ${policy.maxPerCycle}` };
  if (vaultBalance < totalAmount)
    return { run: false, reason: `vault underfunded (${vaultBalance} < ${totalAmount})` };
  return { run: true };
}

/**
 * Build the full cycle plan: per-payee commitments (fresh blindings), Merkle
 * proofs against the payee set, and the aggregate. Validates per-payee caps
 * client-side so we never submit a cycle the contract would reject.
 */
export function buildCyclePlan(payees: Payee[], maxPerPayee: bigint): CyclePlan {
  for (const p of payees) {
    if (p.amount > maxPerPayee)
      throw new Error(`payee ${p.address} amount ${p.amount} exceeds per-payee cap ${maxPerPayee}`);
  }

  const tree = buildTree(payees.map((p) => BigInt(p.address)));

  let totalAmount = 0n;
  let totalBlinding = 0n;
  let acc: Commitment | null = null;
  const payouts: PlannedPayout[] = payees.map((p, i) => {
    const blinding = randomBlinding();
    const c = commit(p.amount, blinding);
    acc = acc === null ? c : addCommitments(acc, c);
    totalAmount += p.amount;
    totalBlinding += blinding;
    return { payee: p.address, amount: p.amount, blinding, commitment: c, proof: tree.proof(i) };
  });

  return {
    payouts,
    payeeRoot: tree.root,
    totalAmount,
    totalBlinding,
    totalCommitment: acc!,
  };
}

/** The payee Merkle root the policy must commit to for this payee set. */
export function payeeRootFor(payees: Payee[]): bigint {
  return buildTree(payees.map((p) => BigInt(p.address))).root;
}
