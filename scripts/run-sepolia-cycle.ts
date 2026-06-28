// Run ONE real disbursement cycle against the deployed Sepolia contracts, so the
// dashboard has live data. Saves the cycle plan (incl. blindings) to
// sepolia-cycle.json for the disclosure demo. Env: RPC_URL, DEPLOYER_ADDRESS,
// DEPLOYER_PRIVATE_KEY, CYCLE_ID (default 1).

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, Contract, RpcProvider, logger } from "starknet";
import { artifact } from "./src/artifacts.ts";
import { loadPayroll } from "@chaum/agent/payroll";
import { buildCyclePlan } from "@chaum/agent/engine";

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
    try {
      return await fn();
    } catch (e) {
      if (!/-32011|too fast|rate.?limit|429|limit exceeded/i.test(String(e)) || i >= 7) throw e;
      console.log(`  …${label} rate-limited, retry ${i} in ${Math.round(d / 1000)}s`);
      await sleep(d);
      d = Math.min(Math.round(d * 1.7), 25000);
    }
  }
}

async function main() {
  const dep = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "deployments.sepolia.json"), "utf8"),
  );
  const provider = new RpcProvider({ nodeUrl: req("RPC_URL") });
  const account = new Account({
    provider,
    address: req("DEPLOYER_ADDRESS"),
    signer: req("DEPLOYER_PRIVATE_KEY"),
  });
  const cycleId = Number(process.env.CYCLE_ID ?? "1");

  const payees = loadPayroll(resolve(import.meta.dirname, "../agent/payroll.example.json"));
  const plan = buildCyclePlan(payees, 1_000_000n);

  const exec = new Contract({
    abi: artifact("DisbursementExecutor").sierra.abi,
    address: dep.executor,
    providerOrAccount: account,
  });
  const read = new Contract({
    abi: artifact("DisbursementExecutor").sierra.abi,
    address: dep.executor,
    providerOrAccount: provider,
  });

  const payouts = plan.payouts.map((p) => ({
    payee: p.payee,
    amount: p.amount,
    blinding: p.blinding,
    commitment: { x: p.commitment.x, y: p.commitment.y },
    merkle_proof: p.proof,
  }));

  console.log(`running cycle ${cycleId} (${payouts.length} payees, total ${plan.totalAmount})…`);
  const tx = await retry("execute_cycle", () =>
    account.execute([exec.populate("execute_cycle", [cycleId, payouts])]),
  );
  console.log("  tx", tx.transaction_hash);
  await retry("wait", () => provider.waitForTransaction(tx.transaction_hash, { retryInterval: 6000 }));

  const verified = Boolean(await retry("verify", () => read.call("verify_aggregate", [cycleId])));
  console.log("  verify_aggregate:", verified);

  // Save the plan (incl. blindings) for the disclosure demo — testnet demo data.
  const out = {
    cycleId,
    txHash: tx.transaction_hash,
    total: plan.totalAmount.toString(),
    payeeRoot: "0x" + plan.payeeRoot.toString(16),
    payouts: plan.payouts.map((p, i) => ({
      label: payees[i].label ?? null,
      payee: p.payee,
      amount: p.amount.toString(),
      blinding: p.blinding.toString(),
      commitment: { x: "0x" + p.commitment.x.toString(16), y: "0x" + p.commitment.y.toString(16) },
    })),
  };
  writeFileSync(resolve(import.meta.dirname, "sepolia-cycle.json"), JSON.stringify(out, null, 2));
  console.log("  wrote sepolia-cycle.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
