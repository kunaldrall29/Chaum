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
`leaf = Poseidon([payee])`, nodes = commutative Poseidon `Poseidon([min, max])`,
verify folds proof siblings into the leaf.

**Why.** Owning both sides guarantees the on-chain verify and the off-chain
(TypeScript) tree builder match exactly, with no left/right proof flags
(commutative hashing). Poseidon is the STARK-native, cheaper hash.

## D6 — No LLM in the execution path

**Decision.** The agent runtime is deterministic: `(policy, schedule, payee_data)
→ CycleDecision`, simulate-then-submit, with idempotency and retries. Any LLM use
(`explain.ts`) is **post-hoc** and gated behind a key.

**Why.** Determinism is a security and auditability property. The whole point of
Chaum is that the *contract* re-validates everything; the agent must be boring,
reproducible, and incapable of surprising the policy. A model in the hot path
would add nondeterminism, prompt-injection surface, and an unauditable decision
step — for no benefit, since the contract is the source of truth.
