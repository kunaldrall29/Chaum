# Decisions

Key technical decisions and their rationale. Dated against the build (June 2026).

## D1 — Reuse starknet-agentic by **vendoring**, not a git dependency

**Decision.** Vendor `erc8004`, `session_account`, and `agent_account` from
[keep-starknet-strange/starknet-agentic](https://github.com/keep-starknet-strange/starknet-agentic)
(MIT, commit `ae984ac`) into [`contracts/vendor/`](../contracts/vendor/), rather
than consuming them as Scarb git dependencies.

**Why.** Direct git-dependency consumption is **empirically blocked**: none of the
upstream packages declares a `[lib]` target (only `[[target.starknet-contract]]`),
so Scarb refuses them as importable libraries (`ignoring invalid dependency ...
missing a lib or cairo-plugin target`; every `use erc8004::...` fails). The fix
must land in the dependency's own manifest and cannot be applied from Chaum's
side, and there is no semver tag to pin. The code is otherwise fully
toolchain-compatible (edition `2024_07`; all packages build under Scarb 2.18.0),
so vendoring reuses their real, audited code today.

**Modifications** are manifest-only (added `[lib]`, unified OpenZeppelin to the
registry `3.0.0`, dropped dev-deps/test modules); **no contract logic changed.**
See [`contracts/vendor/README.md`](../contracts/vendor/README.md).

**Migration path.** When upstream adds a `[lib]` target, swap the `vendor/*` path
deps for rev-pinned git deps. Recommended: open an upstream issue/PR.

## D2 — EC Pedersen commitments, not hash commitments

**Decision.** Hide amounts with additively-homomorphic EC Pedersen commitments
`C = amount·G + blinding·H` (Cairo `core::ec`), not `Poseidon(amount, blinding)`.

**Why.** The headline property — *private split, provable aggregate* — **is**
additive homomorphism: `Σ Cᵢ = (Σ amount)·G + (Σ blinding)·H`. A hash commitment is
hiding and binding but **not** homomorphic, so it cannot prove a sum without
revealing every term. The extra EC-builtin gas is the price of the feature, not
optional polish. `H` is a NUMS generator (Poseidon hash-to-curve, unknown DL).
Full tradeoff table in [COMPLIANCE_MODEL.md](COMPLIANCE_MODEL.md).

**Subtlety handled.** EC scalar mul reduces mod the curve order, so the blinding
sum is accumulated mod `CURVE_ORDER` (u256), not mod the field prime, so the
homomorphic consistency check `C_total == commit(Σamount, Σblinding)` holds
exactly.

## D3 — STRK20 transfer leg: adapter seam + interface-complete stub

**Decision.** Route the token movement through an `IShieldedTransfer` adapter.
Ship `PublicTransferAdapter` (plain ERC-20) for devnet/demo; ship
`Strk20TransferAdapter` as an interface-complete stub that reverts.

**Why.** STRK20 (Starknet's note-based shielded-transfer standard) launched March
2026, but its **developer SDK / programmatic interface is a subsequent phase and
was not available at build time.** Per our working rule we do not fabricate STRK20
entrypoints or addresses. The seam makes the real adapter a drop-in once the SDK
lands (T2) with **zero change** to the executor or commitment layer. Chaum's own
events are amount-free, so the only amount leak is isolated inside the swappable
public adapter. See [COMPLIANCE_MODEL.md §3](COMPLIANCE_MODEL.md).

## D4 — On-chain session authorization is caller-address based

**Decision.** `execute_cycle` authorizes by `get_caller_address() == policy.agent`
(or owner). The *scoping* of the session key to only-this-entrypoint is enforced
by the agent's **account contract** (the vendored `session_account` /
`agent_account`), not by the executor.

**Why.** This is the correct Starknet account-abstraction split: the account
validates the session-key signature and policy in `__validate__`; the target
contract checks the authorized caller address. It keeps the executor simple and
adapter-agnostic, and works whether the agent uses the vendored session account or
(fallback) a plain account whose address the owner registered. Revocation
(`registry.revoke`) zeroes the agent and the executor then rejects.

## D5 — Merkle payee set: self-contained commutative Poseidon

**Decision.** A small in-repo Merkle module ([`merkle.cairo`](../contracts/src/merkle.cairo)):
`leaf = Poseidon([payee, stream])`, nodes = commutative Poseidon `Poseidon([min, max])`,
verify folds proof siblings into the leaf.

**Why.** Owning both sides guarantees the on-chain verify and the off-chain
(TypeScript) tree builder match exactly, with no left/right proof flags
(commutative hashing). Poseidon is the STARK-native, cheaper hash. Binding the
stream into the leaf (see D7) means membership proves not just *who* is approved
but *under which stream* — the agent cannot reclassify a payee's payout.

## D6 — No LLM in the execution path

**Decision.** The agent runtime is deterministic: `(policy, schedule, payee_data)
→ CycleDecision`, simulate-then-submit, with idempotency and retries. Any LLM use
(`explain.ts`) is **post-hoc** and gated behind a key.

**Why.** Determinism is a security and auditability property. The whole point of
Chaum is that the *contract* re-validates everything; the agent must be boring,
reproducible, and incapable of surprising the policy. A model in the hot path
would add nondeterminism, prompt-injection surface, and an unauditable decision
step — for no benefit, since the contract is the source of truth.

## D7 — Streams as a first-class payout classifier + per-stream subtotals

**Decision.** Every payout carries a `Stream` (`Payroll` / `Vendor` / `Grant`);
the payee-set leaf binds `(payee, stream)` (D5); and the executor accumulates a
per-stream subtotal commitment alongside the grand total, exposed via
`verify_stream_aggregate(cycle_id, stream)`.

**Why.** An operating account pays payroll, vendors, and grants — categories with
different disclosure audiences. Committing a subtotal per stream lets a
stakeholder verify "grants totalled X this cycle" without seeing payroll, which a
single grand-total commitment cannot do. Binding the stream into the membership
leaf makes the classification unforgeable by the agent.

## D8 — Role-scoped selective disclosure via an on-chain role registry

**Decision.** `PayrollRegistry` maps each address to a `Role` (`Owner` /
`Operator` / `Auditor` / `Payee` / `Stakeholder`); the executor reads it to gate
disclosure: `verify_aggregate` (auditor), `verify_stream_aggregate`
(stakeholder), `open_own` (payee). The owner is always Owner-role. Scope
isolation is asserted in tests — no scope leaks another.

**Why.** "Prove" is the moat, and a proof is only useful if it goes to *exactly*
the right party. Encoding roles on-chain (rather than in the UI) makes the
disclosure boundary contract-enforced, not advisory — the same trust model as the
disbursement rules.

## D9 — KYT compliance as a swappable oracle seam, skip-and-log by default

**Decision.** An `IKytOracle` interface ([`i_kyt_oracle.cairo`](../contracts/src/interfaces/i_kyt_oracle.cairo)),
with `MockKytOracle` on testnet. The executor screens each payee pre-transfer;
default policy **skips-and-logs** a denied payee (`PayoutDenied` event) while
paying the rest, or reverts the whole cycle when the `KYT_DENY` policy flag is
set.

**Why.** Real orgs need compliance screening, but the *provider* is a deployment
choice (Chainalysis-style oracle, allowlist, etc.) — so it must be a seam, not a
baked-in dependency. Skip-and-log is the safer default: one flagged address should
not strand an entire payroll run, but the denial must be on-chain and auditable.
Revert-on-deny stays available for stricter policies.

## D10 — Timing privacy: on-chain execution window + off-chain deterministic jitter, plus anomaly-halt

**Decision.** The policy carries an `exec_window` (`exec_window < cadence`); the
executor requires each cycle to land in `[due, due + exec_window]`. The agent
picks a deterministic-but-random-looking time inside that window, seeded by
`cycle_id` (survives restarts). Separately, before submitting, the agent halts
if the payee set **and** the cycle total both shift beyond
`anomaly_*_delta_bps` and requires owner acknowledgement.

**Why.** A fixed cadence leaks a predictable heartbeat (and correlates cycles
across chains). A window the contract enforces plus off-chain jitter breaks that
timing signal without weakening any on-chain guarantee. Anomaly-halt is a
belt-and-suspenders check against a compromised agent making a large, structurally
unusual payout that still fits within caps — it is off-chain because it is a
*policy heuristic*, not a hard invariant, and must fail safe (halt), never
silently pass.

## D11 — Grow ships as an interface seam, not a live module, in V1

**Decision.** `IYieldAdapter` / `IBridgeIn` interfaces exist and are wired
through the console as an "IN DEVELOPMENT" panel, but `StubYieldAdapter`
**reverts** on `deposit`/`withdraw` (`'GROW: not live in V1 (T3)'`) and returns
zero positions. No funds move into yield in V1.

**Why.** Grow is the T3 revenue engine and a real design commitment (see
[GROW_DESIGN.md](GROW_DESIGN.md)), but shipping live yield now would violate the
strict V1 non-goals and add custody risk before an audit. Landing the *seam*
proves the architecture accommodates it (adapter swap, not redesign) while the
stub makes the not-live status unfakeable — a deposit call fails loudly rather
than pretending.
