// One cycle, end to end: decide -> reserve (idempotency) -> build -> simulate ->
// submit -> confirm -> persist. Deterministic; retries are bounded with backoff.
// The contract is the source of truth; this just proposes a well-formed cycle.

import { ChaumChain } from "./chain.ts";
import { AgentState } from "./state.ts";
import { decide, buildCyclePlan } from "./engine.ts";
import type { Payee } from "./payroll.ts";
import type { Logger } from "./logger.ts";

export interface RunResult {
  ran: boolean;
  reason?: string;
  cycleId?: number;
  txHash?: string;
  totalAmount?: bigint;
}

const MAX_RETRIES = 3;
const now = () => Math.floor(Date.now() / 1000);

/** Window-based cycle id: deterministic, monotonic, one per cadence window. */
export function cycleIdFor(nowSec: bigint, cadence: bigint): number {
  return Number(nowSec / (cadence > 0n ? cadence : 1n));
}

export async function runCycle(
  chain: ChaumChain,
  state: AgentState,
  payees: Payee[],
  log: Logger,
  opts: { dryRun: boolean; cycleId?: number },
): Promise<RunResult> {
  const policy = await chain.getPolicy();
  const balance = await chain.getVaultBalance();
  const totalAmount = payees.reduce((s, p) => s + p.amount, 0n);
  const nowSec = BigInt(now());

  const d = decide(policy, nowSec, balance, totalAmount);
  if (!d.run) {
    log.info({ reason: d.reason }, "cycle skipped"); // no-op IS the audit trail
    return { ran: false, reason: d.reason };
  }

  const cycleId = opts.cycleId ?? cycleIdFor(nowSec, policy.cadence);

  // Idempotency: never touch a cycle id we've already handled locally.
  if (state.hasCycle(cycleId)) {
    const rec = state.getCycle(cycleId)!;
    log.info({ cycleId, status: rec.status }, "cycle already handled — skip");
    return { ran: false, reason: `cycle ${cycleId} already ${rec.status}`, cycleId };
  }

  const plan = buildCyclePlan(payees, policy.maxPerPayee);

  if (!state.reserveCycle(cycleId, plan.totalAmount, now())) {
    return { ran: false, reason: `cycle ${cycleId} reserved concurrently`, cycleId };
  }
  // Persist blindings BEFORE submit so a payee can always open later.
  state.saveBlindings(
    plan.payouts.map((p) => ({
      cycleId,
      payee: p.payee,
      amount: p.amount.toString(),
      blinding: p.blinding.toString(),
    })),
  );

  log.info(
    { cycleId, payees: plan.payouts.length, totalAmount: plan.totalAmount.toString() },
    "cycle planned",
  );

  // Always simulate first.
  try {
    await chain.simulateCycle(cycleId, plan);
  } catch (err) {
    state.setStatus(cycleId, "failed", null, now());
    log.error({ cycleId, err: String(err) }, "simulation failed — not submitting");
    return { ran: false, reason: `simulation failed: ${String(err)}`, cycleId };
  }

  if (opts.dryRun) {
    state.setStatus(cycleId, "failed", null, now()); // not submitted; free the id for a real run
    log.warn({ cycleId }, "DRY_RUN: simulated OK, not submitting");
    return { ran: false, reason: "dry run", cycleId, totalAmount: plan.totalAmount };
  }

  // Submit with bounded retry/backoff.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const txHash = await chain.submitCycle(cycleId, plan);
      state.setStatus(cycleId, "submitted", txHash, now());
      log.info({ cycleId, txHash, attempt }, "cycle submitted");
      await chain.waitForTx(txHash);
      state.setStatus(cycleId, "confirmed", txHash, now());
      log.info({ cycleId, txHash }, "cycle confirmed");
      return { ran: true, cycleId, txHash, totalAmount: plan.totalAmount };
    } catch (err) {
      lastErr = err;
      log.warn({ cycleId, attempt, err: String(err) }, "submit attempt failed");
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  state.setStatus(cycleId, "failed", null, now());
  log.error({ cycleId, err: String(lastErr) }, "cycle failed after retries");
  return { ran: false, reason: `submit failed: ${String(lastErr)}`, cycleId };
}
