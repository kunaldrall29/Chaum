// `pnpm demo` — one command: boot devnet, deploy + wire + fund, then prove the
// guarantees end to end. Individual amounts stay hidden (commitments only); the
// aggregate is verified; payee #3 opens their own amount; a non-payee is rejected;
// an over-cap payout reverts. Exits non-zero on any failed assertion (CI-grade).

import { readFileSync } from "node:fs";
import { Account, Contract, RpcProvider, CairoCustomEnum, logger } from "starknet";

// Silence starknet.js tip-estimation warnings (noisy on a fresh devnet).
logger.setLogLevel("ERROR");
import { startDevnet, type Devnet } from "./src/devnet.ts";
import { deployAll } from "./src/deploy.ts";
import { artifact } from "./src/artifacts.ts";
import { buildTree } from "@chaum/agent/merkle";
import { commit, randomBlinding, type Commitment } from "@chaum/agent/crypto";
import { buildCyclePlan, leavesFor } from "@chaum/agent/engine";
import { type Stream } from "@chaum/agent/streams";

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};
const short = (x: bigint) => {
  const h = "0x" + x.toString(16);
  return h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
};
const streamCairo = (s: Stream) =>
  new CairoCustomEnum({
    Payroll: s === "payroll" ? {} : undefined,
    Vendor: s === "vendor" ? {} : undefined,
    Grant: s === "grant" ? {} : undefined,
  });

const PAYEES: { label: string; address: string; stream: Stream; amount: bigint }[] = [
  { label: "Alice", address: "0x1001", stream: "payroll", amount: 100n },
  { label: "Bob", address: "0x1002", stream: "payroll", amount: 200n },
  { label: "Carol", address: "", stream: "payroll", amount: 150n }, // filled with a signable devnet acct
  { label: "Dave", address: "0x1004", stream: "vendor", amount: 300n },
  { label: "Erin", address: "0x1005", stream: "grant", amount: 250n },
];
const MAX_PER_PAYEE = 500n;
const MAX_PER_CYCLE = 2000n;

// Connect to an already-running devnet (CHAUM_DEVNET_URL + CHAUM_DEVNET_ACCOUNTS
// json path) or spawn a fresh one. External mode is used in constrained sandboxes.
async function getDevnet(): Promise<Devnet> {
  const url = process.env.CHAUM_DEVNET_URL;
  const acctsPath = process.env.CHAUM_DEVNET_ACCOUNTS;
  if (url && acctsPath) {
    const accounts = JSON.parse(readFileSync(acctsPath, "utf8"));
    console.log(`⛓  using existing devnet at ${url} (${accounts.length} accounts)`);
    return { url, accounts, stop: () => {} };
  }
  console.log("⛓  booting starknet-devnet…");
  return startDevnet({ accounts: 5 });
}

async function main() {
  const devnet = await getDevnet();
  try {
    const provider = new RpcProvider({ nodeUrl: devnet.url });
    const owner = devnet.accounts[0];
    const agent = devnet.accounts[1];
    const carol = devnet.accounts[2]; // payee #3, signable so it can open_own
    PAYEES[2].address = carol.address;

    const ownerAcct = new Account({ provider, address: owner.address, signer: owner.privateKey });
    const agentAcct = new Account({ provider, address: agent.address, signer: agent.privateKey });
    const carolAcct = new Account({ provider, address: carol.address, signer: carol.privateKey });

    const payeesForTree = PAYEES.map((p) => ({ address: p.address, stream: p.stream, amount: p.amount }));
    const tree = buildTree(leavesFor(payeesForTree));

    console.log("⛓  deploying contracts…");
    const a = await deployAll(ownerAcct, provider, {
      owner: owner.address,
      agentAddress: agent.address,
      agentPubkey: "0x1",
      payeeRoot: tree.root,
      maxPerPayee: MAX_PER_PAYEE,
      maxPerCycle: MAX_PER_CYCLE,
      cadence: 1n,
      tokenName: "Mock USD",
      tokenSymbol: "mUSD",
      initialSupply: 1_000_000n,
      fundAmount: 10_000n,
      execWindow: 0n,
      anomalyPayeeBps: 0,
      anomalyTotalBps: 0,
      kytRevertOnDeny: false,
    });
    console.log(`   registry ${a.registry}`);
    console.log(`   vault    ${a.vault}`);
    console.log(`   executor ${a.executor}`);

    const execAbi = artifact("DisbursementExecutor").sierra.abi;
    const tokAbi = artifact("MockERC20").sierra.abi;
    const execAgent = new Contract({ abi: execAbi, address: a.executor, providerOrAccount: agentAcct });
    const execRead = new Contract({ abi: execAbi, address: a.executor, providerOrAccount: provider });
    const execCarol = new Contract({ abi: execAbi, address: a.executor, providerOrAccount: carolAcct });
    const token = new Contract({ abi: tokAbi, address: a.token, providerOrAccount: provider });

    const toCalldata = (
      payouts: { payee: string; stream: Stream; amount: bigint; blinding: bigint; commitment: Commitment; proof: bigint[] }[],
    ) =>
      payouts.map((p) => ({
        payee: p.payee,
        stream: streamCairo(p.stream),
        amount: p.amount,
        blinding: p.blinding,
        commitment: { x: p.commitment.x, y: p.commitment.y },
        merkle_proof: p.proof,
      }));

    console.log("\n🔒 Negative checks (the contract disposes):");

    // Over per-payee cap: a single payout above MAX_PER_PAYEE must revert on-chain.
    {
      const b = randomBlinding();
      const payouts = [
        { payee: PAYEES[0].address, stream: PAYEES[0].stream, amount: 600n, blinding: b, commitment: commit(600n, b), proof: tree.proof(0) },
      ];
      let reverted = false;
      let reason = "";
      try {
        const tx = await agentAcct.execute([execAgent.populate("execute_cycle", [901, toCalldata(payouts)])]);
        await provider.waitForTransaction(tx.transaction_hash);
      } catch (e) {
        reverted = true;
        reason = String(e);
      }
      ok(reverted && /per-payee cap/.test(reason), "over-cap payout reverts (OVER_PAYEE)");
    }

    // Non-member payee: bogus address with someone else's proof must revert.
    {
      const b = randomBlinding();
      const payouts = [
        { payee: "0xBAD", stream: "payroll" as Stream, amount: 100n, blinding: b, commitment: commit(100n, b), proof: tree.proof(0) },
      ];
      let reverted = false;
      let reason = "";
      try {
        const tx = await agentAcct.execute([execAgent.populate("execute_cycle", [902, toCalldata(payouts)])]);
        await provider.waitForTransaction(tx.transaction_hash);
      } catch (e) {
        reverted = true;
        reason = String(e);
      }
      ok(reverted && /not in set/.test(reason), "non-payee is rejected (NOT_MEMBER)");
    }

    // The real private cycle.
    console.log("\n💸 Running cycle #1 (agent proposes, contract disposes):");
    const plan = buildCyclePlan(payeesForTree, MAX_PER_PAYEE);
    const cycleId = 1;
    const tx = await agentAcct.execute([
      execAgent.populate("execute_cycle", [cycleId, toCalldata(plan.payouts)]),
    ]);
    await provider.waitForTransaction(tx.transaction_hash);
    console.log(`   tx ${tx.transaction_hash}`);

    // Table — amounts redacted, only commitments visible.
    console.log("\n   payee     amount   commitment (x)            paid");
    console.log("   ────────  ───────  ────────────────────────  ────");
    for (let i = 0; i < PAYEES.length; i++) {
      const c: any = await execRead.commitment_of(cycleId, PAYEES[i].address);
      const paid: bigint = BigInt(await token.balance_of(PAYEES[i].address));
      console.log(
        `   ${PAYEES[i].label.padEnd(8)}  ${"██████".padEnd(7)}  ${short(BigInt(c.x)).padEnd(24)}  ${paid > 0n ? "✓" : "·"}`,
      );
    }

    // Auditor: aggregate verifies, no individual revealed.
    console.log("\n🔎 Auditor view:");
    const verified = Boolean(await execRead.verify_aggregate(cycleId));
    ok(verified, `aggregate proof verifies (total = ${plan.totalAmount}, split hidden)`);

    // Payee #3 (Carol) opens only her own commitment.
    console.log("\n👤 Payee view (Carol):");
    const carolBlinding = plan.payouts[2].blinding;
    const carolAmount = PAYEES[2].amount;
    let opened = false;
    try {
      const otx = await carolAcct.execute([
        execCarol.populate("open_own", [cycleId, carol.address, carolAmount, carolBlinding]),
      ]);
      await provider.waitForTransaction(otx.transaction_hash);
      opened = true;
    } catch {
      opened = false;
    }
    ok(opened, `Carol opens her own amount = ${carolAmount}`);

    // Carol cannot open with a wrong amount.
    let wrongRejected = false;
    try {
      const wtx = await carolAcct.execute([
        execCarol.populate("open_own", [cycleId, carol.address, 999n, carolBlinding]),
      ]);
      await provider.waitForTransaction(wtx.transaction_hash);
    } catch {
      wrongRejected = true;
    }
    ok(wrongRejected, "a wrong opening is rejected (BAD_OPENING)");

    console.log(`\n${failures === 0 ? "✅ DEMO PASSED" : `❌ DEMO FAILED (${failures})`}`);
  } finally {
    devnet.stop();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
