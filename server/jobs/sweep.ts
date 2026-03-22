import { createClient } from "@supabase/supabase-js";
import { ethers, JsonRpcProvider, Wallet, Contract } from "ethers";
import type { Database } from "@/lib/supabase/types";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const MIN_BNB_FOR_GAS = ethers.parseEther("0.005"); // 0.005 BNB per sweep
const GAS_TOP_UP = ethers.parseEther("0.01");        // top up to 0.01 BNB

/**
 * Bug #8 fix: HOT_WALLET_KEY is ONLY present in this Lambda's environment.
 * It is NOT set on the HTTP API Lambda. This job is triggered exclusively
 * by EventBridge (hourly cron), never via HTTP endpoint.
 */
export const handler = async (): Promise<void> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hotWalletKey = process.env.HOT_WALLET_KEY;
  const hotWalletAddress = process.env.HOT_WALLET_ADDRESS;
  const rpcUrl = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org";

  if (!url || !key) throw new Error("Supabase not configured");
  if (!hotWalletKey) throw new Error("HOT_WALLET_KEY not configured");
  if (!hotWalletAddress) throw new Error("HOT_WALLET_ADDRESS not configured");

  const db = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const provider = new JsonRpcProvider(rpcUrl);
  const hotWallet = new Wallet(hotWalletKey, provider);

  // Get all users with deposit addresses
  const { data: users } = await db
    .from("users")
    .select("uid, deposit_address, hd_index");

  if (!users || users.length === 0) return;

  const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
  const swept: string[] = [];

  for (const user of users) {
    try {
      const userAddress = user.deposit_address;
      const usdtContract = new Contract(USDT_ADDRESS, ERC20_ABI, provider);

      const usdtBalance: bigint = await usdtContract.balanceOf(userAddress);
      const minSweep = ethers.parseUnits("1", 18); // minimum 1 USDT to sweep

      if (usdtBalance < minSweep) continue;

      // Ensure user wallet has enough BNB for gas
      const bnbBalance = await provider.getBalance(userAddress);
      if (bnbBalance < MIN_BNB_FOR_GAS) {
        // Top up BNB from hot wallet
        const topUpTx = await hotWallet.sendTransaction({
          to: userAddress,
          value: GAS_TOP_UP,
        });
        await topUpTx.wait();
      }

      // Derive user wallet to sign the sweep transaction
      const masterSeed = process.env.MASTER_SEED_PHRASE;
      if (!masterSeed) throw new Error("MASTER_SEED_PHRASE not configured");

      const { HDNodeWallet } = await import("ethers");
      const userWallet = HDNodeWallet.fromPhrase(
        masterSeed,
        undefined,
        `m/44'/60'/0'/0/${user.hd_index}`
      ).connect(provider);

      const usdtWithSigner = new Contract(USDT_ADDRESS, ERC20_ABI, userWallet);
      const tx = await usdtWithSigner.transfer(hotWalletAddress, usdtBalance);
      await tx.wait();

      const amountFormatted = ethers.formatUnits(usdtBalance, 18);
      swept.push(`${user.uid}: ${amountFormatted} USDT`);

      console.log(
        `[Sweep] Swept ${amountFormatted} USDT from ${userAddress} to hot wallet`
      );
    } catch (err) {
      console.error(`[Sweep] Failed for user ${user.uid}:`, err);
    }
  }

  console.log(`[Sweep] Complete. Swept from ${swept.length} wallets.`);
};
