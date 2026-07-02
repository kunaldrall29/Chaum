// Merkle payee set — twin of contracts/src/merkle.cairo (commutative Poseidon,
// leaf = Poseidon([payee])). Used to build valid membership proofs in-browser
// when running a cycle from a connected wallet.

import { poseidonHashMany } from "@scure/starknet";

export function hashLeaf(payee: bigint): bigint {
  return poseidonHashMany([payee]);
}
export function commutativeHash(a: bigint, b: bigint): bigint {
  return a <= b ? poseidonHashMany([a, b]) : poseidonHashMany([b, a]);
}

export interface MerkleTree {
  root: bigint;
  proof(index: number): bigint[];
}

export function buildTree(payees: bigint[]): MerkleTree {
  if (payees.length === 0) throw new Error("empty payee set");
  const leaves = payees.map(hashLeaf);
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
