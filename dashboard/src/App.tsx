import { createContext, useContext, useState } from "react";
import type { AccountInterface } from "starknet";
import { CFG, explorerContract, short } from "./chain.ts";
import { connectWallet, disconnectWallet, isOwner } from "./wallet.ts";
import { Treasury } from "./pages/Treasury.tsx";
import { Policy } from "./pages/Policy.tsx";
import { Cycle } from "./pages/Cycle.tsx";
import { Disclosure } from "./pages/Disclosure.tsx";
import { Activity } from "./pages/Activity.tsx";

type View = "treasury" | "policy" | "cycle" | "disclosure" | "activity";
const NAV: { id: View; label: string }[] = [
  { id: "treasury", label: "Treasury" },
  { id: "policy", label: "Policy" },
  { id: "cycle", label: "Cycle" },
  { id: "disclosure", label: "Prove" },
  { id: "activity", label: "Activity" },
];

export interface WalletState {
  account: AccountInterface | null;
  address: string | null;
  owner: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}
const Ctx = createContext<WalletState>({
  account: null, address: null, owner: false,
  connect: async () => {}, disconnect: async () => {},
});
export const useWallet = () => useContext(Ctx);

function Logo() {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, fontFamily: "var(--serif)", fontWeight: 600, fontSize: 22, letterSpacing: "-0.02em" }}>
      chaum<span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--oxblood)", display: "inline-block" }} />
    </span>
  );
}

export function App() {
  const [view, setView] = useState<View>("treasury");
  const [account, setAccount] = useState<AccountInterface | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const connect = async () => {
    const c = await connectWallet();
    if (c) { setAccount(c.account); setAddress(c.address); }
  };
  const disconnect = async () => {
    await disconnectWallet();
    setAccount(null); setAddress(null);
  };

  const wallet: WalletState = { account, address, owner: isOwner(address), connect, disconnect };
  const Page = { treasury: Treasury, policy: Policy, cycle: Cycle, disclosure: Disclosure, activity: Activity }[view];

  return (
    <Ctx.Provider value={wallet}>
      <div style={{ display: "grid", gridTemplateColumns: "232px 1fr", minHeight: "100vh" }}>
        <aside style={{ borderRight: "1px solid var(--line)", padding: "22px 18px", display: "flex", flexDirection: "column", gap: 28, position: "sticky", top: 0, height: "100vh" }}>
          <Logo />
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV.map((n) => (
              <button key={n.id} onClick={() => setView(n.id)} data-nav={n.id}
                style={{
                  textAlign: "left", background: view === n.id ? "var(--graphite)" : "transparent",
                  border: "1px solid " + (view === n.id ? "var(--line-2)" : "transparent"),
                  color: view === n.id ? "var(--paper)" : "var(--muted)",
                  padding: "9px 12px", borderRadius: 6, fontSize: 14.5,
                  boxShadow: view === n.id ? "inset 0 -2px 0 var(--oxblood)" : "none",
                }}>
                {n.label}
              </button>
            ))}
          </nav>
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="pill ok" style={{ alignSelf: "flex-start" }}>● Sepolia · live</span>
            <a className="label" href={explorerContract(CFG.addresses.executor)} target="_blank" rel="noopener" style={{ textDecoration: "none" }}>
              executor {short(CFG.addresses.executor)} ↗
            </a>
            <span className="label">a XXIX Labs project</span>
          </div>
        </aside>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "1px solid var(--line)" }}>
            <span className="label">{NAV.find((n) => n.id === view)?.label}</span>
            {address ? (
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {wallet.owner && <span className="pill ok">owner</span>}
                <button className="btn ghost" onClick={disconnect}>{short(address)} · disconnect</button>
              </span>
            ) : (
              <button className="btn" onClick={connect}>Connect wallet</button>
            )}
          </header>
          <main style={{ padding: "28px 32px", maxWidth: 1040, width: "100%" }}>
            <Page />
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}
