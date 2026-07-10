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

> **The payroll-era V1 above is retired.** It is superseded by the
> operating-account deployment below (fresh redeploy, per decision D7–D11).

### Operating-account build — live on Sepolia (2026-07-10)

The full operating-account build (streams, roles, role-scoped disclosure,
`exec_window`, KYT gate, `MockKytOracle`) deployed fresh via
[`scripts/deploy-and-seed.ts`](../scripts/deploy-and-seed.ts) — all six classes
were already declared, so the run paid **zero declare fees**. Deployer /
owner / agent account `0x020cc09b5ceff6ccb001071bbc1507a8224892e4bde893501de0e69fe10de4f2`.

| Contract | Address |
| --- | --- |
| `MockERC20` — Chaum USD (`cUSD`) | `0xdfe2463b1350496e9615dd777226e699535d2850cb8af2d5c63b13e092556c` |
| `PayrollRegistry` (policy + roles) | `0x6126696449e1d97009b02cc0e8bb9f354def6bc21bc389bf91ee0de7bc9f212` |
| `DisbursementVault` | `0x1882996f9033b26e39533255fac09ebada3a436460cff470d0347472e10849a` |
| `PublicTransferAdapter` | `0x7e027a60d854183381dd1013d8d9fb4bf78408d0139f970ddbbd4e55df7b6e4` |
| `DisbursementExecutor` (streams + KYT) | `0x7712ac81ab58d76e89431ec6938db95c4dcd7b1b4f2792614b799c063e4aa49` |
| `MockKytOracle` | `0x544421e64a22a2ad4bb68d2f8bb29bc58992e58028b26372266242d384d89d1` |

Policy: per-payee cap 1,000,000 · per-cycle cap 10,000,000 · cadence 60s ·
`exec_window` 50s · anomaly 5000/5000 bps · KYT skip-and-log. Payee root
`0x36368bf390ee9dae8ccc230eac9ff4ff858088cdefee775a5e8ba1066181d85` over
`(payee, stream)` leaves. Roles: auditor `0x6dccc5…`, stakeholder `0x392e5a…`,
payee `0x132f8e…` (alice). KYT-denied: `node-ops.stark`
`0x1fde91…` (skip-and-logged, never paid). Written to
`scripts/deployments.sepolia.json` + `scripts/sepolia-demo.json` (the console's
data source).

#### Seeded users (12, across streams)

- **Payroll (7):** alice, ben, cyo, dave, erin, frank, grace
- **Vendor (3):** atlas-audit, node-ops *(KYT-denied)*, cloud-host
- **Grant (2):** grant-014, grant-022

#### Executed cycles (real on-chain, both `verify_aggregate = true`)

| Cycle | Paid / seeded | Per-stream paid (cycle 1) | Tx |
| --- | --- | --- | --- |
| #1 | 11 / 12 (1 KYT-denied) | payroll 17,110 · vendor 8,200 · grant 13,000 | [`0x5bb46e…f90c7d`](https://sepolia.voyager.online/tx/0x5bb46ee32a6651611b3e2e74125ee839db55d6fbb1129c703101ebc52f90c7d) |
| #2 | 11 / 12 (1 KYT-denied) | (same schedule) | [`0x29b624…13822ea`](https://sepolia.voyager.online/tx/0x29b62418d811680962885c7c1746b45b770e330834a1625e4a600b1b13822ea) |

Per-payee amounts are hidden (Pedersen commitments); the aggregate and each
stream subtotal are verifiable on-chain by the auditor / stakeholder roles.

| Resource | URL |
| --- | --- |
| Landing (Vercel) | https://chaum-landing.vercel.app |
| Media kit (Vercel) | https://chaum-media-kit.vercel.app |
| Console (Vercel) — payroll-era build; operating-account rebuild is next | https://chaum-app.vercel.app · https://beta.chaum.fun |
| RPC endpoint | https://api.cartridge.gg/x/starknet/sepolia |
| Explorer | https://sepolia.voyager.online/ |

### Vercel (static — no build)

Both `landing/` and `dashboard/` are self-contained static sites. Deploy each as
its own Vercel project with **Root Directory** set to `landing` / `dashboard`
(build command empty — pinned in each `vercel.json`), or:

```bash
cd landing   && vercel deploy --prod
cd dashboard && vercel deploy --prod
```

Needs a Vercel token / linked project.
