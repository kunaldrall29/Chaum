// Privacy-aware scheduling. A fixed 1st-of-month fan-out is a deanonymizing
// timing signature; the agent instead picks a random-looking moment inside the
// policy's execution window [due, due+exec_window]. The pick is DETERMINISTIC in
// the cycle id (a stable seed) so it survives agent restarts without re-drawing.

import { poseidonHashMany } from "@scure/starknet";

/** Deterministic execution time inside [due, due+execWindow], seeded by cycleId. */
export function pickExecutionTime(dueAt: bigint, execWindow: bigint, cycleId: bigint): bigint {
  if (execWindow <= 0n) return dueAt;
  const h = poseidonHashMany([cycleId, dueAt]);
  const offset = h % (execWindow + 1n);
  return dueAt + offset;
}

/** Is `now` inside the on-chain-enforced window for a cycle due at `dueAt`? */
export function withinWindow(now: bigint, dueAt: bigint, execWindow: bigint): boolean {
  return now >= dueAt && now <= dueAt + execWindow;
}

/**
 * Optionally split a cycle into k sub-batches, each with its own jittered time,
 * so the fan-out shape doesn't mirror the payee count. Returns k execution times.
 */
export function batchTimes(dueAt: bigint, execWindow: bigint, cycleId: bigint, k: number): bigint[] {
  const out: bigint[] = [];
  for (let i = 0; i < k; i++) {
    const h = poseidonHashMany([cycleId, BigInt(i)]);
    out.push(execWindow <= 0n ? dueAt : dueAt + (h % (execWindow + 1n)));
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
