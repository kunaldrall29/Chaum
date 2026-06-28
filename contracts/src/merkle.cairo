//! Merkle membership for the payee set. Self-contained so the on-chain verify and
//! the off-chain (TypeScript) tree builder match exactly:
//!   - leaf      = Poseidon([payee_address])
//!   - node      = commutative Poseidon: Poseidon([min(a,b), max(a,b)])
//!   - verify    = fold the proof siblings into the leaf, compare to root
//! Commutative hashing means proofs carry only siblings (no left/right flags); the
//! off-chain builder sorts each pair identically.

use core::poseidon::poseidon_hash_span;
use starknet::ContractAddress;

/// Leaf hash for a payee. Single-element Poseidon over the address felt.
pub fn hash_leaf(payee: ContractAddress) -> felt252 {
    let p: felt252 = payee.into();
    poseidon_hash_span(array![p].span())
}

/// Order-independent hash of two nodes (sorted by numeric value).
pub fn commutative_hash(a: felt252, b: felt252) -> felt252 {
    let au: u256 = a.into();
    let bu: u256 = b.into();
    if au <= bu {
        poseidon_hash_span(array![a, b].span())
    } else {
        poseidon_hash_span(array![b, a].span())
    }
}

/// Verify `leaf` is in the tree with `root` given `proof` (bottom-up siblings).
pub fn verify(root: felt252, leaf: felt252, proof: Span<felt252>) -> bool {
    let mut computed = leaf;
    let mut i = 0;
    while i != proof.len() {
        computed = commutative_hash(computed, *proof.at(i));
        i += 1;
    }
    computed == root
}

#[cfg(test)]
mod tests {
    use super::{commutative_hash, verify};

    // Build a 4-leaf tree and check membership + a bad proof.
    #[test]
    fn verify_4_leaf_tree() {
        let l0 = 0x10;
        let l1 = 0x20;
        let l2 = 0x30;
        let l3 = 0x40;
        let n01 = commutative_hash(l0, l1);
        let n23 = commutative_hash(l2, l3);
        let root = commutative_hash(n01, n23);

        // proof for l0 is [l1, n23]
        assert!(verify(root, l0, array![l1, n23].span()), "l0 should verify");
        // proof for l2 is [l3, n01]
        assert!(verify(root, l2, array![l3, n01].span()), "l2 should verify");
        // wrong sibling fails
        assert!(!verify(root, l0, array![l2, n23].span()), "bad proof must fail");
        // non-member leaf fails
        assert!(!verify(root, 0x99, array![l1, n23].span()), "non-member must fail");
    }
}
