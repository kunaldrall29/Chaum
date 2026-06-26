# Compliance & Privacy Model

This document states **exactly** what Chaum hides, what it proves, and what each party can and cannot learn. It is deliberately conservative: where a privacy property is only partial in V1, that is spelled out rather than glossed.

---

## 1. The commitment scheme

Chaum commits to every per-payee amount with an **additively-homomorphic Pedersen commitment** on the STARK curve:

```
C_i = amount_i · G  +  blinding_i · H
```

- `amount_i` — the payee's payout, a non-negative integer in token base units (treated as a curve scalar).
- `blinding_i` — a uniformly-random secret scalar (the "blinding factor"), generated and stored by the agent, **never** revealed except by the payee opening their own commitment.
- `G` — the standard STARK-curve generator (`core::ec`).
- `H` — a second generator with **unknown discrete logarithm** relative to `G` (see §4). Without this, the scheme is not binding.

`C_i` is a point on the STARK curve, stored on-chain as its two affine coordinates `(x, y)`.

### Why Pedersen (EC), not a hash commitment

The headline property — *"individual amounts private, aggregate provable"* — **is** additive homomorphism:

```
Σ_i C_i  =  (Σ_i amount_i) · G  +  (Σ_i blinding_i) · H  =  C_total
```

The sum of the per-payee commitments **is** the commitment to the cycle total — computable by anyone, from public data, without opening any individual commitment. A hash commitment `Poseidon(amount, blinding)` is hiding and binding but **not** homomorphic: you cannot prove a sum without revealing every term. We therefore use EC Pedersen and pay the extra EC-builtin gas; that cost *is* the feature.

| Property | EC Pedersen `a·G + r·H` | Hash `Poseidon(a, r)` |
| --- | --- | --- |
| Hiding | Perfect (information-theoretic), given uniform `r` | Computational (preimage resistance) |
| Binding | Computational (STARK-curve DLP + unknown-DL `H`) | Computational (collision resistance) |
| **Additively homomorphic** | **Yes — enables aggregate proof** | **No — aggregate requires revealing every amount** |
| On-chain cost | Higher (EC scalar-mul/add) | Lower (one hash) |
| If chosen, what's lost | A little gas | **The entire "private split, provable total" property** |

Poseidon is still used in Chaum — for the NUMS derivation of `H` and for Merkle-tree hashing — but **not** for the amount commitments.

### Binding invariants enforced on-chain

- `blinding_i ≠ 0` is required. A zero blinding would make `C_i = amount_i · G`, whose discrete log base `G` is exactly `amount_i` — i.e. the amount would be recoverable by brute force over the (bounded) amount range. Rejected.
- `amount_i = 0` is permitted (a zero payout is a valid, fully-hidden line item).
- When a cycle is executed, the contract **recomputes** `C_i` from the supplied `(amount_i, blinding_i)` and asserts it equals the supplied commitment, so a stored commitment can never commit to a different number than the one that drove the cap check and the transfer.

---

## 2. The three disclosure guarantees

These mirror STRK20's viewing-key semantics: a public aggregate proof, a holder-only opening, and nothing else.

### G1 — Aggregate verifiability (public)

`verify_aggregate(cycle_id) -> bool` lets **anyone** (in practice, an auditor) confirm that the per-payee commitments stored for a cycle sum exactly to the recorded cycle-total commitment:

```
assert  Σ_i C_i  ==  C_total
```

In `PublicTransferAdapter` mode the contract also stores `Σ amount_i` and `Σ blinding_i`, so the verifier additionally confirms `C_total` opens to that public total — binding the homomorphic commitment to the actually-disbursed sum. **No individual amount is revealed by this check.**

### G2 — Self-disclosure (payee-only)

`open_own(cycle_id, payee, amount, blinding) -> bool` lets a payee prove *their own* line item:

```
assert  amount · G + blinding · H  ==  C_stored[cycle_id][payee]
```

Because `H` has unknown DL, binding guarantees the payee cannot find a *different* `(amount', blinding')` opening to the same stored commitment. The dashboard turns a successful open into an exportable **income-proof string** (e.g. for a lender). The call reveals the caller's own amount **to the caller**; it does not write it on-chain in cleartext, and it cannot open anyone else's commitment.

### G3 — Non-disclosure (everyone else)

Given only on-chain data (the stored commitment coordinates and Chaum's events), no party can recover any individual `amount_i`. Pedersen commitments are perfectly hiding: every commitment is, information-theoretically, consistent with every possible amount under some blinding. This holds **regardless** of the transfer adapter — but see §3 for what the *transfer leg* itself leaks.

---

## 3. What each party learns — the honest table

The crucial caveat: **Starknet calldata and ERC-20 `Transfer` events are public and permanent.** Amount confidentiality end-to-end is therefore a property of the **active transfer adapter**, not of the commitment layer alone.

| Party | Learns | Does **not** learn |
| --- | --- | --- |
| **Public observer** (commitment layer only) | Payee set (Merkle root), policy caps/cadence, that a cycle ran, the commitment coordinates, the aggregate total (via G1) | Any individual amount, any blinding |
| **Public observer** (with `PublicTransferAdapter` active) | …**plus** each `(payee, amount)` from the ERC-20 `Transfer` event | The blindings (but amounts already leaked here) |
| **Public observer** (with `Strk20TransferAdapter` active, T2) | Same as commitment-layer-only — the transfer is shielded | Any individual amount |
| **Auditor** | The verified aggregate total (G1); the payee set; caps | Any individual split |
| **Payee** | Their own amount (G2); the payee set; caps; the aggregate | Any other payee's amount |
| **Agent** | Everything it is given off-chain (the payroll config + blindings it generates) | — (it is the disburser; it must know amounts to build the cycle) |
| **Owner / treasury** | Everything (sets the payroll) | — |

### The V1 transfer-leg limitation, stated plainly

In the **devnet/demo and the initial Sepolia deployment**, the token movement uses `PublicTransferAdapter` — a plain ERC-20 transfer — because STRK20's developer SDK is not yet available (see [DECISIONS.md](DECISIONS.md)). In that mode the per-payee amounts **are observable** in the ERC-20 `Transfer` events. What V1 *does* deliver, fully and correctly:

1. A working homomorphic commitment ledger.
2. A public aggregate proof that reveals no split (G1).
3. Payee-only selective disclosure (G2).
4. An **adapter-agnostic** event stream: Chaum's own events carry only commitment coordinates, never amounts.

Because (4) holds, swapping in `Strk20TransferAdapter` (T2) upgrades the system to true end-to-end amount confidentiality with **zero change** to the commitment, proof, or event schema. The privacy leak in V1 is isolated to exactly one swappable component, by design.

---

## 4. The second generator `H` (nothing-up-my-sleeve)

`H` must (a) be a valid point on the STARK curve and (b) have a discrete log relative to `G` that is **unknown to everyone, including the protocol authors** — otherwise a party who knows `k = log_G(H)` can open any commitment to any amount, breaking binding.

### Derivation (reproducible, auditable)

`H` is derived by **hash-to-curve with try-and-increment** from a fixed public domain-separation seed:

```
seed   = "Chaum/v1/PedersenH/STARK"           (ASCII)
x_0    = Poseidon(seed)
x_{n+1}= Poseidon(x_n)                          (on failure, re-hash)
H.x    = first x_n for which EcPointTrait::new_from_x(x_n) yields a valid curve point
H.y    = the canonical root (documented parity rule below)
```

Because `H`'s coordinates are the output of a hash of a public string — not constructed as `k · G` for any chosen `k` — recovering `log_G(H)` is equivalent to solving the discrete-log problem on the STARK curve. This is the standard NUMS construction.

The derivation is run **off-chain once**, and the resulting constants are hardcoded in [`contracts/src/generators.cairo`](../contracts/src/generators.cairo) so the protocol does not pay hash-to-curve gas on every call. The procedure here lets anyone independently reproduce the constants and confirm `H` is a genuine hash output.

> **Derived constants (filled in at build time):**
> - `seed` = `"Chaum/v1/PedersenH/STARK"`
> - parity rule for `H.y` = _TBD: even-y / smaller-root_
> - `G = (Gx, Gy)` = _TBD: STARK-curve standard generator from corelib_
> - `H = (Hx, Hy)` = _TBD: derived value + the number of increments to land on-curve_

---

## 5. Per-payee cap enforcement vs. amount hiding

There is an unavoidable tension: to enforce `amount_i ≤ max_per_payee` the contract must constrain the amount, and in V1 (public adapter) it does so on the **cleartext** amount passed in calldata.

- **V1 (`PublicTransferAdapter`):** caps are enforced **exactly** on cleartext amounts. The amount is already public via the ERC-20 event, so passing it in calldata loses nothing additional. Simple and honest.
- **T2 (`Strk20TransferAdapter`):** to keep the amount off calldata *and* enforce the cap, the cap check becomes cryptographic — either an on-chain bounded **range proof** that `amount_i ∈ [0, max_per_payee]` against `C_i`, or a coarse **denomination-bucket** scheme. Until the range-proof verifier ships, Chaum cannot simultaneously hide an *arbitrary* amount **and** prove it is under cap. This is the documented V1→T2 boundary.

---

## 6. Threat model summary

| Threat | Mitigation |
| --- | --- |
| Compromised agent key drains the vault | No fund path except to a Merkle-proven payee or back to the owner; caps + cadence re-checked on-chain |
| Agent pays a non-payee | Per-payout Merkle membership proof against the committed root; non-members revert |
| Agent inflates a payout | `amount_i ≤ max_per_payee` and `Σ ≤ max_per_cycle` re-checked on-chain |
| Tampered commitment set (store a commitment inconsistent with amounts) | `execute_cycle` recomputes each `C_i`; `verify_aggregate` checks `Σ C_i == C_total` |
| Forged opening of someone else's amount | Binding from unknown-DL `H`; `open_own` reverts for non-holders |
| Amount recovery from a commitment | Perfect hiding; `blinding ≠ 0` enforced |
| Reentrancy on vault withdraw / cycle execution | OpenZeppelin `ReentrancyGuard` on both paths |
| Owner loses trust in the agent | `revoke` zeroes the session key; `pause` halts all cycles |

See [DECISIONS.md](DECISIONS.md) for the scheme-selection rationale and the STRK20 interface status, and [POLICY_MODEL.md](POLICY_MODEL.md) for the policy object and its on-chain enforcement.
