// OPTIONAL, POST-HOC plain-English cycle summary via the Claude API. This is NOT
// in the execution path — it runs after a cycle settles, purely for the activity
// log. Gated behind CLAUDE_API_KEY. Individual amounts are never sent; only the
// public facts (cycle id, payee count, verified aggregate, tx hash).

import type { Config } from "./config.ts";

export interface CycleFacts {
  cycleId: number;
  payeeCount: number;
  aggregateVerified: boolean;
  txHash: string;
  timestamp: number;
}

const MODEL = "claude-sonnet-4-6";

export async function explainCycle(cfg: Config, facts: CycleFacts): Promise<string | null> {
  if (!cfg.CLAUDE_API_KEY) return null;
  const prompt =
    `Write a 2-sentence, neutral audit-log summary of a private payroll cycle. ` +
    `Facts: cycle #${facts.cycleId}, ${facts.payeeCount} payees, aggregate proof ` +
    `${facts.aggregateVerified ? "verified" : "NOT verified"}, tx ${facts.txHash}. ` +
    `Do not invent amounts — individual amounts are private by design.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  return data?.content?.[0]?.text ?? null;
}
