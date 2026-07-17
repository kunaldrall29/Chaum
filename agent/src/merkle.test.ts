import { test } from "node:test";
import assert from "node:assert/strict";
import { hashLeaf, commutativeHash, verify, buildTree } from "./merkle.ts";

const P2 = 388175794537777103691840317521541873027951320276753680014316147943196783867n;

test("poseidon parity with Cairo", () => {
  // hashLeaf(a, b) = Poseidon([a, b]) — Cairo poseidon_hash_span([0x111, 0x222]).
  assert.equal(hashLeaf(0x111n, 0x222n), P2);
  assert.equal(commutativeHash(0x111n, 0x222n), P2);
  assert.equal(commutativeHash(0x111n, 0x222n), commutativeHash(0x222n, 0x111n));
});

test("buildTree + verify roundtrip (4 leaves)", () => {
  const leaves = [0x10n, 0x20n, 0x30n, 0x40n].map((p) => hashLeaf(p, 0n));
  const tree = buildTree(leaves);
  for (let i = 0; i < leaves.length; i++) {
    assert.ok(verify(tree.root, leaves[i], tree.proof(i)), `leaf ${i} verifies`);
  }
  assert.ok(!verify(tree.root, hashLeaf(0x99n, 0n), tree.proof(0)));
});

test("buildTree + verify roundtrip (odd 5 leaves)", () => {
  const leaves = [1n, 2n, 3n, 4n, 5n].map((p) => hashLeaf(p, 1n));
  const tree = buildTree(leaves);
  for (let i = 0; i < leaves.length; i++) {
    assert.ok(verify(tree.root, leaves[i], tree.proof(i)), `leaf ${i}`);
  }
});

test("4-leaf root matches manual commutative structure", () => {
  const L = [0x10n, 0x20n, 0x30n, 0x40n].map((p) => hashLeaf(p, 0n));
  const root = commutativeHash(commutativeHash(L[0], L[1]), commutativeHash(L[2], L[3]));
  assert.equal(buildTree(L).root, root);
});
