// Off-chain payroll source: the payee set, each payee's stream + amount (base
// units). This is the private input the agent turns into commitments. The on-chain
// policy only commits to the Merkle root of (payee, stream) leaves and the caps.

import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Stream } from "./streams.ts";

const Schema = z.object({
  asset: z.string().optional(),
  payees: z
    .array(
      z.object({
        address: z.string().regex(/^0x[0-9a-fA-F]+$/),
        amount: z.string().regex(/^\d+$/), // base units, decimal string
        stream: z.enum(["payroll", "vendor", "grant"]).default("payroll"),
        label: z.string().optional(),
      }),
    )
    .min(1),
});

export interface Payee {
  address: string;
  stream: Stream;
  amount: bigint;
  label?: string;
}

export function loadPayroll(path: string): Payee[] {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const parsed = Schema.parse(raw);
  return parsed.payees.map((p) => ({
    address: p.address,
    stream: p.stream,
    amount: BigInt(p.amount),
    label: p.label,
  }));
}
