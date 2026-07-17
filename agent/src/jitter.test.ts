import { test } from "node:test";
import assert from "node:assert/strict";
import { pickExecutionTime, withinWindow, batchTimes } from "./jitter.ts";

test("pickExecutionTime is deterministic + inside the window", () => {
  const due = 1_800_000_000n;
  const win = 21_600n; // 6h
  const t = pickExecutionTime(due, win, 7n);
  assert.equal(t, pickExecutionTime(due, win, 7n)); // deterministic
  assert.ok(t >= due && t <= due + win);
  // different cycles generally land at different offsets
  assert.notEqual(pickExecutionTime(due, win, 7n), pickExecutionTime(due, win, 8n));
});

test("zero window returns due", () => {
  assert.equal(pickExecutionTime(100n, 0n, 3n), 100n);
});

test("withinWindow bounds", () => {
  assert.ok(withinWindow(150n, 100n, 100n));
  assert.ok(withinWindow(100n, 100n, 100n));
  assert.ok(withinWindow(200n, 100n, 100n));
  assert.ok(!withinWindow(201n, 100n, 100n));
  assert.ok(!withinWindow(99n, 100n, 100n));
});

test("batchTimes are all inside the window and sorted", () => {
  const times = batchTimes(1000n, 500n, 42n, 4);
  assert.equal(times.length, 4);
  for (const t of times) assert.ok(t >= 1000n && t <= 1500n);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1]);
});
