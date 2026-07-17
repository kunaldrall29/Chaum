// Optional notifications (webhook + Telegram). Best-effort: failures are logged,
// never fatal. Amounts/blindings are never included.

import type { Config } from "./config.ts";
import type { Logger } from "./logger.ts";

export type NotifyEvent =
  | { kind: "cycle_executed"; cycleId: number; payees: number; txHash: string }
  | { kind: "cycle_failed"; cycleId?: number; reason: string }
  | { kind: "vault_low"; balance: string; oneCycleMax: string };

function message(e: NotifyEvent): string {
  switch (e.kind) {
    case "cycle_executed":
      return `✅ Chaum cycle ${e.cycleId} executed (${e.payees} payees). tx ${e.txHash}`;
    case "cycle_failed":
      return `❌ Chaum cycle ${e.cycleId ?? "?"} failed: ${e.reason}`;
    case "vault_low":
      return `⚠️ Chaum vault low: balance ${e.balance} < one cycle max ${e.oneCycleMax}`;
  }
}

export async function notify(cfg: Config, log: Logger, e: NotifyEvent): Promise<void> {
  const text = message(e);
  const tasks: Promise<unknown>[] = [];

  if (cfg.WEBHOOK_URL) {
    tasks.push(
      fetch(cfg.WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, event: e }),
      }),
    );
  }
  if (cfg.TELEGRAM_BOT_TOKEN && cfg.TELEGRAM_CHAT_ID) {
    const url = `https://api.telegram.org/bot${cfg.TELEGRAM_BOT_TOKEN}/sendMessage`;
    tasks.push(
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: cfg.TELEGRAM_CHAT_ID, text }),
      }),
    );
  }

  if (tasks.length === 0) return;
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") log.warn({ err: String(r.reason) }, "notify failed");
  }
}
