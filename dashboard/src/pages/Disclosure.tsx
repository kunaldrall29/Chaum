import { useState } from "react";
import {
  CFG, getCycle, verifyAggregate, commitmentOf, streamCommitment,
  verifyStreamAggregate, openOwn, getRole, getCycleEvents, short,
} from "../chain.ts";
import { opensTo } from "../lib/commitments.ts";
import { downloadAuditPacket } from "../lib/packet.ts";
import { useAsync } from "../lib/useAsync.ts";
import { useWallet } from "../App.tsx";
import { useTx, TxFeedback } from "../components/actions.tsx";
import { Loading, ErrorBox, PageHead, fmt } from "../components/ui.tsx";

const hx = (b: bigint) => "0x" + b.toString(16);

type Tab = "public" | "auditor" | "stakeholder" | "payee";
const TABS: Tab[] = ["public", "auditor", "stakeholder", "payee"];
const CAPTION: Record<Tab, string> = {
  public: "What anyone watching the chain sees — commitments only, no amounts.",
  auditor: "An auditor proves the cycle total is correct — without seeing the split. A free on-chain read.",
  stakeholder: "A stakeholder proves one category's subtotal, and only that one. Role-gated: the on-chain check reverts for anyone who isn't a stakeholder.",
  payee: "A payee opens their own line, and no one else's — recomputed in your browser and provable on-chain.",
};
const STREAM_LABEL: Record<string, string> = { payroll: "Payroll", vendor: "Vendor", grant: "Grant" };

export function Disclosure() {
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("public");
  const [stream, setStream] = useState<string>("grant");
  const [sel, setSel] = useState(0);
  const streamTx = useTx();
  const payeeTx = useTx();

  const q = useAsync(async () => {
    const events = await getCycleEvents();
    const cycleId = events.length ? events[0].cycleId : CFG.demoCycle.cycleId;
    const cycle = await getCycle(cycleId);
    const verified = cycle.exists ? await verifyAggregate(cycleId) : false;
    const commits = await Promise.all(
      (CFG.demoCycle.payouts as any[]).map((p) =>
        cycle.exists && !p.denied ? commitmentOf(cycleId, p.payee) : Promise.resolve({ x: 0n, y: 0n })),
    );
    const streamCommits: Record<string, { x: bigint; y: bigint }> = {};
    if (cycle.exists) for (const s of CFG.streams) streamCommits[s] = await streamCommitment(cycleId, s as any);
    return { cycleId, cycle, verified, commits, streamCommits };
  }, []);

  // Connected wallet's on-chain role (drives the "why did it revert" messaging).
  const roleQ = useAsync(async () => (wallet.address ? getRole(wallet.address) : null), [wallet.address]);

  if (q.loading) return <Loading what="reading commitments" />;
  if (q.error || !q.data) return <ErrorBox msg={q.error ?? "no data"} />;
  const { cycleId, cycle, verified, commits, streamCommits } = q.data;
  const payouts = CFG.demoCycle.payouts as any[];
  const streamTotals = (CFG.demoCycle as any).streamTotals as Record<string, string>;

  const paidPayouts = payouts.map((p, i) => ({ ...p, i })).filter((p) => !p.denied);
  const chosen = paidPayouts[Math.min(sel, paidPayouts.length - 1)] ?? paidPayouts[0];
  const chainC = commits[chosen.i];
  const proofOk = cycle.exists && opensTo(chainC, BigInt(chosen.amount), BigInt(chosen.blinding));
  const role = roleQ.data;

  return (
    <>
      <PageHead eyebrow="prove — role-scoped disclosure" title="Same ledger. The right proof for each party."
        desc="One set of commitments, cryptographically different views — live against the Sepolia cycle. Who sees what is enforced on-chain by the role registry." />

      {wallet.address && (
        <p className="mono" style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 14px" }}>
          your address {short(wallet.address)} · on-chain role{" "}
          <span className={"pill " + (role && role !== "None" ? "ok" : "warn")}>{roleQ.loading ? "…" : role ?? "None"}</span>
        </p>
      )}

      <div style={{ display: "flex", gap: 4, padding: 4, border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--vault)", maxWidth: 560 }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "8px 12px", borderRadius: 4, fontSize: 13.5, textTransform: "capitalize",
            border: "1px solid " + (tab === t ? "var(--line-2)" : "transparent"),
            background: tab === t ? "var(--graphite)" : "transparent",
            color: tab === t ? "var(--paper)" : "var(--muted)",
            boxShadow: tab === t ? "inset 0 -2px 0 var(--oxblood)" : "none",
          }}>{t}</button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 14, margin: "14px 0 0" }}>{CAPTION[tab]}</p>

      {/* ---- ledger table (redacted; per-line reveal only in payee view) ---- */}
      <div className="card" style={{ marginTop: 16 }}>
        <table>
          <thead><tr>
            <th className="label" style={{ paddingBottom: 10 }}>payee</th>
            <th className="label" style={{ paddingBottom: 10 }}>stream</th>
            <th className="label" style={{ paddingBottom: 10 }}>amount</th>
          </tr></thead>
          <tbody>
            {payouts.map((p, i) => {
              const reveal = tab === "payee" && !p.denied && i === chosen.i && proofOk;
              return (
                <tr key={p.payee} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="mono" style={{ padding: "12px 0" }}>{p.label ?? short(p.payee)}</td>
                  <td className="mono" style={{ padding: "12px 0", color: "var(--muted)", fontSize: 12.5 }}>{STREAM_LABEL[p.stream] ?? p.stream}</td>
                  <td className="mono" style={{ padding: "12px 0" }}>
                    {p.denied
                      ? <span className="pill warn">KYT denied</span>
                      : reveal
                        ? <span className="tick">{fmt(BigInt(p.amount))} ✓</span>
                        : <span className="redaction" />}
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
              {verified ? "✓ verify_aggregate = true (on-chain)" : "unverified"}
            </span>
          )}
        </div>
      </div>

      {/* ---- stakeholder: per-category proof ---- */}
      {tab === "stakeholder" && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="label">prove a category subtotal</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <select value={stream} onChange={(e) => setStream(e.target.value)}
              style={{ background: "var(--vault)", color: "var(--paper)", border: "1px solid var(--line-2)", borderRadius: 5, padding: "9px 12px", fontFamily: "var(--mono)" }}>
              {CFG.streams.map((s) => <option key={s} value={s}>{STREAM_LABEL[s] ?? s}</option>)}
            </select>
            <span className="mono" style={{ fontSize: 15 }}>{fmt(BigInt(streamTotals[stream] ?? "0"))}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
              subtotal commitment {short(streamCommits[stream]?.x ?? 0n)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            {wallet.address ? (
              <button className="btn" disabled={streamTx.status === "pending"}
                onClick={() => streamTx.run(() => verifyStreamAggregate(wallet.account!, cycleId, stream as any))}>
                {streamTx.status === "pending" ? "proving…" : "Verify on-chain (stakeholder)"}
              </button>
            ) : <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>connect a stakeholder wallet to prove</span>}
            <TxFeedback tx={streamTx} />
          </div>
          <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 12 }}>
            verify_stream_aggregate is gated on the caller's role — an Owner / Operator / Auditor / Stakeholder passes; a bare address (or a Payee) reverts <span style={{ color: "var(--oxblood-bright)" }}>CHAUM: role not permitted</span>. That revert is the isolation working.
          </p>
        </div>
      )}

      {/* ---- payee: open your own ---- */}
      {tab === "payee" && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="label">open your own commitment</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <select value={sel} onChange={(e) => setSel(Number(e.target.value))}
              style={{ background: "var(--vault)", color: "var(--paper)", border: "1px solid var(--line-2)", borderRadius: 5, padding: "9px 12px", fontFamily: "var(--mono)" }}>
              {paidPayouts.map((p, i) => <option key={p.payee} value={i}>{p.label ?? short(p.payee)}</option>)}
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
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            {wallet.address ? (
              <button className="btn ghost" disabled={payeeTx.status === "pending"}
                onClick={() => payeeTx.run(() => openOwn(wallet.account!, cycleId, chosen.payee, BigInt(chosen.amount), BigInt(chosen.blinding)))}>
                {payeeTx.status === "pending" ? "proving…" : "Prove on-chain (open_own)"}
              </button>
            ) : null}
            <TxFeedback tx={payeeTx} />
          </div>
          <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 12 }}>
            recomputed in your browser from (amount, blinding) and checked against the executor's stored commitment. open_own is caller-gated to the payee's own address — no other line is ever revealed.
          </p>
        </div>
      )}

      {/* ---- audit packet export (accountant-filable, no opening secrets) ---- */}
      <div className="card" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="label">audit packet</div>
          <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", margin: "6px 0 0" }}>
            a filable .zip — cycle.csv (commitments + stream), proof-bundle.json (totals + on-chain verify calls), README. No amounts, no opening secrets.
          </p>
        </div>
        <button className="btn ghost" onClick={() => downloadAuditPacket({
          cycleId,
          txHash: CFG.demoCycle.txHash,
          executor: CFG.addresses.executor,
          rpc: CFG.rpcUrl,
          totalCommitment: { x: hx(cycle.totalCommitment.x), y: hx(cycle.totalCommitment.y) },
          streamTotals: CFG.streams.filter((s) => streamCommits[s]).map((s) => ({
            stream: s, commitment: { x: hx(streamCommits[s].x), y: hx(streamCommits[s].y) },
          })),
          payouts: payouts.map((p, i) => ({
            label: p.label, payee: p.payee, stream: p.stream, denied: !!p.denied,
            commitment: p.denied ? { x: "0x0", y: "0x0" } : { x: hx(commits[i].x), y: hx(commits[i].y) },
          })),
        })}>Download audit packet ↓</button>
      </div>

      <p className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 16 }}>
        seeded demo roles — auditor {short(CFG.roles.auditor)} · stakeholder {short(CFG.roles.stakeholder)} · payee {short(CFG.roles.payee)}. On-chain role-gated proofs succeed from a matching-role account (the owner also qualifies).
      </p>
    </>
  );
}
