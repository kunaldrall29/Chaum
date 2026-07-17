// Client-side audit packet — browser mirror of agent/src/packets.ts.
// Builds chaum-cycle-{id}-audit-packet.zip (cycle.csv + proof-bundle.json + README.md)
// and triggers a download. Carries NO opening secrets: individual amounts and
// blindings are never included — only commitments, category totals, and the
// on-chain verification instructions an accountant can file.

export interface PacketPayout {
  label?: string;
  payee: string;
  stream: string;
  commitment: { x: string; y: string };
  denied?: boolean;
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

const enc = new TextEncoder();

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
Call verify_aggregate(${cycle.cycleId}) on the executor — returns true iff the
stored per-payee commitments sum to the recorded cycle-total commitment.

## Verify category totals (stakeholder)
Call verify_stream_aggregate(${cycle.cycleId}, <Stream>) for Payroll / Vendor /
Grant — proves each category subtotal without revealing the split. This call is
role-gated on-chain; submit it from a stakeholder (or higher) account.

## Files
- cycle.csv         — per-payout commitments + stream (amounts are NOT here; they are private)
- proof-bundle.json — commitments, stream totals, verification calls

Individual amounts are hidden by Pedersen commitments; only the payee can open
theirs. This packet carries no opening secrets.
`;
}

// --- minimal store-mode ZIP (no deps), Uint8Array/DataView ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function concat(arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new Uint8Array(30);
    const ldv = new DataView(lh.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, f.data.length, true);
    ldv.setUint32(22, f.data.length, true);
    ldv.setUint16(26, name.length, true);
    locals.push(lh, name, f.data);
    const ch = new Uint8Array(46);
    const cdv = new DataView(ch.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, f.data.length, true);
    cdv.setUint32(24, f.data.length, true);
    cdv.setUint16(28, name.length, true);
    cdv.setUint32(42, offset, true);
    centrals.push(ch, name);
    offset += lh.length + name.length + f.data.length;
  }
  const centralBuf = concat(centrals);
  const end = new Uint8Array(22);
  const edv = new DataView(end.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralBuf.length, true);
  edv.setUint32(16, offset, true);
  return concat([...locals, centralBuf, end]);
}

/** Build the packet zip and trigger a browser download. */
export function downloadAuditPacket(cycle: PacketCycle): void {
  const buf = zip([
    { name: "cycle.csv", data: enc.encode(csv(cycle)) },
    { name: "proof-bundle.json", data: enc.encode(JSON.stringify(cycle, null, 2)) },
    { name: "README.md", data: enc.encode(readme(cycle)) },
  ]);
  const blob = new Blob([buf as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chaum-cycle-${cycle.cycleId}-audit-packet.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
