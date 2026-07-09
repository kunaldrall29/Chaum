import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnomaly, payeeSetDeltaBps, totalDeltaBps } from "./anomaly.ts";

test("payee-set delta bps", () => {
  assert.equal(payeeSetDeltaBps(["0x1", "0x2"], ["0x1", "0x2"]), 0);
  // replace one of two → symmetric diff 2 / base 2 = 100% = 10000bps
  assert.equal(payeeSetDeltaBps(["0x1", "0x2"], ["0x1", "0x3"]), 10_000);
});

test("total delta bps", () => {
  assert.equal(totalDeltaBps(1000n, 1000n), 0);
  assert.equal(totalDeltaBps(1000n, 2000n), 10_000); // +100%
  assert.equal(totalDeltaBps(1000n, 1500n), 5_000);
});

test("halts only when BOTH thresholds exceeded", () => {
  const prev = { payees: ["0x1", "0x2", "0x3", "0x4"], total: 1000n };

  // payee set swapped 100% AND total 3x → HALT (theft signature)
  const bad = checkAnomaly(prev, { payees: ["0xa", "0xb", "0xc", "0xd"], total: 3000n }, 5000, 5000);
  assert.ok(bad.halt);

  // only total jumps (a raise) — not an anomaly
  const raise = checkAnomaly(prev, { payees: prev.payees, total: 3000n }, 5000, 5000);
  assert.ok(!raise.halt);

  // only payee set changes (onboarding) — not an anomaly
  const onboard = checkAnomaly(prev, { payees: ["0x1", "0x2", "0x3", "0x4", "0x5", "0x6"], total: 1050n }, 5000, 5000);
  assert.ok(!onboard.halt);
});

test("no prior cycle → no halt", () => {
  assert.ok(!checkAnomaly(null, { payees: ["0x1"], total: 1n }, 1, 1).halt);
});
