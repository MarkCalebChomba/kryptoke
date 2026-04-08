import { createClient } from "@supabase/supabase-js";
import { ethers, JsonRpcProvider, Contract, HDNodeWallet } from "ethers";
import type { Database } from "@/lib/supabase/types";

/*
 * EVM Multi-Chain Sweep Job
 *
 * Sweeps user deposit wallets on ALL active EVM chains into the hot wallet.
 * Called by EventBridge cron (hourly). Never reachable via HTTP.
 *
 * Chains covered: BSC (56), Ethereum (1), Polygon (137), Arbitrum (42161),
 *                 Optimism (10), Base (8453), Fantom (250), Avalanche (43114)
 *
 * Env vars required:
 *   MASTER_SEED_PHRASE   — BIP39 mnemonic for HD derivation
 *   HOT_WALLET_ADDRESS   — destination address for swept funds
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   Optional per-chain: BSC_RPC_URL, ETH_RPC_URL, POLYGON_RPC_URL, etc.
 */

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const NATIVE_TRANSFER_ABI: string[] = [];

// Chains to sweep: [chainId, rpcEnvVar, defaultRpc, usdtAddress, decimals, minSweepUnits, gasTopUpNative]
interface ChainSpec {
  id: number;
  name: string;
  rpcEnvVar: string;
  defaultRpc: string;
  usdtAddress: string;
  usdtDecimals: number;
  minSweepUnits: bigint; // in token base units
  gasTopUpWei: bigint;   // top-up amount in native wei
  minGasWei: bigint;     // threshold below which we top up
}

const SWEEP_CHAINS: ChainSpec[] = [
  {
    id: 56, name: "BSC",
    rpcEnvVar: "BSC_RPC_URL", defaultRpc: "https://bsc-dataseed.binance.org",
    usdtAddress: "0x55d398326f99059fF775485246999027B3197955", usdtDecimals: 18,
    minSweepUnits: ethers.parseUnits("1", 18),
    gasTopUpWei: ethers.parseEther("0.01"), minGasWei: ethers.parseEther("0.005"),
  },
  {
    id: 1, name: "Ethereum",
    rpcEnvVar: "ETH_RPC_URL", defaultRpc: "https://eth.llamarpc.com",
    usdtAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7", usdtDecimals: 6,
    minSweepUnits: ethers.parseUnits("1", 6),
    gasTopUpWei: ethers.parseEther("0.005"), minGasWei: ethers.parseEther("0.002"),
  },
  {
    id: 137, name: "Polygon",
    rpcEnvVar: "POLYGON_RPC_URL", defaultRpc: "https://polygon-rpc.com",
    usdtAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", usdtDecimals: 6,
    minSweepUnits: ethers.parseUnits("1", 6),
    gasTopUpWei: ethers.parseEther("2"), minGasWei: ethers.parseEther("0.5"),
  },
  {
    id: 42161, name: "Arbitrum",
    rpcEnvVar: "ARBITRUM_RPC_URL", defaultRpc: "https://arb1.arbitrum.io/rpc",
    usdtAddress: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", usdtDecimals: 6,
    minSweepUnits: ethers.parseUnits("1", 6),
    gasTopUpWei: ethers.parseEther("0.001"), minGasWei: ethers.parseEther("0.0003"),
  },
  {
    id: 10, name: "Optimism",
    rpcEnvVar: "OPTIMISM_RPC_URL", defaultRpc: "https://mainnet.optimism.io",
    usdtAddress: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", usdtDecimals: 6,
    minSweepUnits: ethers.parseUnits("1", 6),
    gasTopUpWei: ethers.parseEther("0.001"), minGasWei: ethers.parseEther("0.0003"),
  },
  {
    id: 8453, name: "Base",
    rpcEnvVar: "BASE_RPC_URL", defaultRpc: "https://mainnet.base.org",
    usdtAddress: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", usdtDecimals: 6,
    minSweepUnits: ethers.parseUnits("1", 6),
    gasTopUpWei: ethers.parseEther("0.001"), minGasWei: ethers.parseEther("0.0003"),
  },
];

export const handler = async (): Promise<void> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const masterSeed = process.env.MASTER_SEED_PHRASE;
  const hotWalletAddress = process.env.HOT_WALLET_ADDRESS;

  if (!url || !key) throw new Error("Supabase not configured");
  if (!masterSeed) throw new Error("MASTER_SEED_PHRASE not configured");
  if (!hotWalletAddress) throw new Error("HOT_WALLET_ADDRESS not configured");

  const db = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Get all users with HD indices
  const { data: users } = await db
    .from("users")
    .select("uid, hd_index")
    .not("hd_index", "is", null);

  if (!users || users.length === 0) {
    console.log("[Sweep] No users with hd_index found");
    return;
  }

  const totalSwept: string[] = [];

  // Sweep each chain independently — failure on one chain doesn't block others
  for (const chain of SWEEP_CHAINS) {
    const rpcUrl = process.env[chain.rpcEnvVar] ?? chain.defaultRpc;
    const provider = new JsonRpcProvider(rpcUrl);

    // Hot wallet signer (HD index 0 = exchange operational wallet)
    const hotWallet = HDNodeWallet.fromPhrase(masterSeed, undefined, `m/44'/60'/0'/0/0`).connect(provider);

    let chainSwept = 0;

    for (const user of users) {
      try {
        const userWallet = HDNodeWallet.fromPhrase(masterSeed, undefined, `m/44'/60'/0'/0/${user.hd_index}`);
        const userAddress = userWallet.address;
        const usdtContract = new Contract(chain.usdtAddress, ERC20_ABI, provider);

        const usdtBalance: bigint = await usdtContract.balanceOf(userAddress);
        if (usdtBalance < chain.minSweepUnits) continue;

        // Top up gas if needed
        const nativeBalance = await provider.getBalance(userAddress);
        if (nativeBalance < chain.minGasWei) {
          const topUpTx = await hotWallet.sendTransaction({
            to: userAddress,
            value: chain.gasTopUpWei,
          });
          await topUpTx.wait(1);
        }

        // Sweep USDT from user wallet to hot wallet
        const userSigner = userWallet.connect(provider);
        const usdtWithSigner = new Contract(chain.usdtAddress, ERC20_ABI, userSigner);
        const tx = await usdtWithSigner.transfer(hotWalletAddress, usdtBalance);
        await tx.wait(1);

        const amountFormatted = ethers.formatUnits(usdtBalance, chain.usdtDecimals);
        totalSwept.push(`${chain.name}:${user.uid}: ${amountFormatted} USDT`);
        chainSwept++;

        console.log(`[Sweep][${chain.name}] Swept ${amountFormatted} USDT from ${userAddress}`);
      } catch (err) {
        console.error(`[Sweep][${chain.name}] Failed for user ${user.uid}:`, err);
      }
    }

    console.log(`[Sweep][${chain.name}] Done. Swept ${chainSwept} wallets.`);
  }

  // Run deposit stuck-state recovery alongside sweep
  try {
    const { recoverStuckCompletingDeposits } = await import("@/server/jobs/b2c-recovery");
    await recoverStuckCompletingDeposits();
  } catch (err) {
    console.error("[Sweep] recoverStuckCompletingDeposits failed:", err);
  }

  console.log(`[Sweep] Complete. Total swept: ${totalSwept.length} wallet(s) across all chains.`);
};

