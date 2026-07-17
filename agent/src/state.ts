// Local agent state (sqlite): cycle idempotency + per-payee blindings.
// A cycle is recorded BEFORE submit (status 'pending') and updated after, so a
// crash/restart never double-pays: the scheduler skips any cycle_id already here.
// Blindings are secrets — stored locally, never logged, never sent anywhere.

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type CycleStatus = "pending" | "submitted" | "confirmed" | "failed";

export interface CycleRecord {
  cycleId: number;
  status: CycleStatus;
  txHash: string | null;
  totalAmount: string; // decimal string (u256)
  createdAt: number;
  updatedAt: number;
}

export interface BlindingRow {
  cycleId: number;
  payee: string; // 0x address
  amount: string; // decimal string
  blinding: string; // decimal string — SECRET
}

export class AgentState {
  private db: Database.Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cycles (
        cycle_id     INTEGER PRIMARY KEY,
        status       TEXT NOT NULL,
        tx_hash      TEXT,
        total_amount TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS blindings (
        cycle_id INTEGER NOT NULL,
        payee    TEXT NOT NULL,
        amount   TEXT NOT NULL,
        blinding TEXT NOT NULL,
        PRIMARY KEY (cycle_id, payee)
      );
    `);
  }

  hasCycle(cycleId: number): boolean {
    return !!this.db.prepare("SELECT 1 FROM cycles WHERE cycle_id = ?").get(cycleId);
  }

  getCycle(cycleId: number): CycleRecord | undefined {
    const r = this.db
      .prepare("SELECT * FROM cycles WHERE cycle_id = ?")
      .get(cycleId) as any;
    if (!r) return undefined;
    return {
      cycleId: r.cycle_id,
      status: r.status,
      txHash: r.tx_hash,
      totalAmount: r.total_amount,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /** Reserve a cycle id before submitting. Returns false if already present. */
  reserveCycle(cycleId: number, totalAmount: bigint, now: number): boolean {
    try {
      this.db
        .prepare(
          "INSERT INTO cycles (cycle_id, status, tx_hash, total_amount, created_at, updated_at) VALUES (?, 'pending', NULL, ?, ?, ?)",
        )
        .run(cycleId, totalAmount.toString(), now, now);
      return true;
    } catch {
      return false; // PRIMARY KEY conflict — already reserved
    }
  }

  setStatus(cycleId: number, status: CycleStatus, txHash: string | null, now: number): void {
    this.db
      .prepare("UPDATE cycles SET status = ?, tx_hash = ?, updated_at = ? WHERE cycle_id = ?")
      .run(status, txHash, now, cycleId);
  }

  saveBlindings(rows: BlindingRow[]): void {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO blindings (cycle_id, payee, amount, blinding) VALUES (?, ?, ?, ?)",
    );
    const tx = this.db.transaction((rs: BlindingRow[]) => {
      for (const r of rs) stmt.run(r.cycleId, r.payee, r.amount, r.blinding);
    });
    tx(rows);
  }

  getBlinding(cycleId: number, payee: string): BlindingRow | undefined {
    const r = this.db
      .prepare("SELECT * FROM blindings WHERE cycle_id = ? AND payee = ?")
      .get(cycleId, payee) as any;
    if (!r) return undefined;
    return { cycleId: r.cycle_id, payee: r.payee, amount: r.amount, blinding: r.blinding };
  }

  close(): void {
    this.db.close();
  }
}
