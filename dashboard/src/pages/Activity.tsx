import { getCycleEvents, explorerTx, CFG, short } from "../chain.ts";
import { useAsync } from "../lib/useAsync.ts";
import { Loading, ErrorBox, PageHead } from "../components/ui.tsx";

export function Activity() {
  const q = useAsync(getCycleEvents, []);
  if (q.loading) return <Loading what="reading events" />;
  if (q.error || !q.data) return <ErrorBox msg={q.error ?? "no data"} />;
  const events = q.data;

  return (
    <>
      <PageHead eyebrow="activity" title="Cycle history"
        desc="CycleExecuted events read directly from the executor on Sepolia." />

      {events.length === 0 ? (
        <div className="card"><span className="pill">no cycles executed yet</span></div>
      ) : (
        <div className="card">
          <table>
            <thead><tr>
              <th className="label" style={{ paddingBottom: 12 }}>cycle</th>
              <th className="label" style={{ paddingBottom: 12 }}>payees</th>
              <th className="label" style={{ paddingBottom: 12 }}>block</th>
              <th className="label" style={{ paddingBottom: 12 }}>tx</th>
            </tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.txHash} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="mono" style={{ padding: "13px 0" }}>#{e.cycleId}</td>
                  <td className="mono" style={{ padding: "13px 0" }}>{e.payeeCount}</td>
                  <td className="mono" style={{ padding: "13px 0", color: "var(--muted)" }}>{e.blockNumber || "—"}</td>
                  <td className="mono" style={{ padding: "13px 0" }}>
                    <a href={explorerTx(e.txHash)} target="_blank" rel="noopener" style={{ color: "var(--oxblood-bright)" }}>
                      {short(e.txHash)} ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 16 }}>
        ERC-8004 attestation: optional per cycle (disabled in this deployment) · executor {short(CFG.addresses.executor)}
      </p>
    </>
  );
}
