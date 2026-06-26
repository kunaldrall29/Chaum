# Grant Milestones

Three tranches. T1 is this proof of concept. T2 and T3 are scoped but not built here.

## T1 — Proof of concept (this repository)

**Goal:** a working private-disbursement cycle on testnet, with the commitment layer and the autonomous agent fully functional and the public-transfer leg carrying the demo.

- [x] Cairo contracts compiling under Scarb (`PayrollRegistry`, `DisbursementVault`, `DisbursementExecutor`, `commitments`, adapters, mock ERC-20).
- [x] Additively-homomorphic EC Pedersen commitments with on-chain aggregate verification and selective disclosure (`verify_aggregate`, `open_own`).
- [x] Bounded-delegation executor: session-key auth, caps, cadence, Merkle membership all re-validated on-chain.
- [x] `snforge` test suite green, including the full revert matrix and the homomorphic-sum tamper test.
- [x] Deterministic TypeScript agent: simulate-before-submit, nonce management, retry/backoff, sqlite idempotency, structured logs.
- [x] Dashboard (Treasury / Policy / Cycle / Disclosure / Activity) with redaction bars and the proof center.
- [x] `pnpm demo`: one command boots devnet, deploys, funds, registers a policy + 5 payees, runs a private cycle, and proves the guarantees end-to-end.
- [ ] Deployed to **Starknet Sepolia**; agent running against Sepolia; dashboard on Vercel (credential-gated final step).

**Transfer leg:** `PublicTransferAdapter` (ERC-20). Amount privacy is demonstrated via commitments; the transfer itself is public — see [COMPLIANCE_MODEL.md](COMPLIANCE_MODEL.md).

## T2 — STRK20 shielded-transfer integration

**Goal:** true end-to-end amount confidentiality and compliance parity, plus reliability hardening.

- Integrate the real STRK20 shielded-transfer interface into `Strk20TransferAdapter` once the STRK20 developer SDK / wallet API ships (it was "next phase" at T1 build time — see [DECISIONS.md](DECISIONS.md)). Because the commitment layer and the adapter seam are already in place, this is an adapter swap, not a redesign.
- **Viewing-key parity:** align `verify_aggregate` / `open_own` with STRK20's encrypted viewing-key disclosure path so auditor and payee disclosure work uniformly across the commitment layer and the shielded transfer layer.
- On-chain cap enforcement for hidden amounts: a bounded range-proof verifier (or denomination buckets) so caps hold without revealing amounts.
- Reliability hardening: alerting (`notify.ts` to webhook/Telegram on cycle executed / failed / vault below one cycle's max), richer retry/observability, key-rotation runbook.

## T3 — Scale & multi-asset

**Goal:** production-shaped operation.

- Recurring schedules at scale: many policies, many payees, batched cycles, gas-optimized commitment storage.
- Multi-asset payout (beyond a single ERC-20 / STRK20 asset).
- External security review / audit of the contracts and the commitment scheme.
- Operational maturity: monitoring, SLOs, incident runbooks.

> **Out of scope across all tranches (V1 non-goals):** yield, lending, cards, consumer/mass-market payroll, multi-chain, a token, mainnet (until audited), any LLM in the execution path, and recipient-side accounts / neobank features (reserved).
