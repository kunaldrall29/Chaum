// Anomaly halt. Before submitting, the agent compares the proposed cycle against
// the last executed one. If the payee set AND the cycle total both shift beyond
// the policy thresholds (in bps), it refuses to execute — a compromised config or
// key that swaps the payee set and inflates the total is stopped, not obeyed.
// Requires an explicit owner acknowledgement to proceed.

export interface CycleShape {
  payees: string[]; // 0x addresses
  total: bigint;
}

export interface AnomalyResult {
  halt: boolean;
  reason: string;
  payeeDeltaBps: number;
  totalDeltaBps: number;
}

const norm = (a: string) => BigInt(a).toString(16);

/** bps change in the payee set (symmetric difference / previous size). */
export function payeeSetDeltaBps(prev: string[], curr: string[]): number {
  const p = new Set(prev.map(norm));
  const c = new Set(curr.map(norm));
  let diff = 0;
  for (const x of p) if (!c.has(x)) diff++;
  for (const x of c) if (!p.has(x)) diff++;
  const base = Math.max(p.size, 1);
  return Math.round((diff / base) * 10_000);
}

/** bps change in the cycle total (|curr - prev| / prev). */
export function totalDeltaBps(prev: bigint, curr: bigint): number {
  const base = prev === 0n ? 1n : prev;
  const diff = curr > prev ? curr - prev : prev - curr;
  return Number((diff * 10_000n) / base);
}

/**
 * Halt only when BOTH deltas exceed their thresholds — a payee-set change on its
 * own (routine onboarding) or a total change on its own (a raise) is not an
 * anomaly; the two together is the theft/misconfig signature.
 */
export function checkAnomaly(
  prev: CycleShape | null,
  curr: CycleShape,
  payeeThresholdBps: number,
  totalThresholdBps: number,
): AnomalyResult {
  if (!prev || (payeeThresholdBps === 0 && totalThresholdBps === 0)) {
    return { halt: false, reason: "no prior cycle or thresholds disabled", payeeDeltaBps: 0, totalDeltaBps: 0 };
  }
  const pd = payeeSetDeltaBps(prev.payees, curr.payees);
  const td = totalDeltaBps(prev.total, curr.total);
  const halt = pd >= payeeThresholdBps && td >= totalThresholdBps;
  return {
    halt,
    reason: halt
      ? `payee-set Δ ${pd}bps ≥ ${payeeThresholdBps} AND total Δ ${td}bps ≥ ${totalThresholdBps} — refusing; owner ack required`
      : `within thresholds (payee Δ ${pd}bps, total Δ ${td}bps)`,
    payeeDeltaBps: pd,
    totalDeltaBps: td,
  };
}
