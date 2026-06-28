# Chaum

**Private payroll & treasury disbursement on Starknet.** A treasury funds a vault, defines a payee set and a policy, and delegates **one scoped session key** to an autonomous agent that runs disbursement cycles. The agent *proposes*; the contract *disposes* — every condition is re-validated on-chain before any token moves.

> **Individual amounts are private. The aggregate is provable.**

Named for David Chaum — blind signatures and digital cash.

Built for the STRK20 Request for Startups #11.

---

## Live deployment

Fully deployed and running on **Starknet Sepolia**, with a console that reads live on-chain state.

| | |
| --- | --- |
| **Console** (functional, live Sepolia data) | **https://beta.chaum.fun** · [chaum-app.vercel.app](https://chaum-app.vercel.app) |
| **Landing** (selective-disclosure demo) | [chaum-landing.vercel.app](https://chaum-landing.vercel.app) |
| **Repo** | [github.com/kunaldrall29/Chaum](https://github.com/kunaldrall29/Chaum) |

### Contracts on Starknet Sepolia

| Contract | Address (Voyager) |
| --- | --- |
| `MockERC20` (demo payout asset) | [`0xff9112…73125c`](https://sepolia.voyager.online/contract/0xff9112d96316df8195468051fd8e3702e91b03ca5e87a32cd43c686b73125c) |
| `PayrollRegistry` | [`0xec11ea…e2b5ce`](https://sepolia.voyager.online/contract/0xec11eaca97ecc712e664ba746182685349d6edf39460ca76060a9a54e2b5ce) |
| `DisbursementVault` | [`0x299aa4…558d571`](https://sepolia.voyager.online/contract/0x299aa4e037605d293c4be086bd8b46d587c7772f2f536eb24cc2247f558d571) |
| `PublicTransferAdapter` | [`0x51de94…ced84e7`](https://sepolia.voyager.online/contract/0x51de9449725a1f5cc9cc77700a157f9ab90869e79d0c930c40d3b9a1ced84e7) |
| `DisbursementExecutor` | [`0x1df665…a5d0712`](https://sepolia.voyager.online/contract/0x1df66554167bba9647ed4c5e08054fbd00101e543cc29adb99ea6142a5d0712) |

Owner / agent account: [`0x020cc0…0de4f2`](https://sepolia.voyager.online/contract/0x020cc09b5ceff6ccb001071bbc1507a8224892e4bde893501de0e69fe10de4f2) ·
First real private cycle (5 payees, `verify_aggregate = true`): [tx `0x407413…ee7c40`](https://sepolia.voyager.online/tx/0x40741368a3c6b4866a660a7fe68e2a45e0a91b7583da41e0450dbdb21ee7c40).
Policy: per-payee cap 1,000,000 · per-cycle cap 10,000,000 · cadence 60s · 5 payees. Full record in [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md).

---

## Why

Treasuries that run payroll on-chain face a dilemma: automate disbursement and either (a) hand an agent a hot wallet that can drain everything, or (b) leak every employee's salary to the entire world, forever. Chaum refuses both.

- **Bounded delegation.** The agent holds a session key scoped to exactly one action — `execute_cycle` — against a fixed payee set, under per-payee and per-cycle caps and a minimum cadence. A compromised agent key **cannot** withdraw, redirect funds, pay a non-payee, or exceed caps. The contract re-checks every rule on every call.
- **Selective privacy.** Per-payee amounts are hidden behind additively-homomorphic Pedersen commitments. The protocol proves `Σ amounts = disbursed total` without revealing the split. Each payee can open *only their own* commitment; an auditor can verify *only the aggregate*.

## What's private vs. provable

| Fact | Who can learn it | How |
| --- | --- | --- |
| The set of approved payees | Public | Merkle root in `PayrollRegistry` |
| Per-payee, per-cycle, cadence caps | Public | Policy in `PayrollRegistry` |
| The cycle's **aggregate** total | Anyone / auditor | `verify_aggregate(cycle_id)` over the homomorphic commitment sum |
| An **individual** payee's amount | That payee only | `open_own(cycle_id, payee, amount, blinding)` — reverts for anyone else |
| The split of the total across payees | **No one** (commitment layer) | Pedersen commitments are perfectly hiding |
| The amount actually transferred | Depends on the transfer adapter — see below | — |

### Honest caveat on the transfer leg

Starknet calldata and ERC-20 `Transfer` events are public and permanent. Chaum's **commitment ledger, aggregate proof, and selective disclosure are real and fully functional today.** But amount confidentiality of the *token movement itself* is only as strong as the active transfer adapter:

- **`PublicTransferAdapter`** (devnet/demo): a plain ERC-20 transfer. The amount leaks in the ERC-20 event. Privacy is **demonstrated via commitments, not yet enforced end-to-end.**
- **`Strk20TransferAdapter`** (testnet/mainnet, T2): routes the movement through [STRK20](https://www.starknet.io/blog/starknet-v0-14-2-the-privacy-engine-arrives/) shielded transfers. The amount is hidden at the token layer. Because the commitment layer is already in place, this activates with **zero change** to Chaum's cryptographic core. STRK20 launched in March 2026; its developer SDK is a subsequent phase, so the real adapter is interface-complete and wired once the SDK lands.

Chaum's *own* events never carry cleartext amounts — only commitment coordinates. The only amount leak is isolated inside the one swappable adapter.

## What the agent **cannot** do

A compromised or malicious agent session key can **only** do exactly one thing: call `execute_cycle` to pay the **already-registered** payee set, from the **already-funded** vault, **within caps**, **no more often than the cadence**. Specifically it **cannot**:

- Withdraw funds to itself or any non-payee address — there is no fund path out of the vault except to a Merkle-proven payee or back to the owner.
- Add, remove, or change payees, or raise any cap — those are owner-only and the agent key is rejected.
- Pay any address not in the committed Merkle payee set — membership is proven on-chain per payout.
- Exceed `max_per_payee` or `max_per_cycle`, or run a cycle before the cadence elapses.
- Call any entrypoint other than `execute_cycle`.
- Act after the owner calls `revoke` (which zeroes the session key) or `pause`.

The owner can revoke at any time. The agent never holds custody.

## Architecture

```mermaid
flowchart TD
    Owner[Treasury Owner] -->|deposit / withdraw| Vault[DisbursementVault]
    Owner -->|create/update policy, payees, caps, cadence| Registry[PayrollRegistry]
    Owner -->|register / revoke session key| Registry
    Agent[Autonomous Agent - scoped session key] -->|execute_cycle| Exec[DisbursementExecutor]
    Exec -->|re-validate caller, cadence, caps, merkle, sum| Registry
    Exec -->|pull funds| Vault
    Exec -->|transfer| Adapter{IShieldedTransfer}
    Adapter -->|devnet/demo| Pub[PublicTransferAdapter - ERC20]
    Adapter -->|testnet T2| Strk[Strk20TransferAdapter - shielded]
    Exec -->|store commitments + attestation| Reg8004[ERC-8004 registry]
    Payee[Payee] -->|open_own| Exec
    Auditor[Auditor] -->|verify_aggregate| Exec
```

## Repository layout

```
contracts/   Cairo (Scarb): registry, vault, executor, commitments, merkle, adapters, mocks, vendor/
agent/        TypeScript agent runtime: deterministic cycle engine, no LLM in the hot path
scripts/      deploy + run-cycle (pnpm demo)
dashboard/    Vite + React console (5 pages) reading LIVE Sepolia data via starknet.js
landing/      marketing + selective-disclosure demo (static, design-system)
docs/         ARCHITECTURE, COMPLIANCE_MODEL, POLICY_MODEL, DECISIONS, GRANT_MILESTONES, DEPLOYMENTS
```

## Quickstart

> Requires the Starknet toolchain via [starkup](https://sh.starkup.sh) (Scarb, Starknet Foundry, devnet) and Node 20+ with pnpm.

```bash
# 1. Install the Cairo toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.starkup.sh | sh

# 2. Build & test the contracts
cd contracts && scarb build && snforge test

# 3. Install JS deps and run the end-to-end demo (boots devnet, deploys, runs a private cycle)
cd .. && pnpm install && pnpm demo
```

The demo proves, in one command: individual amounts hidden (commitments only), aggregate verified, one payee opens their own amount, an auditor verifies the sum, a non-payee is rejected, and an over-cap payout reverts. (Validated end-to-end on starknet-devnet — `✅ DEMO PASSED`.)

View the UIs:

```bash
pnpm landing                          # marketing + disclosure demo → http://localhost:8000
cd dashboard && npm install && npm run dev   # live console (5 pages)      → http://localhost:5173
```

The console reads the deployed Sepolia contracts directly — vault balance, policy/caps/cadence, per-payee commitments, `verify_aggregate`, and `CycleExecuted` events are all live; the Disclosure → Payee view recomputes `commit(amount, blinding)` in the browser and checks it against the on-chain commitment.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components and data flow
- [docs/COMPLIANCE_MODEL.md](docs/COMPLIANCE_MODEL.md) — the commitment scheme, disclosure guarantees, exactly what each party learns
- [docs/POLICY_MODEL.md](docs/POLICY_MODEL.md) — the policy object and its enforcement
- [docs/DECISIONS.md](docs/DECISIONS.md) — key technical decisions and tradeoffs
- [docs/GRANT_MILESTONES.md](docs/GRANT_MILESTONES.md) — T1 / T2 / T3 roadmap
- [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) — toolchain versions and deployed addresses

## Status

Proof of concept (T1) — **deployed and live on Starknet Sepolia** with a real executed cycle and a live console (links above). 52 `snforge` tests green; `pnpm demo` passes end-to-end on devnet; commitment math cross-verified Cairo ↔ TypeScript.

Strict non-goals for V1: yield, lending, cards, consumer/mass-market payroll, multi-chain, token, mainnet, LLM in the execution path, recipient-side accounts.

## License

MIT — see [LICENSE](LICENSE).
