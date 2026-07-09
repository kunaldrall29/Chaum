# Policy Model

The policy is the contract between the organization's owner and the agent. It is set by the owner, stored on-chain in `PayrollRegistry`, and **re-validated on every cycle** by `DisbursementExecutor`. The agent cannot change it; a compromised agent key is bounded entirely by it.

## The `Policy` object

```cairo
struct Policy {
    owner: ContractAddress,             // sole mutator (OZ Ownable)
    payee_root: felt252,                // Merkle root over (payee, stream) leaves
    max_per_payee: u256,                // cap on any single payout
    max_per_cycle: u256,                // cap on the sum of a cycle
    cadence: u64,                       // min seconds between cycles
    exec_window: u64,                   // jitter room: cycle lands in [due, due+window]
    last_cycle_at: u64,                 // timestamp of the last executed cycle
    paused: bool,                       // owner kill-switch
    agent: ContractAddress,             // the registered agent account; 0 == revoked
    agent_session_pubkey: felt252,      // the scoped session key (record)
    anomaly_payee_delta_bps: u16,       // agent halt threshold: payee-set shift
    anomaly_total_delta_bps: u16,       // agent halt threshold: total shift
}
```

**Streams.** Every payout carries a `Stream` (`Payroll` / `Vendor` / `Grant`), and the payee set is committed over `(payee, stream)` leaves — so membership binds a payee to the stream it was approved under, and per-stream subtotals power the Stakeholder category-disclosure scope.

**Roles.** The registry maps addresses → `Role` (`Owner` / `Operator` / `Auditor` / `Payee` / `Stakeholder`), read by the executor to gate disclosure scopes (the owner is always Owner-role).

## Owner operations (owner-only, event-emitting)

| Function | Effect | Invariants at write time |
| --- | --- | --- |
| `create_policy(...)` | Initialize the policy | caps nonzero; `max_per_payee ≤ max_per_cycle`; one-time |
| `update_policy(...)` | Change caps / cadence | same cap invariants |
| `set_execution(window, payee_bps, total_bps)` | Jitter window + anomaly thresholds | `exec_window < cadence` |
| `update_payees(new_root)` | Replace the payee set | root ≠ 0 |
| `set_role(account, role)` | Assign a disclosure role | — |
| `set_agent(agent, pubkey)` / `revoke()` | Register / zero the agent | — |
| `pause()` / `unpause()` | Kill-switch | — |

The payee set is a **Merkle root**, not an on-chain list: membership is proven per payout at disbursement (`leaf = Poseidon(payee, stream)`), keeping payee management O(1) and the set off public storage.

## Agent operation (the only one)

`execute_cycle(cycle_id, payouts[])`, callable by the registered agent account **or** the owner. Each `payout = (payee, stream, amount, blinding, commitment, merkle_proof)`. On call the contract independently:

1. **State.** Not paused, not revoked.
2. **Caller.** `caller == agent || caller == owner`; else revert.
3. **Cadence + window.** `now ≥ last_cycle_at + cadence`, and once a first cycle has run, `now ≤ due + exec_window` (jitter room; a late/out-of-window submission reverts).
4. **Per payout:** Merkle membership on `(payee, stream)`; `amount ≤ max_per_payee`; commitment recomputed and matched; `blinding ≠ 0`; **KYT screen** (denied → skip-and-log, or revert-cycle per the compliance flag). Accumulate grand totals **and per-stream subtotals**.
5. **Per cycle:** `Σ amount ≤ max_per_cycle` and `≤ vault balance`.
6. **Consistency:** `C_total == commit(Σamount, Σblinding)`, and each stream subtotal commitment is consistent.
7. **Transfer** via the `IShieldedTransfer` adapter (public ERC-20 now; STRK20 at T2).
8. **Effects:** `last_cycle_at = now`; optional ERC-8004 attestation; emit `CycleExecuted` (+ per-payout `PayoutCommitted`, `PayoutDenied`) — amounts never in Chaum's events.

The session key is callable on **exactly one** entrypoint; every owner-only function rejects it. See the "what the agent cannot do" section of the [README](../README.md) and [PRIVACY_THREAT_MODEL.md](PRIVACY_THREAT_MODEL.md).

## Agent-side privacy defenses (off-chain, policy-driven)

- **Jitter:** the agent picks a deterministic-but-random-looking execution time inside `exec_window` (seeded by `cycle_id`, so it survives restarts) — the on-chain window check enforces the bound.
- **Anomaly halt:** before submitting, if the payee set **and** the cycle total both shift beyond `anomaly_*_delta_bps`, the agent refuses and requires owner acknowledgement.

## Plain-language summary (shown before signing)

> The agent may pay only these **N** payees (across payroll / vendor / grant), at most **X** each and **Y** per cycle, no more often than every **Z**, at a random moment inside a **W**-window. It cannot withdraw, change the payee set, raise a cap, or pay anyone else. Revoke any time.

Generated directly from the on-chain policy fields — what the owner reads is exactly what the contract enforces.
