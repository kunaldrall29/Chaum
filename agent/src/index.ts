// Chaum agent entrypoint. Loads config + payroll, wires the chain client and
// local state, and starts the deterministic scheduler. Ctrl-C stops cleanly.

import { loadConfig } from "./config.ts";
import { makeLogger } from "./logger.ts";
import { loadPayroll } from "./payroll.ts";
import { ChaumChain } from "./chain.ts";
import { AgentState } from "./state.ts";
import { startScheduler } from "./scheduler.ts";

async function main() {
  const cfg = loadConfig();
  const log = makeLogger(cfg);
  log.info({ rpc: cfg.RPC_URL, executor: cfg.EXECUTOR_ADDRESS }, "starting Chaum agent");

  const payees = loadPayroll(cfg.PAYROLL_CONFIG_PATH);
  log.info({ payees: payees.length }, "payroll loaded");

  const chain = new ChaumChain(cfg);
  const state = new AgentState(cfg.DB_PATH);

  const stop = startScheduler(chain, state, payees, cfg, log);

  const shutdown = () => {
    log.info("shutting down");
    stop();
    state.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
