// Audit packet export. After a cycle settles, produce packet-{cycle}.zip an
// accountant can file: the per-payout commitments + stream totals (CSV), a proof
// bundle (JSON) with on-chain verification instructions, and a README. Blindings
// are NEVER included — payee openings are exported separately, per payee.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface PacketPayout {
  label?: string;
  payee: string;
  stream: string;
  commitment: { x: string; y: string };
  denied?: boolean;
  tx?: string;
}
export interface PacketCycle {
  cycleId: number;
  txHash: string;
  executor: string;
  rpc: string;
  totalCommitment: { x: string; y: string };
  streamTotals: { stream: string; commitment: { x: string; y: string } }[];
  payouts: PacketPayout[];
}

function csv(cycle: PacketCycle): string {
  const rows = [["label", "payee", "stream", "commitment_x", "commitment_y", "denied"].join(",")];
  for (const p of cycle.payouts) {
    rows.push([p.label ?? "", p.payee, p.stream, p.commitment.x, p.commitment.y, p.denied ? "yes" : "no"].join(","));
  }
  return rows.join("\n") + "\n";
}

function readme(cycle: PacketCycle): string {
  return `# Chaum audit packet — cycle ${cycle.cycleId}

Executor: ${cycle.executor}
RPC: ${cycle.rpc}
execute_cycle tx: ${cycle.txHash}

This packet proves the disbursement WITHOUT revealing any individual amount.

## Verify the aggregate (auditor)
Call \`verify_aggregate(${cycle.cycleId})\` on the executor — returns true iff the
stored per-payee commitments sum to the recorded cycle-total commitment.

## Verify category totals (stakeholder)
Call \`verify_stream_aggregate(${cycle.cycleId}, <Stream>)\` for Payroll / Vendor /
Grant — proves each category subtotal without revealing the split.

## Files
- cycle.csv        — per-payout commitments + stream (amounts are NOT here; they are private)
- proof-bundle.json — commitments, stream totals, verification calls
- (per-payee openings are exported separately — they carry the payee's secret opening value)

Individual amounts are hidden by Pedersen commitments; only the payee can open theirs.
This packet carries no opening secrets.
`;
}

// --- minimal store-mode ZIP (no deps) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(f.data.length, 18);
    lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, f.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(f.data.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + f.data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

/** Write packet-{cycleId}.zip to `outPath` (a file path). Returns the path. */
export function writeAuditPacket(outPath: string, cycle: PacketCycle): string {
  const full = resolve(outPath);
  mkdirSync(dirname(full), { recursive: true });
  const buf = zip([
    { name: "cycle.csv", data: Buffer.from(csv(cycle), "utf8") },
    { name: "proof-bundle.json", data: Buffer.from(JSON.stringify(cycle, null, 2), "utf8") },
    { name: "README.md", data: Buffer.from(readme(cycle), "utf8") },
  ]);
  writeFileSync(full, buf);
  return full;
}
