# Policy Model

The policy is the contract between the treasury owner and the agent. It is set by the owner, stored on-chain in `PayrollRegistry`, and **re-validated on every cycle** by `DisbursementExecutor`. The agent cannot change it; a compromised agent key is bounded entirely by it.

## The `Policy` object

```cairo
struct Policy {
    owner: ContractAddress,         // sole mutator of this policy
    payee_root: felt252,            // Merkle root of the approved payee set
    max_per_payee: u256,            // cap on any single payout
    max_per_cycle: u256,            // cap on the sum of a cycle
    cadence: u64,                   // minimum seconds between cycles
    last_cycle_at: u64,             // timestamp of the last executed cycle
    paused: bool,                   // owner kill-switch
    agent_session_pubkey: felt252,  // the one scoped key; 0 == revoked
}
```

## Owner operations (owner-only, all event-emitting)

| Function | Effect | Invariants enforced at write time |
| --- | --- | --- |
| `create_policy(...)` | Initialize a policy | caps nonzero; `max_per_payee ≤ max_per_cycle`; cadence ≥ 0 |
| `update_policy(...)` | Change caps / cadence | same invariants |
| `update_payees(new_root)` | Replace the payee set | root ≠ 0 |
| `pause()` / `unpause()` | Toggle the kill-switch | — |
| `revoke()` | Zero the session key | sets `agent_session_pubkey = 0` |

The payee set is committed as a **Merkle root**, not an on-chain list: adding or removing payees is a single `update_payees(new_root)`, and membership is proven per payout at disbursement time (`leaf = hash(payee)`; proof verified against `payee_root`). This keeps payee management O(1) on-chain and the set itself off the public storage.

## Agent operation (the only one)

| Function | Caller | Re-validated on-chain |
| --- | --- | --- |
| `execute_cycle(cycle_id, payouts[])` | registered session key **or** owner | every rule below |

### What `execute_cycle` re-checks, in order

1. **Not paused / not revoked.** `paused == false` and `agent_session_pubkey ≠ 0`.
2. **Caller authorized.** The caller is the registered session key (validated via the agent-account session path) or the owner. Any other caller reverts.
3. **Cadence.** `now − last_cycle_at ≥ cadence`.
4. **Per payout:** Merkle membership against `payee_root`; `amount ≤ max_per_payee`; commitment recomputed and matched; `blinding ≠ 0`. Accumulate `Σ C_i`, `Σ amount`, `Σ blinding`.
5. **Per cycle:** `Σ amount ≤ max_per_cycle` and `Σ amount ≤ vault_balance`.
6. **Commitment consistency:** `C_total == Σamount · G + Σblinding · H`.
7. **Transfer** via the configured `IShieldedTransfer` adapter.
8. **Effects:** set `last_cycle_at = now`; write the ERC-8004 attestation; emit `CycleExecuted` + per-payee `PayoutCommitted` (amounts never in Chaum events).

The session key is callable on **exactly one** entrypoint. Every owner-only function rejects it. This is the core of bounded delegation: see the "what the agent cannot do" section of the [README](../README.md).

## Plain-language summary (shown before signing in the dashboard)

> The agent may pay only these **N** payees, at most **X** each and **Y** per cycle, no more often than every **Z**. It cannot withdraw, change the payee set, raise a cap, or pay anyone else. Revoke at any time.

This sentence is generated directly from the on-chain policy fields, so what the owner reads is exactly what the contract enforces.
