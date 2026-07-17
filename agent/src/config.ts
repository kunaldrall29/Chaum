// Environment config, validated with zod. Fail fast on a bad/missing setting.
// Secrets (session key, blindings) live here at runtime only — never logged.

import { z } from "zod";

const hex = z.string().regex(/^0x[0-9a-fA-F]+$/, "must be 0x-hex");

const Schema = z.object({
  RPC_URL: z.string().url(),
  CHAIN_ID: z.string().default("SN_SEPOLIA"),

  // Agent identity: the session key signs; the account is policy.agent on-chain.
  AGENT_SESSION_PRIVATE_KEY: hex,
  AGENT_ACCOUNT_ADDRESS: hex,

  // Deployed contract addresses.
  REGISTRY_ADDRESS: hex,
  VAULT_ADDRESS: hex,
  EXECUTOR_ADDRESS: hex,

  // Off-chain payroll source (payees + amounts) and local agent state.
  PAYROLL_CONFIG_PATH: z.string().default("./payroll.json"),
  DB_PATH: z.string().default("./data/agent.sqlite"),

  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // If true, the agent simulates and logs but never submits.
  DRY_RUN: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Optional post-hoc LLM summary (never in the hot path).
  CLAUDE_API_KEY: z.string().optional(),
  // Optional notifications.
  WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export type Config = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid agent configuration:\n${issues}`);
  }
  return parsed.data;
}
