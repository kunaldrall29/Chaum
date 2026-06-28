// Off-chain payroll source: the payee set and each payee's amount (base units).
// This is the private input the agent turns into commitments. The on-chain policy
// only commits to the Merkle root of the payees and the caps — never these amounts.

import { readFileSync } from "node:fs";
import { z } from "zod";

const Schema = z.object({
  asset: z.string().optional(),
  payees: z
    .array(
      z.object({
        address: z.string().regex(/^0x[0-9a-fA-F]+$/),
        amount: z.string().regex(/^\d+$/), // base units, decimal string
        label: z.string().optional(),
      }),
    )
    .min(1),
});

export interface Payee {
  address: string;
  amount: bigint;
  label?: string;
}

export function loadPayroll(path: string): Payee[] {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const parsed = Schema.parse(raw);
  return parsed.payees.map((p) => ({
    address: p.address,
    amount: BigInt(p.amount),
    label: p.label,
  }));
}
