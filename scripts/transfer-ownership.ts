// Transfer control of the deployed Sepolia contracts to NEW_OWNER (a user's
// wallet), so they can drive every owner/agent action from the console.
// From the deployer key: register the wallet as the agent, then transfer_ownership
// on the registry, vault, adapter, and executor.
//
// Env: RPC_URL, DEPLOYER_ADDRESS, DEPLOYER_PRIVATE_KEY, NEW_OWNER

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, Contract, RpcProvider, logger } from "starknet";
import { artifact } from "./src/artifacts.ts";

logger.setLogLevel("ERROR");
const req = (n: string) => {
  const v = process.env[n];
  if (!v) throw new Error(`missing env ${n}`);
  return v;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function retry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let d = 4000;
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (!/-32011|too fast|rate.?limit|429|limit exceeded/i.test(String(e)) || i >= 7) throw e;
      console.log(`  …${label} rate-limited, retry ${i} in ${Math.round(d / 1000)}s`);
      await sleep(d); d = Math.min(Math.round(d * 1.7), 25000);
    }
  }
}

async function main() {
  const dep = JSON.parse(readFileSync(resolve(import.meta.dirname, "deployments.sepolia.json"), "utf8"));
  const newOwner = req("NEW_OWNER");
  const provider = new RpcProvider({ nodeUrl: req("RPC_URL") });
  const account = new Account({ provider, address: req("DEPLOYER_ADDRESS"), signer: req("DEPLOYER_PRIVATE_KEY") });

  const c = (name: string, addr: string) =>
    new Contract({ abi: artifact(name).sierra.abi, address: addr, providerOrAccount: account });
  const registry = c("PayrollRegistry", dep.registry);
  const vault = c("DisbursementVault", dep.vault);
  const adapter = c("PublicTransferAdapter", dep.adapter);
  const executor = c("DisbursementExecutor", dep.executor);

  console.log(`transferring control to ${newOwner}…`);

  // Register the new owner's wallet as the agent (while we are still owner).
  const t0 = await retry("set_agent", () => account.execute([registry.populate("set_agent", [newOwner, newOwner])]));
  await retry("wait", () => provider.waitForTransaction(t0.transaction_hash, { retryInterval: 6000 }));
  console.log("  set_agent ✓");

  for (const [name, ct] of [["registry", registry], ["vault", vault], ["adapter", adapter], ["executor", executor]] as const) {
    const tx = await retry(`transfer ${name}`, () => account.execute([ct.populate("transfer_ownership", [newOwner])]));
    await retry("wait", () => provider.waitForTransaction(tx.transaction_hash, { retryInterval: 6000 }));
    console.log(`  ${name} ownership → ${newOwner} ✓`);
    await sleep(1000);
  }
  console.log("done — the new owner controls the registry, vault, adapter, and executor.");
}

main().catch((e) => { console.error(e); process.exit(1); });
