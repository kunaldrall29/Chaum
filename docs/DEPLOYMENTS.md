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

> Credential-gated T1 step. Needs: a **funded Sepolia account** (address + key)
> and a **Sepolia RPC URL**. Then:
>
> ```bash
> cd contracts && scarb build            # produce sierra + casm artifacts
> cd ../scripts
> RPC_URL=<sepolia-rpc> \
> DEPLOYER_ADDRESS=<addr> DEPLOYER_PRIVATE_KEY=<key> \
> AGENT_ACCOUNT_ADDRESS=<agent-account> \
> PAYROLL_CONFIG_PATH=../agent/payroll.example.json \
> MAX_PER_PAYEE=1000000000000000000000 MAX_PER_CYCLE=10000000000000000000000 CADENCE=3600 \
> pnpm deploy                            # → writes scripts/deployments.json, prints addresses
> ```
>
> Then run the agent against Sepolia (`agent/.env` with the printed addresses +
> the session key) and record the addresses below.

> _Addresses filled in after the deploy run._

| Contract | Class hash | Address |
| --- | --- | --- |
| `PayrollRegistry` | _TBD_ | _TBD_ |
| `DisbursementVault` | _TBD_ | _TBD_ |
| `DisbursementExecutor` | _TBD_ | _TBD_ |
| `PublicTransferAdapter` | _TBD_ | _TBD_ |
| `MockERC20` (demo asset) | _TBD_ | _TBD_ |

| Resource | URL |
| --- | --- |
| Landing (Vercel) | _TBD_ |
| Dashboard (Vercel) | _TBD_ |
| RPC endpoint | _TBD_ |
| Voyager / Starkscan | _TBD_ |

### Vercel (static — no build)

Both `landing/` and `dashboard/` are self-contained static sites. Deploy each as
its own Vercel project with **Root Directory** set to `landing` / `dashboard`
(build command empty — pinned in each `vercel.json`), or:

```bash
cd landing   && vercel deploy --prod
cd dashboard && vercel deploy --prod
```

Needs a Vercel token / linked project.
