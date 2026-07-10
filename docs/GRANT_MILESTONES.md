# Grant Milestones

Chaum is the **confidential operating account for onchain organizations** — three modules in strict sequence: **Disburse** (the wedge), **Prove** (the moat), **Grow** (the engine). T1 builds Disburse + Prove; Grow ships as a seam.

## T1 — Disburse + Prove on testnet (this repository)

**Goal:** agentic disbursement under on-chain policy, with role-scoped selective disclosure and compliance screening — the two SDK-independent modules, fully working.

### Disburse
- [x] Cairo contracts under Scarb: `PayrollRegistry` (policy + roles), `DisbursementVault`, `DisbursementExecutor`, `commitments`, `merkle`, adapters, mock ERC-20.
- [x] Streams (`Payroll` / `Vendor` / `Grant`): every payout classified; membership on `(payee, stream)` leaves.
- [x] Bounded-delegation executor: session-key auth, per-payee/per-cycle caps, cadence **+ execution window**, Merkle membership, homomorphic-sum consistency — all re-validated on-chain.
- [x] **Compliance gate:** `IKytOracle` seam (`MockKytOracle` on testnet); denied payee skip-and-log (default) or revert-cycle (policy flag).
- [x] Deterministic TypeScript agent: simulate-before-submit, nonce mgmt, retry/backoff, sqlite idempotency, structured logs; **timing jitter** (windowed execution) + **anomaly-halt** (payee-set × total thresholds) + **audit-packet** export.
- [x] `pnpm demo`: boots devnet, deploys, runs a private multi-stream cycle, proves the guarantees end-to-end.

### Prove
- [x] Additively-homomorphic EC Pedersen commitments; on-chain `verify_aggregate` (auditor), **`verify_stream_aggregate` per category (stakeholder)**, `open_own` (payee) — with **role-scope isolation tests** proving no scope leaks another.
- [x] Roles registry (`Owner` / `Operator` / `Auditor` / `Payee` / `Stakeholder`) gating disclosure.
- [x] Audit-packet `.zip` (commitments + stream totals + on-chain verify instructions; no opening secrets).
- [x] `snforge` suite green (revert matrix + role-scope isolation + stream subtotals).

### Live
- [x] Operating-account build **deployed to Starknet Sepolia** (streams + roles + role-scoped disclosure + exec-window + KYT gate), seeded with 12 users across payroll/vendor/grant, a KYT-denied payee, and two real cycles both `verify_aggregate = true` — see [DEPLOYMENTS.md](DEPLOYMENTS.md).
- [x] Landing + media kit on Vercel; console redeploy against the live operating-account addresses is the next step.

**Transfer leg:** `PublicTransferAdapter` (ERC-20). Amount privacy is demonstrated via commitments; the transfer itself is public — see [PRIVACY_THREAT_MODEL.md](PRIVACY_THREAT_MODEL.md).

## T2 — STRK20 transport + design partners + bridge-in

**Goal:** true end-to-end amount confidentiality, real orgs live, distribution.

- Integrate the real **STRK20 shielded-transfer** interface into `Strk20TransferAdapter` once the SDK ships (adapter swap, not a redesign — the commitment/disclosure core is already in place). Support both single-proof fan-out and sequential-transfer modes.
- **Viewing-key parity:** align `verify_aggregate` / `verify_stream_aggregate` / `open_own` with STRK20's encrypted viewing-key path.
- On-chain cap enforcement for hidden amounts: bounded range-proof verifier or denomination buckets.
- **Bridge-in v1** (`IBridgeIn`, RFS #6): fund the pool from Ethereum / L2s / Solana; withdrawals exit to any chain with no on-chain link.
- **5+ design-partner orgs** live (DAOs / protocol teams / foundations); reliability hardening + alerting; external-review prep.

## T3 — Grow + mainnet

**Goal:** the revenue engine + production.

- **Grow v1:** `IYieldAdapter` live for Vesu (lending) / Endur (staking); positions shielded, solvency provable via viewing roles; **Lyapunov** position-defense module on the shared executor. See [GROW_DESIGN.md](GROW_DESIGN.md).
- Prove SaaS tier (auditor seats, attestations, packet automation); recurring schedules at scale; multi-asset.
- External security audit; mainnet.

> **V1 non-goals (strict):** live yield, bridge implementation, Lyapunov, mainnet, LLM in the execution path, consumer/mass-market payroll, a token, multi-chain runtime, recipient-side accounts.
