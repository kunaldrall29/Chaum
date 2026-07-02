import { CFG, getCycle, verifyAggregate, commitmentOf, getCycleEvents, runCycle, explorerTx, short } from "../chain.ts";
import { useAsync } from "../lib/useAsync.ts";
import { useWallet } from "../App.tsx";
import { useTx, TxFeedback } from "../components/actions.tsx";
import { Loading, ErrorBox, PageHead } from "../components/ui.tsx";

export function Cycle() {
  const wallet = useWallet();
  const runTx = useTx();
  const q = useAsync(async () => {
    const events = await getCycleEvents();
    const cycleId = events.length ? events[0].cycleId : CFG.demoCycle.cycleId;
    const cycle = await getCycle(cycleId);
    const verified = cycle.exists ? await verifyAggregate(cycleId) : false;
    const rows = await Promise.all(
      CFG.demoCycle.payouts.map(async (p: any) => ({
        label: p.label ?? "payee",
        payee: p.payee,
        commitment: cycle.exists ? await commitmentOf(cycleId, p.payee) : { x: 0n, y: 0n },
      })),
    );
    const tx = events.find((e) => e.cycleId === cycleId)?.txHash ?? CFG.demoCycle.txHash;
    return { cycleId, cycle, verified, rows, tx };
  }, []);

  if (q.loading) return <Loading what="reading cycle" />;
  if (q.error || !q.data) return <ErrorBox msg={q.error ?? "no data"} />;
  const { cycleId, cycle, verified, rows, tx } = q.data;

  return (
    <>
      <PageHead eyebrow={`cycle #${cycleId}`} title="Disbursement — amounts redacted"
        desc="Every per-payee amount is a commitment on-chain. The split is hidden; the aggregate is legible and verified." />

      {/* Run a fresh cycle — real execute_cycle tx (agent/owner) */}
      <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="label">run a cycle</div>
          <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", margin: "6px 0 0" }}>
            builds fresh commitments + Merkle proofs in-browser, then calls execute_cycle. The contract re-validates everything.
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
              {rows.map((r, i) => (
                <tr key={r.payee} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="mono" style={{ padding: "14px 0", color: "var(--muted-2)" }}>{String(i + 1).padStart(2, "0")}</td>
                  <td className="mono" style={{ padding: "14px 0" }}>{r.label}<br /><span style={{ color: "var(--muted-2)", fontSize: 11 }}>{short(r.payee)}</span></td>
                  <td style={{ padding: "14px 0" }}><span className="redaction" title="hidden by Pedersen commitment" /></td>
                  <td className="mono" style={{ padding: "14px 0", color: "var(--muted)", fontSize: 12 }}>{short(r.commitment.x)}</td>
                </tr>
              ))}
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
