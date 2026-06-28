import pino from "pino";
import type { Config } from "./config.ts";

export type Logger = pino.Logger;

export function makeLogger(cfg: Config): Logger {
  return pino({
    level: cfg.LOG_LEVEL,
    // Redact anything that could carry a secret. Blindings/keys must never log.
    redact: {
      paths: ["blinding", "blindings", "*.blinding", "privateKey", "AGENT_SESSION_PRIVATE_KEY"],
      censor: "[redacted]",
    },
    base: { component: "chaum-agent" },
  });
}
