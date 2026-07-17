import { useState } from "react";
import { CFG, getPolicy, getVaultBalance, getCycle, verifyAggregate, getCycleEvents, deposit, withdraw, short } from "../chain.ts";
import { useAsync } from "../lib/useAsync.ts";
import { useWallet } from "../App.tsx";
import { useTx, TxFeedback } from "../components/actions.tsx";
import { Loading, ErrorBox, Stat, Grid, PageHead, fmt } from "../components/ui.tsx";

export function Treasury() {
  const wallet = useWallet();
  const [amount, setAmount] = useState("1000000");
  const depTx = useTx();
  const wdTx = useTx();

  const q = useAsync(async () => {
    const [policy, balance, events] = await Promise.all([getPolicy(), getVaultBalance(), getCycleEvents()]);
    const lastId = events.length ? events[0].cycleId : CFG.demoCycle.cycleId;
    const cycle = await getCycle(lastId);
    const verified = cycle.exists ? await verifyAggregate(lastId) : false;
    return { policy, balance, events, cycle, verified };
  }, []);

  if (q.loading) return <Loading what="reading treasury" />;
  if (q.error || !q.data) return <ErrorBox msg={q.error ?? "no data"} />;
  const { policy, balance, cycle, verified, events } = q.data;
  const amt = () => { try { return BigInt(amount || "0"); } catch { return 0n; } };

  return (
    <>
      <PageHead eyebrow="treasury" title="Vault & cycle status"
        desc="Live from Starknet Sepolia. Individual amounts stay private; balances, caps and the verified aggregate are public." />

      <Grid min={210}>
        <Stat label="vault balance" value={fmt(balance)} sub="base units · MockERC20" />
        <Stat label="per-cycle cap" value={fmt(policy.maxPerCycle)} />
        <Stat label="per-payee cap" value={fmt(policy.maxPerPayee)} />
        <Stat label="cadence" value={`${policy.cadence}s`} sub="min between cycles" />
        <Stat label="status" value={policy.paused ? "Paused" : "Active"} sub={policy.agent === 0n ? "agent revoked" : "agent registered"} />
        <Stat label="cycles run" value={fmt(events.length)} />
      </Grid>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
          <div className="label">last cycle · #{cycle.cycleId}</div>
          {cycle.exists ? <span className={"pill " + (verified ? "ok" : "warn")}>{verified ? "✓ aggregate verified on-chain" : "unverified"}</span> : <span className="pill">no cycle yet</span>}
        </div>
        {cycle.exists && (
          <div style={{ marginTop: 16, display: "flex", gap: 28, flexWrap: "wrap" }}>
            <div><div className="label">payees paid</div><div className="figure" style={{ fontSize: 22, marginTop: 6 }}>{cycle.payeeCount}</div></div>
            <div><div className="label">cycle-total commitment</div><div className="mono" style={{ fontSize: 13, marginTop: 6, color: "var(--muted)" }}>{short(cycle.totalCommitment.x)}</div></div>
          </div>
        )}
      </div>

      {/* Owner actions — real on-chain txs via the connected wallet */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="label">owner actions · fund / withdraw</div>
        {!wallet.address ? (
          <p className="muted" style={{ fontSize: 14, marginTop: 12 }}>Connect the owner wallet to deposit or withdraw.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} style={{ maxWidth: 220 }} inputMode="numeric" />
              <button className="btn" disabled={depTx.status === "pending" || amt() <= 0n}
                onClick={() => depTx.run(() => deposit(wallet.account!, amt())).then(() => q.reload())}>Deposit</button>
              <button className="btn ghost" disabled={wdTx.status === "pending" || amt() <= 0n}
                onClick={() => wdTx.run(() => withdraw(wallet.account!, amt())).then(() => q.reload())}>Withdraw</button>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 16 }}><TxFeedback tx={depTx} /><TxFeedback tx={wdTx} /></div>
            {!wallet.owner && <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 10 }}>connected wallet is not the owner — these will revert on-chain (owner-gated).</p>}
          </>
        )}
      </div>

      <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 18 }}>
        owner {short(CFG.owner)} · token {short(CFG.addresses.token)} · vault {short(CFG.addresses.vault)}
      </p>
    </>
  );
}
