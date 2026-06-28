// Client-side Pedersen commitment — mirror of contracts/src/commitments.cairo,
// used to recompute C = amount*G + blinding*H in the browser and check it against
// the on-chain commitment (the payee's "open my own amount" proof).

import { Point } from "@scure/starknet";

export const H_X =
  2880069363977802415664908978610191645829718774681956500265740437955567412656n;
export const H_Y =
  1609380390434005400070756594133053333533099960265837780709577054725517772201n;
const n = Point.CURVE().n;
const G = Point.BASE;
const H = Point.fromAffine({ x: H_X, y: H_Y });

const mod = (k: bigint) => ((k % n) + n) % n;
const mul = (p: typeof G, k: bigint) => (mod(k) === 0n ? Point.ZERO : p.multiply(mod(k)));

export function commit(amount: bigint, blinding: bigint): { x: bigint; y: bigint } {
  const c = mul(G, amount).add(mul(H, blinding));
  const a = c.toAffine();
  return { x: a.x, y: a.y };
}

export function opensTo(
  c: { x: bigint; y: bigint },
  amount: bigint,
  blinding: bigint,
): boolean {
  const r = commit(amount, blinding);
  return r.x === c.x && r.y === c.y;
}
