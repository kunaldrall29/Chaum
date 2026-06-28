# Chaum console (dashboard)

A **functional** Vite + React + TypeScript app that reads **live data from the
deployed Starknet Sepolia contracts** — nothing is mocked. Five pages:

1. **Treasury** — real vault balance, caps, cadence, status, cycle count, and the last cycle's verified aggregate.
2. **Policy** — the on-chain policy (caps, cadence, Merkle root, registered agent) + a plain-language summary + the payee set.
3. **Cycle** — the payout table: every amount a redaction bar, each per-payee **commitment read from chain**, the cycle-total commitment, and `verify_aggregate` (✓ on-chain). Links to the `execute_cycle` tx on Voyager.
4. **Disclosure** — Public / Auditor / Payee. Auditor uses the on-chain `verify_aggregate`; the **payee view recomputes `commit(amount, blinding)` in your browser and checks it against the on-chain commitment** — a real selective-disclosure proof.
5. **Activity** — `CycleExecuted` events read from the executor, with tx links.

All reads go through [`src/chain.ts`](src/chain.ts) (starknet.js `RpcProvider`).
The deployed addresses + the demo cycle live in [`src/config.json`](src/config.json).
It is read-only (no wallet): owner/agent writes happen via the CLI/agent, which
hold the scoped keys.

## Run locally

```bash
cd dashboard && npm install && npm run dev   # http://localhost:5173
```

## Deploy (Vercel)

Vite build, output `dist/` (pinned in `vercel.json`). Set the Vercel project
**Root Directory** to `dashboard`, or:

```bash
cd dashboard && vercel deploy --prod
```
