import { useState } from "react";
import { explorerTx } from "../chain.ts";

function parseRevert(e: any): string {
  const s = String(e?.message ?? e);
  const m =
    s.match(/CHAUM: [^'"\\)\n]+/) ||
    s.match(/Caller is not the owner/) ||
    s.match(/argent\/[a-z-]+/) ||
    s.match(/User (abort|rejected)[^"\n]*/i);
  return m ? m[0] : s.length > 160 ? s.slice(0, 160) + "…" : s;
}

export type TxStatus = "idle" | "pending" | "ok" | "err";

export function useTx() {
  const [status, setStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<string>) => {
    setStatus("pending"); setError(null); setTxHash(null);
    try {
      const h = await fn();
      setTxHash(h); setStatus("ok");
      return h;
    } catch (e) {
      setError(parseRevert(e)); setStatus("err");
      return null;
    }
  };
  return { status, txHash, error, run };
}

export function TxFeedback({ tx }: { tx: ReturnType<typeof useTx> }) {
  if (tx.status === "idle") return null;
  if (tx.status === "pending")
    return <span className="mono" style={{ fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 8 }}><span className="spin" /> submitting…</span>;
  if (tx.status === "ok" && tx.txHash)
    return <a className="mono tick" style={{ fontSize: 12 }} href={explorerTx(tx.txHash)} target="_blank" rel="noopener">✓ confirmed ↗</a>;
  if (tx.status === "err")
    return <span className="mono" style={{ fontSize: 12, color: "var(--oxblood-bright)", wordBreak: "break-word" }}>✗ {tx.error}</span>;
  return null;
}
