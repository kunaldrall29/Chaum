# Vendored dependencies

These three Cairo packages are **vendored verbatim** from
[keep-starknet-strange/starknet-agentic](https://github.com/keep-starknet-strange/starknet-agentic)
(MIT — see [LICENSE](./LICENSE)), commit `ae984ac382725db88a75a21814389886b76bb034`:

| Vendored path | Upstream path | Used for |
| --- | --- | --- |
| `erc8004/` | `contracts/erc8004-cairo` | ERC-8004 identity / reputation / **validation** registries — Chaum's executor writes a per-cycle attestation to the validation registry |
| `session_account/` | `contracts/session-account` | Session-key account (scoped key + spending policy) — the agent's account |
| `agent_account/` | `contracts/agent-account` | AA-native agent account with session keys + ERC-8004 identity binding |

## Why vendored (and not a git dependency)

Upstream ships **no `[lib]` target** on any of these packages (only
`[[target.starknet-contract]]`), so Scarb refuses them as importable library
dependencies: a `git = { ... }` dep prints
`ignoring invalid dependency ... which is missing a lib or cairo-plugin target`
and every `use erc8004::...` fails to resolve. That fix must land in the
dependency's own manifest — it cannot be applied from Chaum's side. There is also
no semver release tag for the contract packages (only a rev).

The packages are otherwise fully compatible with our toolchain (edition
`2024_07`; `starknet 2.14.0` caret is satisfied by `2.18.0`; all build under
Scarb 2.18.0), so vendoring lets us reuse their real, audited code today.

## Local modifications (manifest-only; contract logic untouched)

Per package `Scarb.toml`:
- added a `[lib]` target (`sierra = true`) so the package is importable;
- `openzeppelin` switched from the git tag `v3.0.0` to the registry `"3.0.0"`
  (same release — keeps a single OpenZeppelin source in the graph);
- `starknet` set to `"2.18.0"`;
- removed `[dev-dependencies]` (snforge_std 0.54.1) and their test modules
  (`session_account/src/tests`, `erc8004/src/mock`) so the libs compile without
  test-only deps. **No `.cairo` contract logic was modified.**

## Migration path → git dependency

Once upstream adds a `[lib]` target to these packages (recommended: open an issue
/ PR), replace the `vendor/*` path deps in `../Scarb.toml` with rev-pinned git
deps, e.g.:

```toml
erc8004 = { git = "https://github.com/keep-starknet-strange/starknet-agentic", rev = "<commit>" }
```

See [../../docs/DECISIONS.md](../../docs/DECISIONS.md) for the full decision record.
