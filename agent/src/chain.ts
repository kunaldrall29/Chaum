// Starknet client: loads ABIs from the compiled artifacts, reads policy/vault
// state, and submits execute_cycle (simulate-first). Uses the session key to sign.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Account, Contract, RpcProvider, type Abi } from "starknet";
import type { Config } from "./config.ts";
import type { CyclePlan } from "./engine.ts";
import type { Policy } from "./engine.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
// agent/src -> repo/contracts/target/dev
const ABI_DIR = resolve(HERE, "../../contracts/target/dev");

function loadAbi(contract: string): Abi {
  const path = resolve(ABI_DIR, `chaum_${contract}.contract_class.json`);
  const json = JSON.parse(readFileSync(path, "utf8"));
  return json.abi as Abi;
}

export class ChaumChain {
  readonly provider: RpcProvider;
  readonly account: Account;
  private registry: Contract;
  private vault: Contract;
  private executor: Contract;

  constructor(private cfg: Config) {
    this.provider = new RpcProvider({ nodeUrl: cfg.RPC_URL });
    this.account = new Account({
      provider: this.provider,
      address: cfg.AGENT_ACCOUNT_ADDRESS,
      signer: cfg.AGENT_SESSION_PRIVATE_KEY,
    });
    this.registry = new Contract({
      abi: loadAbi("PayrollRegistry"),
      address: cfg.REGISTRY_ADDRESS,
      providerOrAccount: this.provider,
    });
    this.vault = new Contract({
      abi: loadAbi("DisbursementVault"),
      address: cfg.VAULT_ADDRESS,
      providerOrAccount: this.provider,
    });
    this.executor = new Contract({
      abi: loadAbi("DisbursementExecutor"),
      address: cfg.EXECUTOR_ADDRESS,
      providerOrAccount: this.provider,
    });
  }

  async getPolicy(): Promise<Policy> {
    const p: any = await this.registry.call("get_policy");
    return {
      payeeRoot: BigInt(p.payee_root),
      maxPerPayee: BigInt(p.max_per_payee),
      maxPerCycle: BigInt(p.max_per_cycle),
      cadence: BigInt(p.cadence),
      lastCycleAt: BigInt(p.last_cycle_at),
      paused: Boolean(p.paused),
      agent: BigInt(p.agent),
    };
  }

  async getVaultBalance(): Promise<bigint> {
    return BigInt((await this.vault.call("balance")) as any);
  }

  /** Build the execute_cycle call from a plan. */
  private cycleCall(cycleId: number, plan: CyclePlan) {
    const payouts = plan.payouts.map((p) => ({
      payee: p.payee,
      amount: p.amount,
      blinding: p.blinding,
      commitment: { x: p.commitment.x, y: p.commitment.y },
      merkle_proof: p.proof,
    }));
    return this.executor.populate("execute_cycle", [cycleId, payouts]);
  }

  /** Simulate execute_cycle; throws if it would revert (fee estimation runs the tx). */
  async simulateCycle(cycleId: number, plan: CyclePlan): Promise<void> {
    const call = this.cycleCall(cycleId, plan);
    await this.account.estimateInvokeFee([call]);
  }

  /** Submit execute_cycle; returns the tx hash (caller should await receipt). */
  async submitCycle(cycleId: number, plan: CyclePlan): Promise<string> {
    const call = this.cycleCall(cycleId, plan);
    const { transaction_hash } = await this.account.execute([call]);
    return transaction_hash;
  }

  async waitForTx(txHash: string) {
    return this.provider.waitForTransaction(txHash);
  }

  async verifyAggregate(cycleId: number): Promise<boolean> {
    return Boolean(await this.executor.call("verify_aggregate", [cycleId]));
  }
}
