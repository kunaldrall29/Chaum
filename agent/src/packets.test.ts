import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuditPacket } from "./packets.ts";

test("audit packet is a valid zip and excludes blindings", () => {
  const out = join(tmpdir(), `chaum-packet-test-${process.pid}.zip`);
  const path = writeAuditPacket(out, {
    cycleId: 3,
    txHash: "0xabc",
    executor: "0xexec",
    rpc: "https://rpc",
    totalCommitment: { x: "0x1", y: "0x2" },
    streamTotals: [{ stream: "payroll", commitment: { x: "0x3", y: "0x4" } }],
    payouts: [{ label: "alice", payee: "0x111", stream: "payroll", commitment: { x: "0x5", y: "0x6" } }],
  });
  const buf = readFileSync(path);
  // ZIP local-file-header magic "PK\x03\x04"
  assert.equal(buf[0], 0x50);
  assert.equal(buf[1], 0x4b);
  assert.equal(buf[2], 0x03);
  assert.equal(buf[3], 0x04);
  // no "blinding" string anywhere in the packet
  assert.ok(!buf.toString("latin1").toLowerCase().includes("blinding"));
  rmSync(path, { force: true });
});
