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

Deployed 2026-06-28 (deployer/owner+agent account `0x020cc09b5ceff6ccb001071bbc1507a8224892e4bde893501de0e69fe10de4f2`):

| Contract | Address |
| --- | --- |
| `MockERC20` (demo asset) | `0xff9112d96316df8195468051fd8e3702e91b03ca5e87a32cd43c686b73125c` |
| `PayrollRegistry` | `0xec11eaca97ecc712e664ba746182685349d6edf39460ca76060a9a54e2b5ce` |
| `DisbursementVault` | `0x299aa4e037605d293c4be086bd8b46d587c7772f2f536eb24cc2247f558d571` |
| `PublicTransferAdapter` | `0x51de9449725a1f5cc9cc77700a157f9ab90869e79d0c930c40d3b9a1ced84e7` |
| `DisbursementExecutor` | `0x1df66554167bba9647ed4c5e08054fbd00101e543cc29adb99ea6142a5d0712` |

RPC used for deploy: `https://api.cartridge.gg/x/starknet/sepolia`. Explorer:
[executor on Voyager](https://sepolia.voyager.online/contract/0x1df66554167bba9647ed4c5e08054fbd00101e543cc29adb99ea6142a5d0712).
Policy: per-payee cap 1,000,000 · per-cycle cap 10,000,000 · cadence 60s.

### Executed cycles (real on-chain disbursements)

| Cycle | Payees (users) | Total | verify_aggregate | Tx |
| --- | --- | --- | --- | --- |
| #1 | 5 | 1,000 | ✓ | [`0x407413…`](https://sepolia.voyager.online/tx/0x40741368a3c6b4866a660a7fe68e2a45e0a91b7583da41e0450dbdb21ee7c40) |
| #2 | 12 | 30,610 | ✓ | [`0x15eb74…`](https://sepolia.voyager.online/tx/0x15eb746c96e2587469ddcbacf3d31513211c78dec86951c11357251d27ca643) |
| #3 | 12 | 30,610 | ✓ | [`0x1b4c96…`](https://sepolia.voyager.online/tx/0x1b4c9688ea31028b26f9b93aa8382492bc0ef989f817f2be608be6d57a9f31) |

Payee set updated on-chain to 12 demo users (`update_payees`, root `0x51641c…`). Each cycle's per-payee amounts are hidden (commitments); the aggregate is verified on-chain. The console reads all of this live.

### Operating-account redeploy (staged — gated on testnet funds)

The addresses above are the **payroll-era V1**. The operating-account build
(streams, roles, role-scoped disclosure, `exec_window`, KYT gate,
`MockKytOracle`, `StubYieldAdapter`) is complete and `snforge`-green, with a
one-shot fresh-deploy-and-seed script:

```bash
cd scripts
RPC_URL=<sepolia-rpc> DEPLOYER_ADDRESS=<addr> DEPLOYER_PRIVATE_KEY=<key> \
pnpm tsx deploy-and-seed.ts   # fresh deploy + 12 users across streams, roles, KYT-deny node, 2 cycles
```

**Status: blocked on funds.** Sepolia declare fees spiked ~10× (executor class
declare ≈ 62 STRK against a 31.5 STRK balance; ~90–100 STRK needed for the full
suite), and the public faucet is address-cooldowned. `deploy.ts` now pre-checks
`getClassByHash` to skip already-declared classes, so a retry only pays for
genuinely new classes. Retry when the deployer is funded or gas normalizes; the
new addresses + seeded cycles get recorded here on success.

| Resource | URL |
| --- | --- |
| Landing (Vercel) | https://chaum-landing.vercel.app |
| Console — functional, live Sepolia data (Vercel) | https://chaum-app.vercel.app · https://beta.chaum.fun |
| RPC endpoint | _TBD (Sepolia)_ |
| Voyager / Starkscan | _TBD (Sepolia)_ |

### Vercel (static — no build)

Both `landing/` and `dashboard/` are self-contained static sites. Deploy each as
its own Vercel project with **Root Directory** set to `landing` / `dashboard`
(build command empty — pinned in each `vercel.json`), or:

```bash
cd landing   && vercel deploy --prod
cd dashboard && vercel deploy --prod
```

Needs a Vercel token / linked project.
