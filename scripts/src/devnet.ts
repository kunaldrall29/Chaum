// Spawn a local starknet-devnet, parse its deterministic predeployed accounts
// from stdout (seed 0), and wait until it answers. Returns a stop() handle.

import { spawn, type ChildProcess } from "node:child_process";

export interface DevnetAccount {
  address: string;
  privateKey: string;
}

export interface Devnet {
  url: string;
  accounts: DevnetAccount[];
  stop: () => void;
}

export async function startDevnet(opts?: {
  port?: number;
  accounts?: number;
  seed?: number;
}): Promise<Devnet> {
  const port = opts?.port ?? 5050;
  const nAccounts = opts?.accounts ?? 5;
  const seed = opts?.seed ?? 0;
  const url = `http://127.0.0.1:${port}/rpc`;
  const base = `http://127.0.0.1:${port}`;

  const child: ChildProcess = spawn(
    "starknet-devnet",
    ["--seed", String(seed), "--accounts", String(nAccounts), "--host", "127.0.0.1", "--port", String(port)],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const accounts: DevnetAccount[] = [];
  let buf = "";
  let pendingAddress: string | null = null;

  const onData = (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const addr = line.match(/Account address\s*\|\s*(0x[0-9a-fA-F]+)/);
      if (addr) pendingAddress = addr[1];
      const pk = line.match(/Private key\s*\|\s*(0x[0-9a-fA-F]+)/);
      if (pk && pendingAddress) {
        accounts.push({ address: pendingAddress, privateKey: pk[1] });
        pendingAddress = null;
      }
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  // Wait for liveness + the expected number of parsed accounts.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/is_alive`);
      if (res.ok && accounts.length >= nAccounts) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (accounts.length < nAccounts) {
    child.kill("SIGKILL");
    throw new Error(`devnet did not report ${nAccounts} accounts (got ${accounts.length})`);
  }

  return {
    url,
    accounts,
    stop: () => child.kill("SIGKILL"),
  };
}
