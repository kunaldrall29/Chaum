import { useState } from "react";
import { CFG, getCycle, verifyAggregate, commitmentOf, getCycleEvents, short } from "../chain.ts";
import { opensTo } from "../lib/commitments.ts";
import { useAsync } from "../lib/useAsync.ts";
import { Loading, ErrorBox, PageHead, fmt } from "../components/ui.tsx";

type Tab = "public" | "auditor" | "payee";
const CAPTION: Record<Tab, string> = {
  public: "What anyone watching the chain sees — commitments only.",
  auditor: "Proves the total is correct — without revealing the split.",
  payee: "A payee proves their own amount, and no one else's — verified in your browser against the on-chain commitment.",
};

export function Disclosure() {
  const [tab, setTab] = useState<Tab>("public");
  const [sel, setSel] = useState(0);

  const q = useAsync(async () => {
    const events = await getCycleEvents();
    const cycleId = events.length ? events[0].cycleId : CFG.demoCycle.cycleId;
    const cycle = await getCycle(cycleId);
    const verified = cycle.exists ? await verifyAggregate(cycleId) : false;
    const commits = await Promise.all(
      CFG.demoCycle.payouts.map((p: any) => (cycle.exists ? commitmentOf(cycleId, p.payee) : Promise.resolve({ x: 0n, y: 0n }))),
    );
    return { cycleId, cycle, verified, commits };
  }, []);

  if (q.loading) return <Loading what="reading commitments" />;
  if (q.error || !q.data) return <ErrorBox msg={q.error ?? "no data"} />;
  const { cycle, verified, commits } = q.data;
  const payouts = CFG.demoCycle.payouts as any[];

  // Payee proof: recompute C = a*G + b*H in-browser, compare to the on-chain commitment.
  const chosen = payouts[sel];
  const chainC = commits[sel];
  const proofOk =
    cycle.exists && opensTo(chainC, BigInt(chosen.amount), BigInt(chosen.blinding));

  return (
    <>
      <PageHead eyebrow="selective disclosure" title="Same data. Three viewers."
        desc="One ledger, cryptographically different views — live against the Sepolia cycle." />

      <div style={{ display: "flex", gap: 4, padding: 4, border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--vault)", maxWidth: 460 }}>
        {(["public", "auditor", "payee"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "8px 12px", borderRadius: 4, fontSize: 14, textTransform: "capitalize",
            border: "1px solid " + (tab === t ? "var(--line-2)" : "transparent"),
            background: tab === t ? "var(--graphite)" : "transparent",
            color: tab === t ? "var(--paper)" : "var(--muted)",
            boxShadow: tab === t ? "inset 0 -2px 0 var(--oxblood)" : "none",
          }}>{t}</button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 14, margin: "14px 0 0" }}>{CAPTION[tab]}</p>

      <div className="card" style={{ marginTop: 16 }}>
        <table>
          <thead><tr>
            <th className="label" style={{ paddingBottom: 10 }}>payee</th>
            <th className="label" style={{ paddingBottom: 10 }}>amount</th>
          </tr></thead>
          <tbody>
            {payouts.map((p, i) => {
              const reveal = tab === "payee" && i === sel && proofOk;
              return (
                <tr key={p.payee} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="mono" style={{ padding: "13px 0" }}>{p.label ?? short(p.payee)}</td>
                  <td className="mono" style={{ padding: "13px 0" }}>
                    {reveal ? <span className="tick">{fmt(BigInt(p.amount))} ✓</span> : <span className="redaction" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line-2)" }}>
          <span className="label">cycle total</span>
          {tab === "auditor"
            ? <span className="mono" style={{ fontSize: 16 }}>{fmt(BigInt(CFG.demoCycle.total))}</span>
            : <span className="mono" style={{ fontSize: 14, color: "var(--muted)" }}>{short(cycle.totalCommitment.x)}</span>}
          {tab === "auditor" && (
            <span className={"pill " + (verified ? "ok" : "warn")} style={{ marginLeft: "auto" }}>
              {verified ? "✓ agg-proof: verified on-chain" : "unverified"}
            </span>
          )}
        </div>
      </div>

      {tab === "payee" && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="label">open your own commitment</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <select value={sel} onChange={(e) => setSel(Number(e.target.value))}
              style={{ background: "var(--vault)", color: "var(--paper)", border: "1px solid var(--line-2)", borderRadius: 5, padding: "9px 12px", fontFamily: "var(--mono)" }}>
              {payouts.map((p, i) => <option key={p.payee} value={i}>{p.label ?? short(p.payee)}</option>)}
            </select>
            <span className={"pill " + (proofOk ? "ok" : "warn")}>
              {proofOk ? "✓ commit(amount, blinding) == on-chain commitment" : "no match"}
            </span>
          </div>
          {proofOk && (
            <p className="mono" style={{ fontSize: 12.5, color: "var(--green)", marginTop: 14, wordBreak: "break-word" }}>
              income-proof · {chosen.label}: {fmt(BigInt(chosen.amount))} · commitment {short(chainC.x)}
            </p>
          )}
          <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 12 }}>
            recomputed in your browser from (amount, blinding) and checked against the executor's stored commitment — no other amount is revealed.
          </p>
        </div>
      )}
    </>
  );
}
