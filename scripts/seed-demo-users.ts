// Seed the live Sepolia deployment with a realistic demo: ~12 payees ("users"),
// update the on-chain payee set, and run real disbursement cycles paying them
// (each payout is a real ERC-20 transfer). Saves the cycle data for the console.
//
// Env: RPC_URL, DEPLOYER_ADDRESS, DEPLOYER_PRIVATE_KEY, CYCLES (default 2)

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, Contract, RpcProvider, hash, logger } from "starknet";
import { poseidonHashMany } from "@scure/starknet";
import { artifact } from "./src/artifacts.ts";
import { buildCyclePlan, payeeRootFor } from "@chaum/agent/engine";

logger.setLogLevel("ERROR");
const req = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`missing env ${n}`); return v; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function retry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let d = 4000;
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (!/-32011|too fast|rate.?limit|429|limit exceeded/i.test(String(e)) || i >= 8) throw e;
      console.log(`  …${label} rate-limited, retry ${i} in ${Math.round(d / 1000)}s`);
      await sleep(d); d = Math.min(Math.round(d * 1.7), 25000);
    }
  }
}

// 12 demo users: realistic-looking addresses (Poseidon-derived) + salaries (base units).
const NAMES = ["alice", "ben", "carol", "dave", "erin", "frank", "grace", "heidi", "ivan", "judy", "karl", "liam"];
const AMOUNTS = [3200n, 1840n, 2460n, 4200n, 1480n, 1180n, 2750n, 3900n, 900n, 5000n, 2100n, 1600n];
const P251 = 2n ** 251n;
function demoAddr(i: number): string {
  const h = poseidonHashMany([BigInt("0x" + Buffer.from("chaum-user").toString("hex")), BigInt(i)]);
  return "0x" + (((h % (P251 - 256n)) + 1n).toString(16));
}
const users = NAMES.map((n, i) => ({ label: `${n}.stark`, address: demoAddr(i), amount: AMOUNTS[i] }));

async function latestCycleId(provider: RpcProvider, executor: string): Promise<number> {
  const key = hash.getSelectorFromName("CycleExecuted");
  const res: any = await retry("getEvents", () =>
    provider.getEvents({ address: executor, from_block: { block_number: 11326330 }, to_block: "latest", keys: [[key]], chunk_size: 100 }),
  );
  let max = 0;
  for (const e of res.events ?? []) max = Math.max(max, Number(BigInt(e.keys[1])));
  return max;
}

async function main() {
  const dep = JSON.parse(readFileSync(resolve(import.meta.dirname, "deployments.sepolia.json"), "utf8"));
  const provider = new RpcProvider({ nodeUrl: req("RPC_URL") });
  const account = new Account({ provider, address: req("DEPLOYER_ADDRESS"), signer: req("DEPLOYER_PRIVATE_KEY") });
  const cyclesToRun = Number(process.env.CYCLES ?? "2");

  const registry = new Contract({ abi: artifact("PayrollRegistry").sierra.abi, address: dep.registry, providerOrAccount: account });
  const executor = new Contract({ abi: artifact("DisbursementExecutor").sierra.abi, address: dep.executor, providerOrAccount: account });

  // 1. Update the on-chain payee set to the 12 demo users.
  const root = payeeRootFor(users);
  console.log(`updating payee set → ${users.length} users, root 0x${root.toString(16).slice(0, 12)}…`);
  const utx = await retry("update_payees", () => account.execute([registry.populate("update_payees", [root])]));
  await retry("wait", () => provider.waitForTransaction(utx.transaction_hash, { retryInterval: 6000 }));
  console.log("  payee set updated ✓");

  // 2. Run cycles paying all 12 users (each payout = a real ERC-20 transfer).
  let cycleId = await latestCycleId(provider, dep.executor);
  const runCycles: any[] = [];
  for (let k = 0; k < cyclesToRun; k++) {
    cycleId += 1;
    const plan = buildCyclePlan(users, 1_000_000n);
    const payouts = plan.payouts.map((p) => ({
      payee: p.payee, amount: p.amount, blinding: p.blinding,
      commitment: { x: p.commitment.x, y: p.commitment.y }, merkle_proof: p.proof,
    }));
    console.log(`running cycle ${cycleId} → ${users.length} users, total ${plan.totalAmount}…`);
    const tx = await retry("execute_cycle", () => account.execute([executor.populate("execute_cycle", [cycleId, payouts])]));
    await retry("wait", () => provider.waitForTransaction(tx.transaction_hash, { retryInterval: 6000 }));
    const verified = Boolean(await retry("verify", () => executor.call("verify_aggregate", [cycleId])));
    console.log(`  cycle ${cycleId} tx ${tx.transaction_hash.slice(0, 16)}… verify=${verified}`);
    runCycles.push({
      cycleId, txHash: tx.transaction_hash, total: plan.totalAmount.toString(), verified,
      payouts: plan.payouts.map((p, i) => ({
        label: users[i].label, payee: p.payee, amount: p.amount.toString(), blinding: p.blinding.toString(),
        commitment: { x: "0x" + p.commitment.x.toString(16), y: "0x" + p.commitment.y.toString(16) },
      })),
    });
    if (k < cyclesToRun - 1) { console.log("  waiting for cadence (65s)…"); await sleep(65_000); }
  }

  const out = { payeeRoot: "0x" + root.toString(16), users: users.map((u) => ({ label: u.label, address: u.address })), cycles: runCycles };
  writeFileSync(resolve(import.meta.dirname, "sepolia-demo.json"), JSON.stringify(out, null, 2));
  console.log(`\ndone — ${cyclesToRun} cycles, ${users.length} users. wrote sepolia-demo.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
