# Privacy & Threat Model

**Audience:** grant reviewers, design-partner operators, auditors. This document is deliberately conservative: every privacy claim is stated with its boundary in the same place. Chaum is **selective disclosure with screening — not anonymity.** A reviewer should finish this understanding exactly what Chaum does and does not protect against.

---

## 1. What Chaum protects, and from whom

Chaum keeps an organization's **individual amounts, compensation, and vendor terms confidential** from competitors, counterparties, and anyone watching the chain, while letting the org **disclose precisely, on its own terms** (aggregate to auditors, category totals to token holders, own-amount to each payee). See [COMPLIANCE_MODEL.md](COMPLIANCE_MODEL.md) for the per-role disclosure guarantees.

It is **not** designed to hide an organization from a resourced, targeted chain-analysis adversary while the shared privacy pool is small. Saying this plainly is a trust feature.

## 2. The bounded-agent guarantee (encoded, not just documented)

A **fully compromised agent session key** can do exactly one thing: call `execute_cycle` to pay the **pre-approved payee set**, from **pre-funded** balances, **within caps**, and **within the cadence + execution window** — every condition re-validated on-chain before a token moves. It **cannot** withdraw, redirect to a non-payee, exceed caps, change the payee set/roles/policy, or call any other entrypoint. The owner can `pause`/`revoke` in one transaction. This is enforced by the contracts and covered by the snforge revert matrix + role-scope isolation tests, not merely asserted here.

The agent adds two privacy defenses a human operator can't reliably do by hand:

- **Timing jitter** ([`agent/src/jitter.ts`](../agent/src/jitter.ts)): the cycle lands at a deterministic-but-random-looking moment inside the policy's `exec_window`, and the on-chain executor rejects any submission outside `[due, due+exec_window]`. See §3.
- **Anomaly halt** ([`agent/src/anomaly.ts`](../agent/src/anomaly.ts)): if the payee set **and** the cycle total both shift beyond the policy thresholds together, the agent refuses to execute and requires explicit owner acknowledgement — the signature of a stolen key or misconfig, distinct from routine onboarding or a raise.

## 3. Timing correlation survives naive use — and how we blunt it

An org that shields \$150K on the 28th and fans out 30 notes on the 1st has published a **timing signature**, even with amounts hidden. Mitigations, designed in:

- **Jitter windows.** The cycle executes at a pseudo-random time inside `exec_window` (hours), not on a fixed schedule. `exec_window < cadence` is enforced at policy-write time.
- **Irregular-tranche entry.** Shield ahead of need, in tranches that don't mirror the payroll date (operational guidance + agent scheduling).
- **Batch shapes.** Optional sub-batching so the fan-out count/shape doesn't equal the payee count.

This reduces, it does not eliminate, timing correlation. A determined observer correlating shield-in and fan-out over time on a small pool can still infer structure.

## 4. Anonymity set is pool-dependent (the honest cold-start)

Transport privacy (STRK20's note pool) is only as strong as the **number of participants sharing the pool**. Early on, the pool is small and the anonymity set is weak — Chaum protects against competitors, counterparties, and casual observers, **not** against a resourced analyst while the pool is small. Privacy **strengthens as adoption grows** (every org added deepens everyone's set), which is also why foundation-scale grant payers — hundreds of payees in one cycle — are a first-class seeding strategy.

## 5. Privacy ends at the off-ramp

A payee who immediately off-ramps to a KYC'd fiat exchange **re-links themselves** at that exchange. Chaum's confidentiality holds on-chain and up to the point of cash-out. We target **crypto-native payees** first and document this boundary rather than obscure it.

## 6. What the commitment layer does vs. the transport layer

- **Commitment layer (live today, no SDK dependency):** per-payee amounts hidden by additively-homomorphic Pedersen commitments; aggregate, per-stream, and per-payee proofs. This is real and functional now, **even when the token transfer leg is a public ERC-20** (the amount then leaks in the ERC-20 event, but the commitment ledger, category proofs, and selective disclosure are fully operational).
- **Transport layer (STRK20, T2):** the token movement itself becomes private (note pool). Because Chaum's own events are amount-free and the transfer goes through a swappable `IShieldedTransfer` adapter, this activates with **no change** to the commitment/disclosure core.

## 7. Compliance posture (GENIUS-era)

Chaum screens **before** funds move: the executor consults an `IKytOracle` (TRM/Chainalysis-class in production, `MockKytOracle` on testnet) per payee; a denied payee is skipped-and-logged (default) or reverts the cycle (policy flag). The headline is **selective disclosure with screening**, not evasion — the winning 2026 shape is "who satisfies compliance with minimal disclosure." A regulator treating shielded org payments as evasion is a real risk; the mitigations are screening-first flow, exportable audit packets, and disclosure-by-default-to-the-right-parties.

## 8. Residual risks (register)

| Risk | Mitigation |
| --- | --- |
| Anomaly-set cold start (early privacy weaker than the pitch) | Honesty in docs; jitter/tranche design; foundation-scale payers seed pool volume |
| Timing correlation on a small pool | Jitter windows, irregular tranches, batch shapes — reduces, not eliminates |
| Off-ramp re-linking | Target crypto-native payees; document the boundary |
| Compromised agent key | Bounded to pay pre-approved payees within caps/cadence/window; on-chain re-validation; pause/revoke |
| Config/key swap (new payees + inflated total) | Anomaly halt (both-thresholds) → refuse + owner ack |
| Public-transfer leg leaks amounts (V1) | Documented; STRK20 adapter (T2) closes it with no core change |
| Screening bypass / sanctioned payee | Pre-pay KYT gate; skip-and-log or revert per policy |

See [COMPLIANCE_MODEL.md](COMPLIANCE_MODEL.md), [POLICY_MODEL.md](POLICY_MODEL.md), and [ARCHITECTURE.md](ARCHITECTURE.md).
