// Pedersen commitments — the TypeScript twin of contracts/src/commitments.cairo.
// C = amount*G + blinding*H on the STARK curve. Verified byte-for-byte against
// Cairo test vectors (see commitments.test.ts). G/H/order must match
// contracts/src/generators.cairo exactly.

import { Point } from "@scure/starknet";

/** NUMS generator H (contracts/src/generators.cairo: H_X / H_Y). */
export const H_X =
  2880069363977802415664908978610191645829718774681956500265740437955567412656n;
export const H_Y =
  1609380390434005400070756594133053333533099960265837780709577054725517772201n;

/** STARK-curve group order (core::ec::stark_curve::ORDER). */
export const CURVE_ORDER = Point.CURVE().n;

const G = Point.BASE;
const H = Point.fromAffine({ x: H_X, y: H_Y });

export interface Commitment {
  x: bigint;
  y: bigint;
}

/** Reduce a scalar into [0, ORDER) the same way EC scalar-mul does. */
function modOrder(k: bigint): bigint {
  return ((k % CURVE_ORDER) + CURVE_ORDER) % CURVE_ORDER;
}

function mul(p: Point, k: bigint): Point {
  const s = modOrder(k);
  return s === 0n ? Point.ZERO : p.multiply(s);
}

/** C = amount*G + blinding*H. Mirrors commit() in commitments.cairo. */
export function commit(amount: bigint, blinding: bigint): Commitment {
  const c = mul(G, amount).add(mul(H, blinding));
  if (c.is0()) throw new Error("commitment is the point at infinity");
  const a = c.toAffine();
  return { x: a.x, y: a.y };
}

/** Homomorphic sum C_a + C_b (point addition). */
export function addCommitments(a: Commitment, b: Commitment): Commitment {
  const p = Point.fromAffine({ x: a.x, y: a.y }).add(
    Point.fromAffine({ x: b.x, y: b.y }),
  );
  const out = p.toAffine();
  return { x: out.x, y: out.y };
}

export function commitmentsEqual(a: Commitment, b: Commitment): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Aggregate of per-payee commitments. Returns the summed commitment and the
 * total amount / total blinding (mod ORDER) — the values the contract binds the
 * cycle-total commitment to.
 */
export function aggregate(
  amounts: bigint[],
  blindings: bigint[],
): { total: Commitment; totalAmount: bigint; totalBlinding: bigint } {
  if (amounts.length !== blindings.length || amounts.length === 0) {
    throw new Error("amounts and blindings must be non-empty and equal length");
  }
  let totalAmount = 0n;
  let totalBlinding = 0n;
  let acc: Commitment | null = null;
  for (let i = 0; i < amounts.length; i++) {
    const c = commit(amounts[i], blindings[i]);
    acc = acc === null ? c : addCommitments(acc, c);
    totalAmount += amounts[i];
    totalBlinding = modOrder(totalBlinding + modOrder(blindings[i]));
  }
  return { total: acc!, totalAmount, totalBlinding };
}

/** Cryptographically-random blinding in [1, ORDER). Never log or persist in clear. */
export function randomBlinding(): bigint {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  v = v % (CURVE_ORDER - 1n);
  return v + 1n; // in [1, ORDER)
}
