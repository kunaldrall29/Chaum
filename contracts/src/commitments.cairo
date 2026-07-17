//! Additively-homomorphic Pedersen commitments on the STARK curve.
//!
//! `C = amount*G + blinding*H`. The sum of per-payee commitments equals the
//! commitment to the cycle total — the property that lets Chaum prove an
//! aggregate without revealing any individual amount. See docs/COMPLIANCE_MODEL.md.
//!
//! `EcPoint` has no `Store` impl in the corelib, so a commitment is persisted as
//! its affine coordinates in `Commitment { x, y }` (felts are storable).

use core::ec::{EcPoint, EcPointTrait, EcStateTrait, NonZeroEcPoint};
use crate::generators::{generator_g_nz, generator_h_nz};

/// A commitment point, stored as affine coordinates.
#[derive(Copy, Drop, Serde, PartialEq, starknet::Store, Debug)]
pub struct Commitment {
    pub x: felt252,
    pub y: felt252,
}

/// Compute `C = amount*G + blinding*H`.
///
/// Requires `blinding != 0` for hiding (a zero blinding leaks the amount as the
/// discrete log of `amount*G`); callers must enforce this. Panics if the result
/// is the point at infinity (only reachable with degenerate inputs).
pub fn commit(amount: felt252, blinding: felt252) -> Commitment {
    let mut state = EcStateTrait::init();
    state.add_mul(amount, generator_g_nz());
    state.add_mul(blinding, generator_h_nz());
    let c = state.finalize();
    from_point(c)
}

/// Reconstruct the curve point from stored coordinates.
pub fn to_point(c: Commitment) -> EcPoint {
    EcPointTrait::new(c.x, c.y).unwrap()
}

/// Project a curve point to stored coordinates. Panics on the point at infinity.
pub fn from_point(p: EcPoint) -> Commitment {
    let nz: NonZeroEcPoint = p.try_into().unwrap();
    let (x, y) = nz.coordinates();
    Commitment { x, y }
}

/// Homomorphic sum `C_a + C_b` (point addition).
pub fn add(a: Commitment, b: Commitment) -> Commitment {
    from_point(to_point(a) + to_point(b))
}

/// Does `(amount, blinding)` open `c`? Used by `verify_aggregate` / `open_own`.
pub fn opens_to(c: Commitment, amount: felt252, blinding: felt252) -> bool {
    commit(amount, blinding) == c
}

#[cfg(test)]
mod tests {
    use super::{commit, add, opens_to};

    #[test]
    fn commit_is_deterministic() {
        assert!(commit(100, 7) == commit(100, 7));
    }

    #[test]
    fn different_amounts_differ() {
        assert!(commit(100, 7) != commit(101, 7));
    }

    #[test]
    fn different_blindings_differ() {
        assert!(commit(100, 7) != commit(100, 8));
    }

    #[test]
    fn additive_homomorphism() {
        // commit(a1,b1) + commit(a2,b2) == commit(a1+a2, b1+b2)
        let c1 = commit(30, 5);
        let c2 = commit(40, 6);
        let c3 = commit(50, 9);
        let sum = add(add(c1, c2), c3);
        let total = commit(30 + 40 + 50, 5 + 6 + 9);
        assert!(sum == total, "homomorphic sum mismatch");
    }

    #[test]
    fn aggregate_rejects_tampered_set() {
        // A tampered per-payee commitment makes the sum disagree with the total.
        let good = add(commit(30, 5), commit(40, 6));
        let total = commit(70, 11);
        assert!(good == total);
        let tampered = add(commit(31, 5), commit(40, 6)); // one amount bumped
        assert!(tampered != total, "tamper should break the sum");
    }

    #[test]
    fn open_own_accepts_correct_and_rejects_wrong() {
        let c = commit(1234, 99);
        assert!(opens_to(c, 1234, 99), "correct opening must verify");
        assert!(!opens_to(c, 1234, 100), "wrong blinding must fail");
        assert!(!opens_to(c, 1235, 99), "wrong amount must fail");
    }
}
