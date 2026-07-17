// Merkle payee set — the TypeScript twin of contracts/src/merkle.cairo.
// leaf = Poseidon([payee, stream]); node = commutative Poseidon (sorted pair).
// buildTree takes already-hashed leaves so callers control the (payee, stream) leaf.

import { poseidonHashMany } from "@scure/starknet";

/** Leaf = Poseidon([payee, streamTag]). */
export function hashLeaf(payee: bigint, streamTag: bigint = 0n): bigint {
  return poseidonHashMany([payee, streamTag]);
}

export function commutativeHash(a: bigint, b: bigint): bigint {
  return a <= b ? poseidonHashMany([a, b]) : poseidonHashMany([b, a]);
}

export function verify(root: bigint, leaf: bigint, proof: bigint[]): boolean {
  let computed = leaf;
  for (const sib of proof) computed = commutativeHash(computed, sib);
  return computed === root;
}

export interface MerkleTree {
  root: bigint;
  leaves: bigint[];
  proof(index: number): bigint[];
}

/** Build a tree over already-hashed `leaves`. */
export function buildTree(leaves: bigint[]): MerkleTree {
  if (leaves.length === 0) throw new Error("empty leaf set");
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
  const root = levels[levels.length - 1][0];
  function proof(index: number): bigint[] {
    if (index < 0 || index >= leaves.length) throw new Error("index out of range");
    const p: bigint[] = [];
    let idx = index;
    for (let level = 0; level < levels.length - 1; level++) {
      const cur = levels[level];
      const sib = idx % 2 === 1 ? idx - 1 : idx + 1;
      p.push(sib < cur.length ? cur[sib] : cur[idx]);
      idx = Math.floor(idx / 2);
    }
    return p;
  }
  return { root, leaves: leaves.slice(), proof };
}
