// Standalone deploy to any RPC (devnet or Sepolia). Env-driven; writes a
// deployments JSON and prints a table for docs/DEPLOYMENTS.md.
//
//   RPC_URL, DEPLOYER_ADDRESS, DEPLOYER_PRIVATE_KEY  (owner/deployer)
//   AGENT_ACCOUNT_ADDRESS  (policy.agent), AGENT_SESSION_PUBKEY (default 0x1)
//   PAYROLL_CONFIG_PATH (payees -> Merkle root; default ../agent/payroll.example.json)
//   MAX_PER_PAYEE, MAX_PER_CYCLE, CADENCE
//   TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY, FUND_AMOUNT
//   OUTPUT (deployments json path; default ./deployments.json)

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, RpcProvider, logger } from "starknet";
import { deployAll } from "./src/deploy.ts";
import { loadPayroll } from "@chaum/agent/payroll";
import { payeeRootFor } from "@chaum/agent/engine";

logger.setLogLevel("ERROR");

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}
const opt = (name: string, def: string) => process.env[name] ?? def;

async function main() {
  const provider = new RpcProvider({ nodeUrl: req("RPC_URL") });
  const account = new Account({
    provider,
    address: req("DEPLOYER_ADDRESS"),
    signer: req("DEPLOYER_PRIVATE_KEY"),
  });

  const payees = loadPayroll(
    opt("PAYROLL_CONFIG_PATH", resolve(import.meta.dirname, "../agent/payroll.example.json")),
  );
  const payeeRoot = payeeRootFor(payees);

  console.log(`deploying to ${req("RPC_URL")} as ${req("DEPLOYER_ADDRESS").slice(0, 12)}…`);
  const addrs = await deployAll(account, provider, {
    owner: req("DEPLOYER_ADDRESS"),
    agentAddress: req("AGENT_ACCOUNT_ADDRESS"),
    agentPubkey: opt("AGENT_SESSION_PUBKEY", "0x1"),
    payeeRoot,
    maxPerPayee: BigInt(opt("MAX_PER_PAYEE", "1000000000000000000000")),
    maxPerCycle: BigInt(opt("MAX_PER_CYCLE", "10000000000000000000000")),
    cadence: BigInt(opt("CADENCE", "3600")),
    tokenName: opt("TOKEN_NAME", "Chaum Demo USD"),
    tokenSymbol: opt("TOKEN_SYMBOL", "cUSD"),
    initialSupply: BigInt(opt("INITIAL_SUPPLY", "1000000000000000000000000")),
    fundAmount: BigInt(opt("FUND_AMOUNT", "100000000000000000000000")),
    execWindow: BigInt(opt("EXEC_WINDOW", "3600")),
    anomalyPayeeBps: Number(opt("ANOMALY_PAYEE_BPS", "5000")),
    anomalyTotalBps: Number(opt("ANOMALY_TOTAL_BPS", "5000")),
    kytRevertOnDeny: opt("KYT_REVERT_ON_DENY", "false") === "true",
  });

  const out = { rpc: req("RPC_URL"), payeeRoot: "0x" + payeeRoot.toString(16), ...addrs };
  const outPath = opt("OUTPUT", resolve(import.meta.dirname, "deployments.json"));
  writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log("\nDeployed:");
  for (const [k, v] of Object.entries(addrs)) console.log(`  ${k.padEnd(9)} ${v}`);
  console.log(`\nwritten ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
