import type { ReactNode } from "react";

export const fmt = (v: bigint | number) =>
  (typeof v === "bigint" ? v : BigInt(Math.round(v))).toLocaleString("en-US");

export function Loading({ what = "reading chain" }: { what?: string }) {
  return (
    <div className="label" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0" }}>
      <span className="spin" /> {what}…
    </div>
  );
}

export function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="card" style={{ borderColor: "rgba(214,84,62,0.4)" }}>
      <p className="label" style={{ color: "var(--oxblood-bright)" }}>chain read failed</p>
      <p className="mono" style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0", wordBreak: "break-word" }}>{msg}</p>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="figure" style={{ fontSize: 26, marginTop: 10, letterSpacing: "-0.01em" }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export function PageHead({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 24, maxWidth: 680 }}>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="serif" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.015em", margin: "10px 0 0" }}>{title}</h1>
      {desc && <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, margin: "12px 0 0" }}>{desc}</p>}
    </div>
  );
}

export function Grid({ children, min = 220 }: { children: ReactNode; min?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: 16 }}>
      {children}
    </div>
  );
}
