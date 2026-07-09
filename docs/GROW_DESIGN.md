# Grow — private treasury yield (design, phase 2/3)

**Status: seam only in V1.** Grow ships as interfaces + a stub adapter + this design doc. There is **no live yield logic** in V1, and none is claimed. Grow activates as STRK20's private-DeFi legs land (Vesu lending, Endur staking, strkBTC strategies).

## Thesis fit

Chaum is Mercury-shaped: **Disburse** acquires (the operating workflow), **Prove** retains (compliance/moat), **Grow** monetizes. Payroll SaaS across a few-thousand-org base is a ~\$10–20M feature category; the revenue is in **idle treasuries** — the same 30-person org disbursing \$150K/mo holds \$3–10M idle. At 5–8% on-chain yield with a 10–15% yield-share, that is \$15–120K/yr per org. Grow is the engine; V1 deliberately does not build it.

## Interfaces (V1)

- [`IYieldAdapter`](../contracts/src/interfaces/i_yield_adapter.cairo) — the seam every yield venue implements: `deposit`, `withdraw`, `position_value`, `solvency_commitment`. Positions are **shielded**; solvency is **provable via viewing roles** (a Stakeholder/Auditor can verify the treasury is solvent without seeing the strategy split), reusing the same commitment + role-scoped disclosure machinery as Prove.
- `StubYieldAdapter` — returns fixed illustrative values so the console's Grow **preview** renders (marked `IN DEVELOPMENT`, deposit disabled). No funds move.

## Position defense — Lyapunov

The previously-specced **Lyapunov** CDP-defense agent is absorbed here as Grow's **position-defense module**: same policy-bounded executor engine, defense as the action (top-up / de-risk a lending position before liquidation, under caps + cadence, re-validated on-chain). It is **not built in V1** and is not part of this repo's contracts; its standalone guardian prompts remain valid as a second action on the shared executor if ever spun out.

## Data flow (when live)

```
OperatingVault idle balance ──deposit──▶ IYieldAdapter (Vesu / Endur / …)
                                            │
                     position shielded ◀────┘
   Stakeholder/Auditor ──verify solvency (viewing role)──▶ solvency_commitment
   Lyapunov agent ──defend position (bounded, on-chain re-validated)──▶ adapter
```

## Why gated

Grow depends on STRK20's private-DeFi phase and on the yield venues exposing programmatic, shieldable positions. Building live yield before those exist would mean fabricating interfaces. V1 therefore ships the **seam** (so integration is a drop-in later) and this document — not a stub pretending to earn. See [GRANT_MILESTONES.md](GRANT_MILESTONES.md) (T3) and [DECISIONS.md](DECISIONS.md).
