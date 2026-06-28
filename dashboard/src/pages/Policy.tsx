import { CFG, getPolicy, short } from "../chain.ts";
import { useAsync } from "../lib/useAsync.ts";
import { Loading, ErrorBox, PageHead, Grid, Stat, fmt } from "../components/ui.tsx";

export function Policy() {
  const q = useAsync(getPolicy, []);
  if (q.loading) return <Loading what="reading policy" />;
  if (q.error || !q.data) return <ErrorBox msg={q.error ?? "no data"} />;
  const p = q.data;
  const payees = CFG.demoCycle.payouts;

  return (
    <>
      <PageHead eyebrow="policy" title="The contract the agent is bound by"
        desc="Set by the owner, stored on-chain, re-validated on every cycle. The agent key can change none of this." />

      <Grid min={210}>
        <Stat label="max per payee" value={fmt(p.maxPerPayee)} />
        <Stat label="max per cycle" value={fmt(p.maxPerCycle)} />
        <Stat label="cadence" value={`${p.cadence}s`} />
        <Stat label="paused" value={p.paused ? "yes" : "no"} />
      </Grid>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="label">plain-language summary</div>
        <p style={{ fontSize: 16, lineHeight: 1.6, margin: "12px 0 0", maxWidth: 70 + "ch" }}>
          The agent may pay only the <strong>{payees.length}</strong> registered payees, at most{" "}
          <strong>{fmt(p.maxPerPayee)}</strong> each and <strong>{fmt(p.maxPerCycle)}</strong> per cycle,
          no more often than every <strong>{p.cadence.toString()}s</strong>. It cannot withdraw, change the
          payee set, raise a cap, or pay anyone else. Revoke any time.
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
    </>
  );
}
