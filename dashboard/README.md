# Chaum console (dashboard)

The treasury console — five views matching the design system:

1. **Treasury** — vault balance, current cycle status, payee count, last cycle's verified aggregate; fund / withdraw (owner).
2. **Policy** — define the payee set (→ Merkle root), per-payee & per-cycle caps, cadence; register/revoke the agent session key; plain-language pre-sign summary.
3. **Cycle** — run or watch a cycle; payout table with every amount as a redaction bar and the aggregate legible; explorer links.
4. **Disclosure** — the proof center: Auditor verifies the aggregate; a Payee opens only their own commitment (exportable income proof).
5. **Activity** — cycle history, `CycleExecuted` events, ERC-8004 attestations.

## Source

Authored in [Claude Design](https://claude.ai/design) and vendored verbatim
(same runtime as [`../landing`](../landing)): `index.html` (`<x-dc>` template +
`DCLogic`) + `support.js` (self-contained `dc-runtime`; loads React at runtime,
no build). The only edit is the GitHub URL.

## Run locally

```bash
cd dashboard && python3 -m http.server 8001
# open http://localhost:8001
```

## Wiring to live Starknet (next step)

The console currently renders the design's representative data. To make it live,
replace its in-component data with reads/writes via Starknet — the exact calls
are already implemented in [`../agent/src/chain.ts`](../agent/src/chain.ts):

- reads: `get_policy`, vault `balance`, executor `get_cycle` / `verify_aggregate` / `commitment_of`
- writes (wallet via `starknetkit`): owner `deposit` / `withdraw` / `create_policy` / `update_payees` / `set_agent` / `revoke`; payee `open_own`

Point it at the addresses in [`../docs/DEPLOYMENTS.md`](../docs/DEPLOYMENTS.md).

## Deploy (Vercel)

Static — no build. Set the project **Root Directory** to `dashboard`.
