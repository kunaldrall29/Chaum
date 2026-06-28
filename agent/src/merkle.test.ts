import { test } from "node:test";
import assert from "node:assert/strict";
import { hashLeaf, commutativeHash, verify, buildTree } from "./merkle.ts";

// Poseidon parity vectors from Cairo (core::poseidon::poseidon_hash_span).
test("poseidon parity with Cairo", () => {
  assert.equal(
    hashLeaf(0x111n),
    3492360671362211061119730059956676048358597894728604213377740196208234511271n,
  );
  // commutative: sorted (0x111, 0x222)
  assert.equal(
    commutativeHash(0x111n, 0x222n),
    388175794537777103691840317521541873027951320276753680014316147943196783867n,
  );
  // order independence
  assert.equal(commutativeHash(0x111n, 0x222n), commutativeHash(0x222n, 0x111n));
});

test("buildTree + verify roundtrip (4 payees)", () => {
  const payees = [0x10n, 0x20n, 0x30n, 0x40n];
  const tree = buildTree(payees);
  for (let i = 0; i < payees.length; i++) {
    const leaf = hashLeaf(payees[i]);
    assert.ok(verify(tree.root, leaf, tree.proof(i)), `payee ${i} verifies`);
  }
  // non-member fails
  assert.ok(!verify(tree.root, hashLeaf(0x99n), tree.proof(0)));
});

test("buildTree + verify roundtrip (odd 5 payees)", () => {
  const payees = [1n, 2n, 3n, 4n, 5n];
  const tree = buildTree(payees);
  for (let i = 0; i < payees.length; i++) {
    assert.ok(verify(tree.root, hashLeaf(payees[i]), tree.proof(i)), `payee ${i}`);
  }
});

// Matches the 4-leaf tree the Cairo executor test builds (manual structure).
test("4-leaf root matches manual commutative structure", () => {
  const payees = [0x10n, 0x20n, 0x30n, 0x40n];
  const L = payees.map(hashLeaf);
  const n01 = commutativeHash(L[0], L[1]);
  const n23 = commutativeHash(L[2], L[3]);
  const root = commutativeHash(n01, n23);
  assert.equal(buildTree(payees).root, root);
});
