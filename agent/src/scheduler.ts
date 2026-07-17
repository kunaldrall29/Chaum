// Poll loop: every POLL_INTERVAL_MS, attempt one cycle. No-ops are logged (the
// audit trail). Notifications fire on executed/failed/vault-low. Graceful stop.

import { ChaumChain } from "./chain.ts";
import { AgentState } from "./state.ts";
import { runCycle } from "./runner.ts";
import { notify } from "./notify.ts";
import type { Payee } from "./payroll.ts";
import type { Config } from "./config.ts";
import type { Logger } from "./logger.ts";

export function startScheduler(
  chain: ChaumChain,
  state: AgentState,
  payees: Payee[],
  cfg: Config,
  log: Logger,
): () => void {
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const res = await runCycle(chain, state, payees, log, { dryRun: cfg.DRY_RUN });
      if (res.ran && res.txHash) {
        await notify(cfg, log, {
          kind: "cycle_executed",
          cycleId: res.cycleId!,
          payees: payees.length,
          txHash: res.txHash,
        });
      } else if (res.reason && /failed/i.test(res.reason)) {
        await notify(cfg, log, { kind: "cycle_failed", cycleId: res.cycleId, reason: res.reason });
      }
    } catch (err) {
      log.error({ err: String(err) }, "scheduler tick error");
    } finally {
      running = false;
    }
  };

  log.info({ intervalMs: cfg.POLL_INTERVAL_MS, dryRun: cfg.DRY_RUN }, "scheduler started");
  void tick();
  const handle = setInterval(() => void tick(), cfg.POLL_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(handle);
    log.info("scheduler stopped");
  };
}
