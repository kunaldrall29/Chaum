import { CFG, getCycle, verifyAggregate, commitmentOf, getCycleEvents, runCycle, explorerTx, short } from "../chain.ts";
import { useAsync } from "../lib/useAsync.ts";
import { useWallet } from "../App.tsx";
import { useTx, TxFeedback } from "../components/actions.tsx";
import { Loading, ErrorBox, PageHead, fmt } from "../components/ui.tsx";

const STREAM_LABEL: Record<string, string> = { payroll: "Payroll", vendor: "Vendor", grant: "Grant" };

export function Cycle() {
  const wallet = useWallet();
  const runTx = useTx();
  const q = useAsync(async () => {
    const events = await getCycleEvents();
    const cycleId = events.length ? events[0].cycleId : CFG.demoCycle.cycleId;
    const cycle = await getCycle(cycleId);
    const verified = cycle.exists ? await verifyAggregate(cycleId) : false;
    const rows = await Promise.all(
      (CFG.demoCycle.payouts as any[]).map(async (p) => ({
        label: p.label ?? "payee",
        payee: p.payee,
        stream: p.stream as string,
        denied: !!p.denied,
        commitment: cycle.exists && !p.denied ? await commitmentOf(cycleId, p.payee) : { x: 0n, y: 0n },
      })),
    );
    const tx = events.find((e) => e.cycleId === cycleId)?.txHash ?? CFG.demoCycle.txHash;
    return { cycleId, cycle, verified, rows, tx };
  }, []);

  if (q.loading) return <Loading what="reading cycle" />;
  if (q.error || !q.data) return <ErrorBox msg={q.error ?? "no data"} />;
  const { cycleId, cycle, verified, rows, tx } = q.data;
  const streamTotals = (CFG.demoCycle as any).streamTotals as Record<string, string>;

  let n = 0;
  return (
    <>
      <PageHead eyebrow={`cycle #${cycleId}`} title="Disbursement — amounts redacted"
        desc="Every per-payee amount is a commitment on-chain, grouped by stream. The split is hidden; the aggregate and each category subtotal are legible and provable." />

      {/* Run a fresh cycle — real execute_cycle tx (agent/owner) */}
      <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="label">run a cycle</div>
          <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", margin: "6px 0 0" }}>
            builds fresh commitments + (payee, stream) Merkle proofs in-browser, then calls execute_cycle. The contract re-validates streams, caps, window, membership, KYT, and the homomorphic sum.
          </p>
        </div>
        {wallet.address ? (
          <button className="btn" disabled={runTx.status === "pending"}
            onClick={() => runTx.run(async () => (await runCycle(wallet.account!)).txHash).then(() => q.reload())}>
            {runTx.status === "pending" ? "running…" : "Run new cycle"}
          </button>
        ) : (
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>connect wallet to run</span>
        )}
        <div style={{ flexBasis: "100%" }}><TxFeedback tx={runTx} /></div>
      </div>

      {!cycle.exists ? (
        <div className="card"><span className="pill">no cycle executed yet</span></div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th className="label" style={{ paddingBottom: 12, width: 32 }}>#</th>
                <th className="label" style={{ paddingBottom: 12 }}>payee</th>
                <th className="label" style={{ paddingBottom: 12 }}>amount</th>
                <th className="label" style={{ paddingBottom: 12 }}>commitment (x)</th>
              </tr>
            </thead>
            <tbody>
              {CFG.streams.flatMap((stream) => {
                const group = rows.filter((r) => r.stream === stream);
                if (!group.length) return [];
                const out = [
                  <tr key={"h-" + stream} style={{ borderTop: "1px solid var(--line-2)" }}>
                    <td />
                    <td className="label" style={{ padding: "14px 0 8px", color: "var(--paper)" }}>{STREAM_LABEL[stream] ?? stream}</td>
                    <td colSpan={2} style={{ padding: "14px 0 8px" }}>
                      <span className="pill" title="per-stream subtotal (provable by a stakeholder)">
                        subtotal {fmt(BigInt(streamTotals[stream] ?? "0"))} · redacted
                      </span>
                    </td>
                  </tr>,
                ];
                for (const r of group) {
                  n += 1;
                  out.push(
                    <tr key={r.payee} style={{ borderTop: "1px solid var(--line)" }}>
                      <td className="mono" style={{ padding: "14px 0", color: "var(--muted-2)" }}>{String(n).padStart(2, "0")}</td>
                      <td className="mono" style={{ padding: "14px 0" }}>{r.label}<br /><span style={{ color: "var(--muted-2)", fontSize: 11 }}>{short(r.payee)}</span></td>
                      <td style={{ padding: "14px 0" }}>
                        {r.denied
                          ? <span className="pill warn" title="failed the KYT screen — skipped and logged, never paid">KYT denied · skipped</span>
                          : <span className="redaction" title="hidden by Pedersen commitment" />}
                      </td>
                      <td className="mono" style={{ padding: "14px 0", color: "var(--muted)", fontSize: 12 }}>
                        {r.denied ? "—" : short(r.commitment.x)}
                      </td>
                    </tr>,
                  );
                }
                return out;
              })}
            </tbody>
          </table>

          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14, marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line-2)" }}>
            <span className="label">cycle-total commitment</span>
            <span className="mono" style={{ fontSize: 15 }}>{short(cycle.totalCommitment.x)}</span>
            <span className={"pill " + (verified ? "ok" : "warn")} style={{ marginLeft: "auto" }}>
              {verified ? "✓ Σ commitments = total (verified on-chain)" : "unverified"}
            </span>
          </div>
        </div>
      )}

      {tx && (
        <p className="mono" style={{ fontSize: 12, marginTop: 16 }}>
          <a href={explorerTx(tx)} target="_blank" rel="noopener" style={{ color: "var(--oxblood-bright)" }}>
            view execute_cycle tx on Voyager ↗
          </a>
        </p>
      )}
    </>
  );
}
