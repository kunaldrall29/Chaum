//! STARK-curve generators for Pedersen commitments `C = amount*G + blinding*H`.
//!
//! `G` is the standard corelib generator. `H` is a NUMS ("nothing up my sleeve")
//! generator whose discrete log relative to `G` is unknown — derived by Poseidon
//! hash-to-curve from a fixed seed, then hardcoded for gas. The derivation is
//! reproducible via `derive_h`; `tests` asserts the hardcoded H matches it, so
//! the NUMS claim stays verifiable. See docs/COMPLIANCE_MODEL.md §4.

use core::ec::{EcPoint, EcPointTrait, NonZeroEcPoint};
use core::ec::stark_curve;
use core::poseidon::poseidon_hash_span;

/// Domain-separation seed for H (ASCII "Chaum/v1/PedersenH/STARK").
pub const H_SEED: felt252 = 'Chaum/v1/PedersenH/STARK';

/// STARK-curve group order (core::ec::stark_curve::ORDER), as u256. EC scalar
/// multiplication reduces modulo this, so blinding sums must be accumulated
/// mod CURVE_ORDER for the homomorphic check `C_total == commit(Σa, Σb)` to hold.
pub const CURVE_ORDER: u256 =
    3618502788666131213697322783095070105526743751716087489154079457884512865583;

/// NUMS generator H = first on-curve point from poseidon_hash_span([H_SEED, n]).
/// Landed on-curve at n = 0. Reproduce with `derive_h`.
pub const H_X: felt252 =
    2880069363977802415664908978610191645829718774681956500265740437955567412656;
pub const H_Y: felt252 =
    1609380390434005400070756594133053333533099960265837780709577054725517772201;

/// Standard STARK-curve generator G.
pub fn generator_g() -> EcPoint {
    EcPointTrait::new(stark_curve::GEN_X, stark_curve::GEN_Y).unwrap()
}

pub fn generator_g_nz() -> NonZeroEcPoint {
    EcPointTrait::new_nz(stark_curve::GEN_X, stark_curve::GEN_Y).unwrap()
}

/// NUMS generator H (hardcoded; verified against `derive_h` in tests).
pub fn generator_h() -> EcPoint {
    EcPointTrait::new(H_X, H_Y).unwrap()
}

pub fn generator_h_nz() -> NonZeroEcPoint {
    EcPointTrait::new_nz(H_X, H_Y).unwrap()
}

/// Reproducible NUMS derivation: Poseidon hash-to-curve, try-and-increment on x.
/// Returns the canonical (x, y) of H. Used only to verify the hardcoded constants.
pub fn derive_h() -> (felt252, felt252) {
    let mut counter: felt252 = 0;
    loop {
        let x = poseidon_hash_span(array![H_SEED, counter].span());
        match EcPointTrait::new_from_x(x) {
            Option::Some(p) => {
                let nz: NonZeroEcPoint = p.try_into().unwrap();
                break nz.coordinates();
            },
            Option::None => { counter += 1; },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{derive_h, H_X, H_Y, generator_g, generator_h};

    #[test]
    fn hardcoded_h_matches_derivation() {
        let (x, y) = derive_h();
        assert!(x == H_X, "H_X mismatch");
        assert!(y == H_Y, "H_Y mismatch");
    }

    #[test]
    fn generators_are_on_curve() {
        // new(...).unwrap() inside these would panic if off-curve.
        let _g = generator_g();
        let _h = generator_h();
    }
}
