// Merkle payee set — the TypeScript twin of contracts/src/merkle.cairo.
// leaf = Poseidon([payee]); node = commutative Poseidon (sorted pair); a proof is
// the list of sibling hashes bottom-up. Verified against Cairo (merkle.test.ts).

import { poseidonHashMany } from "@scure/starknet";

export function hashLeaf(payee: bigint): bigint {
  return poseidonHashMany([payee]);
}

export function commutativeHash(a: bigint, b: bigint): bigint {
  return a <= b ? poseidonHashMany([a, b]) : poseidonHashMany([b, a]);
}

/** Verify membership: fold proof siblings into the leaf, compare to root. */
export function verify(root: bigint, leaf: bigint, proof: bigint[]): boolean {
  let computed = leaf;
  for (const sib of proof) computed = commutativeHash(computed, sib);
  return computed === root;
}

export interface MerkleTree {
  root: bigint;
  leaves: bigint[];
  /** proof for the payee at index i (in the original `payees` order) */
  proof(index: number): bigint[];
}

/**
 * Build a tree over `payees` (as bigints). Odd nodes at a level are promoted by
 * hashing with themselves, matching a simple bottom-up duplicate-last scheme. The
 * on-chain verify is commutative so proofs carry siblings only.
 */
export function buildTree(payees: bigint[]): MerkleTree {
  if (payees.length === 0) throw new Error("empty payee set");
  const leaves = payees.map(hashLeaf);

  // levels[0] = leaves, ... levels[top] = [root]
  const levels: bigint[][] = [leaves.slice()];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next: bigint[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const left = cur[i];
      const right = i + 1 < cur.length ? cur[i + 1] : cur[i]; // duplicate last
      next.push(commutativeHash(left, right));
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
      const isRight = idx % 2 === 1;
      const sibIdx = isRight ? idx - 1 : idx + 1;
      const sib = sibIdx < cur.length ? cur[sibIdx] : cur[idx]; // duplicated last
      p.push(sib);
      idx = Math.floor(idx / 2);
    }
    return p;
  }

  return { root, leaves, proof };
}
