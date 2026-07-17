// Merkle payee set — twin of contracts/src/merkle.cairo (commutative Poseidon,
// leaf = Poseidon([payee, stream])). Used to build valid membership proofs
// in-browser when running a cycle from a connected wallet.

import { poseidonHashMany } from "@scure/starknet";

// Stream tag — mirror of contracts/src/types.cairo stream_felt (Payroll=0/Vendor=1/Grant=2).
export type Stream = "payroll" | "vendor" | "grant";
export const streamFelt = (s: Stream): bigint => (s === "payroll" ? 0n : s === "vendor" ? 1n : 2n);

export function hashLeaf(payee: bigint, stream: Stream = "payroll"): bigint {
  return poseidonHashMany([payee, streamFelt(stream)]);
}
export function commutativeHash(a: bigint, b: bigint): bigint {
  return a <= b ? poseidonHashMany([a, b]) : poseidonHashMany([b, a]);
}

export interface MerkleTree {
  root: bigint;
  proof(index: number): bigint[];
}

// Build a tree from pre-hashed leaves (each leaf = hashLeaf(payee, stream)).
export function buildTreeFromLeaves(leaves: bigint[]): MerkleTree {
  if (leaves.length === 0) throw new Error("empty payee set");
  const levels: bigint[][] = [leaves.slice()];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next: bigint[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const right = i + 1 < cur.length ? cur[i + 1] : cur[i];
      next.push(commutativeHash(cur[i], right));
    }
    levels.push(next);
  }
  return {
    root: levels[levels.length - 1][0],
    proof(index: number) {
      const p: bigint[] = [];
      let idx = index;
      for (let l = 0; l < levels.length - 1; l++) {
        const cur = levels[l];
        const sib = idx % 2 === 1 ? idx - 1 : idx + 1;
        p.push(sib < cur.length ? cur[sib] : cur[idx]);
        idx = Math.floor(idx / 2);
      }
      return p;
    },
  };
}

// Convenience: build from (payee, stream) pairs.
export function buildTree(payees: { payee: bigint; stream: Stream }[]): MerkleTree {
  return buildTreeFromLeaves(payees.map((p) => hashLeaf(p.payee, p.stream)));
}
