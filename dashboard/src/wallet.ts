// Wallet connection via get-starknet (ArgentX / Braavos / …) + starknet.js v10
// WalletAccount. Returns a real AccountInterface used to sign on-chain writes.

import { connect as gsConnect, disconnect as gsDisconnect } from "@starknet-io/get-starknet";
import { WalletAccount } from "starknet";
import { provider, CFG } from "./chain.ts";

export interface Connected {
  account: WalletAccount;
  address: string;
}

export async function connectWallet(): Promise<Connected | null> {
  const swo: any = await gsConnect({ modalMode: "alwaysAsk", modalTheme: "dark" });
  if (!swo) return null;
  const account = await WalletAccount.connect(provider, swo);
  const address = account.address;
  // Best-effort: ensure the wallet is on Sepolia.
  try {
    const chainId = await swo.request?.({ type: "wallet_requestChainId" });
    if (chainId && !String(chainId).toLowerCase().includes("sepolia") && String(chainId) !== "0x534e5f5345504f4c4941") {
      await swo.request?.({ type: "wallet_switchStarknetChain", params: { chainId: "0x534e5f5345504f4c4941" } }).catch(() => {});
    }
  } catch {
    /* non-fatal */
  }
  return { account, address };
}

export async function disconnectWallet(): Promise<void> {
  try {
    await gsDisconnect({ clearLastWallet: true });
  } catch {
    /* ignore */
  }
}

export const isOwner = (addr: string | null) =>
  !!addr && BigInt(addr) === BigInt(CFG.owner);
