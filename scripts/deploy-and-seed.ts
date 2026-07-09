// Fresh deploy of the evolved operating-account contracts to Sepolia + a full
// realistic seed: 12 users across payroll/vendor/grant streams, roles (auditor,
// stakeholder), a KYT deny (skip-and-log), and real disbursement cycles.
// Writes deployments.sepolia.json + sepolia-demo.json for the console.
//
// Env: RPC_URL, DEPLOYER_ADDRESS, DEPLOYER_PRIVATE_KEY, CYCLES (default 2)

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, Contract, RpcProvider, CairoCustomEnum, hash, logger } from "starknet";
import { poseidonHashMany } from "@scure/starknet";
import { artifact } from "./src/artifacts.ts";
import { deployAll } from "./src/deploy.ts";
import { buildCyclePlan, payeeRootFor } from "@chaum/agent/engine";
import type { Stream } from "@chaum/agent/streams";
import type { Payee } from "@chaum/agent/payroll";

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

const streamCairo = (s: Stream) =>
  new CairoCustomEnum({
    Payroll: s === "payroll" ? {} : undefined,
    Vendor: s === "vendor" ? {} : undefined,
    Grant: s === "grant" ? {} : undefined,
  });
const roleCairo = (r: "Auditor" | "Stakeholder" | "Payee") =>
  new CairoCustomEnum({
    None: undefined, Owner: undefined, Operator: undefined,
    Auditor: r === "Auditor" ? {} : undefined,
    Payee: r === "Payee" ? {} : undefined,
    Stakeholder: r === "Stakeholder" ? {} : undefined,
  });

const P251 = 2n ** 251n;
const demoAddr = (seed: string): string => {
  const h = poseidonHashMany([BigInt("0x" + Buffer.from("chaum:" + seed).toString("hex"))]);
  return "0x" + (((h % (P251 - 256n)) + 1n).toString(16));
};

// 12 users across three streams.
const SPEC: { name: string; stream: Stream; amount: bigint }[] = [
  { name: "alice", stream: "payroll", amount: 3200n },
  { name: "ben", stream: "payroll", amount: 1840n },
  { name: "cyo", stream: "payroll", amount: 2460n },
  { name: "dave", stream: "payroll", amount: 4200n },
  { name: "erin", stream: "payroll", amount: 1480n },
  { name: "frank", stream: "payroll", amount: 1180n },
  { name: "grace", stream: "payroll", amount: 2750n },
  { name: "atlas-audit", stream: "vendor", amount: 6000n },
  { name: "node-ops", stream: "vendor", amount: 3800n },
  { name: "cloud-host", stream: "vendor", amount: 2200n },
  { name: "grant-014", stream: "grant", amount: 8000n },
  { name: "grant-022", stream: "grant", amount: 5000n },
];
const users: Payee[] = SPEC.map((u) => ({
  label: `${u.name}.stark`, address: demoAddr(u.name), stream: u.stream, amount: u.amount,
}));
const DENIED = "node-ops"; // KYT denies this vendor → skipped-and-logged

async function main() {
  const provider = new RpcProvider({ nodeUrl: req("RPC_URL") });
  const account = new Account({ provider, address: req("DEPLOYER_ADDRESS"), signer: req("DEPLOYER_PRIVATE_KEY") });
  const owner = req("DEPLOYER_ADDRESS");
  const cyclesToRun = Number(process.env.CYCLES ?? "2");

  console.log("deploying evolved contracts…");
  const a = await deployAll(account, provider, {
    owner, agentAddress: owner, agentPubkey: owner,
    payeeRoot: payeeRootFor(users),
    maxPerPayee: 1_000_000n, maxPerCycle: 10_000_000n, cadence: 60n,
    tokenName: "Chaum USD", tokenSymbol: "cUSD",
    initialSupply: 100_000_000_000n, fundAmount: 1_000_000_000n,
    execWindow: 3600n, anomalyPayeeBps: 5000, anomalyTotalBps: 5000, kytRevertOnDeny: false,
  });
  console.log("  addresses:", a);

  const reg = new Contract({ abi: artifact("PayrollRegistry").sierra.abi, address: a.registry, providerOrAccount: account });
  const exe = new Contract({ abi: artifact("DisbursementExecutor").sierra.abi, address: a.executor, providerOrAccount: account });
  const kyt = new Contract({ abi: artifact("MockKytOracle").sierra.abi, address: a.kyt, providerOrAccount: account });

  // roles + KYT verdicts
  const auditor = demoAddr("auditor");
  const stakeholder = demoAddr("stakeholder");
  const deniedAddr = users.find((u) => u.label!.startsWith(DENIED))!.address;
  const tx = await retry("roles+kyt", () =>
    account.execute([
      reg.populate("set_role", [auditor, roleCairo("Auditor")]),
      reg.populate("set_role", [stakeholder, roleCairo("Stakeholder")]),
      reg.populate("set_role", [users[0].address, roleCairo("Payee")]),
      kyt.populate("set_verdict", [deniedAddr, 2]), // deny
    ]),
  );
  await retry("wait", () => provider.waitForTransaction(tx.transaction_hash, { retryInterval: 6000 }));
  console.log("  roles + KYT verdict set");

  // run cycles
  const toCalldata = (plan: any) =>
    plan.payouts.map((p: any) => ({
      payee: p.payee, stream: streamCairo(p.stream), amount: p.amount, blinding: p.blinding,
      commitment: { x: p.commitment.x, y: p.commitment.y }, merkle_proof: p.proof,
    }));

  const key = hash.getSelectorFromName("CycleExecuted");
  const latest = async () => {
    const r: any = await retry("events", () => provider.getEvents({
      address: a.executor, from_block: { block_number: 0 }, to_block: "latest", keys: [[key]], chunk_size: 100,
    }));
    let m = 0;
    for (const e of r.events ?? []) m = Math.max(m, Number(BigInt(e.keys[1])));
    return m;
  };

  let cycleId = await latest();
  const cycles: any[] = [];
  for (let k = 0; k < cyclesToRun; k++) {
    cycleId += 1;
    const plan = buildCyclePlan(users, 1_000_000n);
    console.log(`running cycle ${cycleId} (${users.length} users)…`);
    const ctx = await retry("execute_cycle", () => account.execute([exe.populate("execute_cycle", [cycleId, toCalldata(plan)])]));
    await retry("wait", () => provider.waitForTransaction(ctx.transaction_hash, { retryInterval: 6000 }));
    const verified = Boolean(await retry("verify", () => exe.call("verify_aggregate", [cycleId])));
    console.log(`  cycle ${cycleId} tx ${ctx.transaction_hash.slice(0, 16)}… verify=${verified}`);
    cycles.push({
      cycleId, txHash: ctx.transaction_hash, verified,
      payouts: plan.payouts.map((p, i) => ({
        label: users[i].label!, payee: p.payee, stream: p.stream,
        denied: users[i].label!.startsWith(DENIED),
        amount: p.amount.toString(), blinding: p.blinding.toString(),
        commitment: { x: "0x" + p.commitment.x.toString(16), y: "0x" + p.commitment.y.toString(16) },
      })),
    });
    if (k < cyclesToRun - 1) { console.log("  wait cadence (65s)…"); await sleep(65_000); }
  }

  writeFileSync(resolve(import.meta.dirname, "deployments.sepolia.json"), JSON.stringify({ rpc: req("RPC_URL"), ...a }, null, 2));
  writeFileSync(resolve(import.meta.dirname, "sepolia-demo.json"), JSON.stringify({
    payeeRoot: "0x" + payeeRootFor(users).toString(16),
    roles: { auditor, stakeholder, payee: users[0].address },
    denied: deniedAddr,
    users: users.map((u) => ({ label: u.label!, address: u.address, stream: u.stream })),
    cycles,
  }, null, 2));
  console.log("\ndone. wrote deployments.sepolia.json + sepolia-demo.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
