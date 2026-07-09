// Stream taxonomy — twin of contracts/src/types.cairo `Stream`.
// Payroll=0, Vendor=1, Grant=2. The felt tag feeds the (payee, stream) Merkle leaf;
// the variant name feeds the Cairo enum in execute_cycle calldata.

export type Stream = "payroll" | "vendor" | "grant";

export const STREAMS: Stream[] = ["payroll", "vendor", "grant"];

export function streamFelt(s: Stream): bigint {
  return s === "payroll" ? 0n : s === "vendor" ? 1n : 2n;
}

export function streamVariant(s: Stream): "Payroll" | "Vendor" | "Grant" {
  return s === "payroll" ? "Payroll" : s === "vendor" ? "Vendor" : "Grant";
}
