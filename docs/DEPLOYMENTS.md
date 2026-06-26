# Deployments

## Toolchain (resolved by `starkup`, 2026-06-26)

Versions are **resolved by starkup's compatible set**, not hand-pinned. Recorded here for reproducibility.

| Tool | Version |
| --- | --- |
| Scarb | 2.18.0 (`e6144df0f`, 2026-04-21) |
| Cairo edition | `2024_07` |
| Starknet Foundry (`snforge` / `sncast`) | 0.61.0 |
| universal-sierra-compiler | 2.9.0 |
| starknet-devnet | 0.8.0 |
| cairo-coverage | 0.6.1 |
| cairo-profiler | 0.16.0 |

JS runtime: Node `>=20` (built on v24.14.0), pnpm 10.32.1.

Reinstall with:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.starkup.sh | sh
```

## Deployed contracts

### starknet-devnet (local)

Ephemeral — addresses are printed by `pnpm demo` / `scripts/deploy.ts` on each run; not tracked here.

### Starknet Sepolia

> Filled in after the credential-gated deployment step (T1 deliverable).

| Contract | Class hash | Address |
| --- | --- | --- |
| `PayrollRegistry` | _TBD_ | _TBD_ |
| `DisbursementVault` | _TBD_ | _TBD_ |
| `DisbursementExecutor` | _TBD_ | _TBD_ |
| `PublicTransferAdapter` | _TBD_ | _TBD_ |
| `MockERC20` (demo asset) | _TBD_ | _TBD_ |

| Resource | URL |
| --- | --- |
| Dashboard (Vercel) | _TBD_ |
| RPC endpoint | _TBD_ |
| Voyager / Starkscan | _TBD_ |
