import { CFG, getPolicy, setPaused, revokeAgent, short } from "../chain.ts";
import { useAsync } from "../lib/useAsync.ts";
import { useWallet } from "../App.tsx";
import { useTx, TxFeedback } from "../components/actions.tsx";
import { Loading, ErrorBox, PageHead, Grid, Stat, fmt } from "../components/ui.tsx";

export function Policy() {
  const wallet = useWallet();
  const pauseTx = useTx();
  const revokeTx = useTx();
  const q = useAsync(getPolicy, []);
  if (q.loading) return <Loading what="reading policy" />;
  if (q.error || !q.data) return <ErrorBox msg={q.error ?? "no data"} />;
  const p = q.data;
  const payees = CFG.demoCycle.payouts;

  return (
    <>
      <PageHead eyebrow="policy" title="The contract the agent is bound by"
        desc="Set by the owner, stored on-chain, re-validated on every cycle. The agent key can change none of this." />

      <Grid min={200}>
        <Stat label="max per payee" value={fmt(p.maxPerPayee)} />
        <Stat label="max per cycle" value={fmt(p.maxPerCycle)} />
        <Stat label="cadence" value={`${p.cadence}s`} sub="min between cycles" />
        <Stat label="exec window" value={`${p.execWindow}s`} sub="jitter room after due" />
        <Stat label="anomaly halt" value={`${p.anomalyPayeeBps / 100}% / ${p.anomalyTotalBps / 100}%`} sub="payee-set / total shift" />
        <Stat label="paused" value={p.paused ? "yes" : "no"} />
      </Grid>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="label">plain-language summary</div>
        <p style={{ fontSize: 16, lineHeight: 1.6, margin: "12px 0 0", maxWidth: 70 + "ch" }}>
          The agent may pay only the <strong>{payees.length}</strong> registered payees (across payroll /
          vendor / grant), at most <strong>{fmt(p.maxPerPayee)}</strong> each and{" "}
          <strong>{fmt(p.maxPerCycle)}</strong> per cycle, no more often than every{" "}
          <strong>{p.cadence.toString()}s</strong>, at a random moment inside a{" "}
          <strong>{p.execWindow.toString()}s</strong> window. Denied payees are screened out by KYT. It cannot
          withdraw, change the payee set, raise a cap, or pay anyone else. Revoke any time.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="label">roles &amp; compliance</div>
        <table style={{ marginTop: 12 }}>
          <tbody>
            <tr style={{ borderTop: "1px solid var(--line)" }}>
              <td className="mono" style={{ padding: "10px 0", color: "var(--muted)" }}>auditor</td>
              <td className="mono" style={{ padding: "10px 0" }}>{short(CFG.roles.auditor)}<span className="pill ok" style={{ marginLeft: 10 }}>verify_aggregate</span></td>
            </tr>
            <tr style={{ borderTop: "1px solid var(--line)" }}>
              <td className="mono" style={{ padding: "10px 0", color: "var(--muted)" }}>stakeholder</td>
              <td className="mono" style={{ padding: "10px 0" }}>{short(CFG.roles.stakeholder)}<span className="pill ok" style={{ marginLeft: 10 }}>verify_stream_aggregate</span></td>
            </tr>
            <tr style={{ borderTop: "1px solid var(--line)" }}>
              <td className="mono" style={{ padding: "10px 0", color: "var(--muted)" }}>payee</td>
              <td className="mono" style={{ padding: "10px 0" }}>{short(CFG.roles.payee)}<span className="pill ok" style={{ marginLeft: 10 }}>open_own</span></td>
            </tr>
            <tr style={{ borderTop: "1px solid var(--line)" }}>
              <td className="mono" style={{ padding: "10px 0", color: "var(--muted)" }}>KYT denied</td>
              <td className="mono" style={{ padding: "10px 0" }}>{short(CFG.denied)}<span className="pill warn" style={{ marginLeft: 10 }}>skip &amp; log</span></td>
            </tr>
          </tbody>
        </table>
        <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 12 }}>
          disclosure scopes are enforced on-chain by the role registry (get_role); the KYT gate screens each payee before it settles.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="label">payee set · Merkle root</div>
          <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{short(p.payeeRoot)}</div>
        </div>
        <table style={{ marginTop: 14 }}>
          <thead>
            <tr><th className="label" style={{ paddingBottom: 8 }}>#</th>
              <th className="label" style={{ paddingBottom: 8 }}>payee</th>
              <th className="label" style={{ paddingBottom: 8 }}>address</th></tr>
          </thead>
          <tbody>
            {payees.map((pe: any, i: number) => (
              <tr key={pe.payee} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="mono" style={{ padding: "11px 0", color: "var(--muted-2)", width: 32 }}>{String(i + 1).padStart(2, "0")}</td>
                <td className="mono" style={{ padding: "11px 0" }}>{pe.label ?? "payee"}</td>
                <td className="mono" style={{ padding: "11px 0", color: "var(--muted)" }}>{short(pe.payee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 12 }}>
          membership is proven on-chain per payout against the root — the set itself is not stored on-chain.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="label">registered agent</div>
        <div className="mono" style={{ fontSize: 13, marginTop: 8 }}>
          {p.agent === 0n ? <span style={{ color: "var(--oxblood-bright)" }}>revoked</span> : short(p.agent)}
        </div>
        <div className="label" style={{ marginTop: 12 }}>session pubkey</div>
        <div className="mono" style={{ fontSize: 13, marginTop: 8, color: "var(--muted)" }}>{short(p.agentSessionPubkey)}</div>
      </div>

      {/* Owner controls — real on-chain txs */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="label">owner controls</div>
        {!wallet.address ? (
          <p className="muted" style={{ fontSize: 14, marginTop: 12 }}>Connect the owner wallet to pause or revoke.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn ghost" disabled={pauseTx.status === "pending"}
                onClick={() => pauseTx.run(() => setPaused(wallet.account!, !p.paused)).then(() => q.reload())}>
                {p.paused ? "Unpause" : "Pause"}
              </button>
              <button className="btn ghost" disabled={revokeTx.status === "pending" || p.agent === 0n}
                onClick={() => revokeTx.run(() => revokeAgent(wallet.account!)).then(() => q.reload())}>
                Revoke agent
              </button>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 16 }}><TxFeedback tx={pauseTx} /><TxFeedback tx={revokeTx} /></div>
            {!wallet.owner && <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 10 }}>connected wallet is not the owner — these will revert (owner-gated).</p>}
          </>
        )}
      </div>
    </>
  );
}
