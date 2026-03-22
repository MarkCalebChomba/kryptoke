/**
 * KryptoKe Multi-Chain Blockchain Service
 *
 * ARCHITECTURE DECISION:
 * Phase 1 (now): All EVM-compatible chains via Etherscan V2 unified API.
 *   - One API key covers every chain Etherscan supports (60+)
 *   - Same derivation path m/44'/60'/0'/0/{index} works on every EVM chain
 *   - Same 0x address works on Ethereum, BSC, Polygon, Arbitrum, Base, etc.
 *   - Adding a new EVM chain = add one object to CHAINS, zero other changes
 *
 * Phase 2 (future): Non-EVM chains (Solana, Bitcoin, TRON, Cosmos, etc.)
 *   - Each needs its own derivation path and address format
 *   - Planned: separate services per ecosystem (solana.ts, bitcoin.ts, tron.ts)
 *
 * Etherscan V2 unified endpoint:
 *   https://api.etherscan.io/v2/api?chainid={chainId}&module=...&apikey=KEY
 *   chainid param routes the request to the correct chain explorer.
 *   No per-chain API keys needed — one key governs all.
 */

import { ethers, JsonRpcProvider, Contract, HDNodeWallet } from "ethers";
import { redis, CacheKeys, CacheTTL } from "@/lib/redis/client";
import Big from "big.js";

/* ─── Etherscan V2 unified API ───────────────────────────────────────────── */

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";

interface EtherscanV2Response<T> {
  status: string;
  message: string;
  result: T;
}

/**
 * Make a call to the Etherscan V2 unified API.
 * chainid param determines which chain the request targets.
 * Same base URL and same API key for every single EVM chain.
 */
async function etherscanV2<T>(
  chainId: number,
  params: Record<string, string>
): Promise<T> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("ETHERSCAN_API_KEY is not set. Get one free key from etherscan.io — it covers all chains.");
  }

  const url = new URL(ETHERSCAN_V2_BASE);
  url.searchParams.set("chainid", String(chainId));
  url.searchParams.set("apikey", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10_000),
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Etherscan V2 HTTP ${res.status} for chain ${chainId}`);
  }

  const json = (await res.json()) as EtherscanV2Response<T>;

  // Etherscan returns status "0" with message "No transactions found" as a valid
  // non-error response — only throw on actual errors
  if (json.status !== "1" && json.message !== "OK" && json.message !== "No transactions found") {
    throw new Error(`Etherscan V2 [chain ${chainId}]: ${json.message}`);
  }

  return json.result;
}

/* ─── Chain config type ──────────────────────────────────────────────────── */

export interface ChainConfig {
  // Identity
  id: number;
  name: string;
  nativeSymbol: string;         // ETH, BNB, MATIC, etc.
  // RPC — used for direct on-chain reads (balance, tx receipt)
  rpcUrl: string;
  // Explorer — for display links only, API calls go through V2 unified endpoint
  explorerUrl: string;
  explorerTxPath: string;       // e.g. "/tx/" — appended to explorerUrl for tx links
  // Key stablecoin addresses on this chain
  usdtAddress: string | null;
  usdcAddress: string | null;
  // Deposit UX config
  confirmationsRequired: number;
  arrivalTime: string;
  approxFee: string;
  recommended: boolean;
  warning: string | null;
}

/* ─── EVM chain registry ─────────────────────────────────────────────────── */
/*
 * These are the EVM chains enabled at launch.
 * To add any new Etherscan-supported chain:
 *   1. Add it here with its chainId, RPC URL, and token addresses
 *   2. Add its RPC URL to .env.example and .env.local
 *   3. Done — Etherscan V2 handles explorer lookups automatically
 *
 * Full list of Etherscan V2 supported chains:
 *   https://docs.etherscan.io/etherscan-v2/getting-started/supported-chains
 */
export const CHAINS: Record<number, ChainConfig> = {

  /* ── Ethereum Mainnet ──────────────────────────────────────────────────── */
  1: {
    id: 1, name: "Ethereum", nativeSymbol: "ETH",
    rpcUrl: process.env.ETH_RPC_URL ?? "https://eth.llamarpc.com",
    explorerUrl: "https://etherscan.io", explorerTxPath: "/tx/",
    usdtAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    confirmationsRequired: 12,
    arrivalTime: "~7 minutes", approxFee: "~$2-5",
    recommended: false, warning: "High gas fees",
  },

  /* ── BNB Smart Chain ───────────────────────────────────────────────────── */
  56: {
    id: 56, name: "BNB Smart Chain", nativeSymbol: "BNB",
    rpcUrl: process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org",
    explorerUrl: "https://bscscan.com", explorerTxPath: "/tx/",
    usdtAddress: "0x55d398326f99059fF775485246999027B3197955",
    usdcAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    confirmationsRequired: 15,
    arrivalTime: "~1 minute", approxFee: "~$0.10",
    recommended: true, warning: null,
  },

  /* ── Polygon ───────────────────────────────────────────────────────────── */
  137: {
    id: 137, name: "Polygon", nativeSymbol: "POL",
    rpcUrl: process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com",
    explorerUrl: "https://polygonscan.com", explorerTxPath: "/tx/",
    usdtAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    usdcAddress: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    confirmationsRequired: 128,
    arrivalTime: "~2 minutes", approxFee: "~$0.01",
    recommended: true, warning: null,
  },

  /* ── Arbitrum One ──────────────────────────────────────────────────────── */
  42161: {
    id: 42161, name: "Arbitrum One", nativeSymbol: "ETH",
    rpcUrl: process.env.ARBITRUM_RPC_URL ?? "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io", explorerTxPath: "/tx/",
    usdtAddress: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    confirmationsRequired: 1,
    arrivalTime: "~1 minute", approxFee: "~$0.05",
    recommended: true, warning: null,
  },

  /* ── Optimism ──────────────────────────────────────────────────────────── */
  10: {
    id: 10, name: "Optimism", nativeSymbol: "ETH",
    rpcUrl: process.env.OPTIMISM_RPC_URL ?? "https://mainnet.optimism.io",
    explorerUrl: "https://optimistic.etherscan.io", explorerTxPath: "/tx/",
    usdtAddress: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    confirmationsRequired: 1,
    arrivalTime: "~1 minute", approxFee: "~$0.05",
    recommended: true, warning: null,
  },

  /* ── Base ──────────────────────────────────────────────────────────────── */
  8453: {
    id: 8453, name: "Base", nativeSymbol: "ETH",
    rpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
    explorerUrl: "https://basescan.org", explorerTxPath: "/tx/",
    usdtAddress: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    confirmationsRequired: 1,
    arrivalTime: "~1 minute", approxFee: "~$0.02",
    recommended: true, warning: null,
  },

  /* ── Fantom ────────────────────────────────────────────────────────────── */
  250: {
    id: 250, name: "Fantom", nativeSymbol: "FTM",
    rpcUrl: process.env.FANTOM_RPC_URL ?? "https://rpc.ftm.tools",
    explorerUrl: "https://ftmscan.com", explorerTxPath: "/tx/",
    usdtAddress: "0x049d68029688eAbF473097a2fC38ef61633A3C7A",
    usdcAddress: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
    confirmationsRequired: 5,
    arrivalTime: "~2 minutes", approxFee: "~$0.01",
    recommended: false, warning: "Lower liquidity",
  },

  /* ── Avalanche C-Chain ─────────────────────────────────────────────────── */
  43114: {
    id: 43114, name: "Avalanche", nativeSymbol: "AVAX",
    rpcUrl: process.env.AVALANCHE_RPC_URL ?? "https://api.avax.network/ext/bc/C/rpc",
    explorerUrl: "https://snowtrace.io", explorerTxPath: "/tx/",
    usdtAddress: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    confirmationsRequired: 1,
    arrivalTime: "~2 minutes", approxFee: "~$0.05",
    recommended: false, warning: null,
  },

  /* ── Linea ─────────────────────────────────────────────────────────────── */
  59144: {
    id: 59144, name: "Linea", nativeSymbol: "ETH",
    rpcUrl: process.env.LINEA_RPC_URL ?? "https://rpc.linea.build",
    explorerUrl: "https://lineascan.build", explorerTxPath: "/tx/",
    usdtAddress: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
    usdcAddress: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
    confirmationsRequired: 1,
    arrivalTime: "~1 minute", approxFee: "~$0.02",
    recommended: false, warning: null,
  },

  /* ── zkSync Era ────────────────────────────────────────────────────────── */
  324: {
    id: 324, name: "zkSync Era", nativeSymbol: "ETH",
    rpcUrl: process.env.ZKSYNC_RPC_URL ?? "https://mainnet.era.zksync.io",
    explorerUrl: "https://era.zksync.network", explorerTxPath: "/tx/",
    usdtAddress: "0x493257fD37EDB34451f62EDf8D2a0C418852bA4C",
    usdcAddress: "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4",
    confirmationsRequired: 1,
    arrivalTime: "~1 minute", approxFee: "~$0.02",
    recommended: false, warning: null,
  },

  /* ── Scroll ────────────────────────────────────────────────────────────── */
  534352: {
    id: 534352, name: "Scroll", nativeSymbol: "ETH",
    rpcUrl: process.env.SCROLL_RPC_URL ?? "https://rpc.scroll.io",
    explorerUrl: "https://scrollscan.com", explorerTxPath: "/tx/",
    usdtAddress: "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df",
    usdcAddress: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
    confirmationsRequired: 1,
    arrivalTime: "~1 minute", approxFee: "~$0.02",
    recommended: false, warning: null,
  },

  /* ── Mantle ────────────────────────────────────────────────────────────── */
  5000: {
    id: 5000, name: "Mantle", nativeSymbol: "MNT",
    rpcUrl: process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz",
    explorerUrl: "https://mantlescan.xyz", explorerTxPath: "/tx/",
    usdtAddress: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
    usdcAddress: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
    confirmationsRequired: 1,
    arrivalTime: "~1 minute", approxFee: "~$0.01",
    recommended: false, warning: null,
  },

  /* ── Gnosis Chain ──────────────────────────────────────────────────────── */
  100: {
    id: 100, name: "Gnosis", nativeSymbol: "xDAI",
    rpcUrl: process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com",
    explorerUrl: "https://gnosisscan.io", explorerTxPath: "/tx/",
    usdtAddress: null, // USDT not natively on Gnosis
    usdcAddress: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83",
    confirmationsRequired: 12,
    arrivalTime: "~1 minute", approxFee: "~$0.001",
    recommended: false, warning: null,
  },

  /* ── Celo ──────────────────────────────────────────────────────────────── */
  42220: {
    id: 42220, name: "Celo", nativeSymbol: "CELO",
    rpcUrl: process.env.CELO_RPC_URL ?? "https://forno.celo.org",
    explorerUrl: "https://celoscan.io", explorerTxPath: "/tx/",
    usdtAddress: null,
    usdcAddress: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    confirmationsRequired: 3,
    arrivalTime: "~5 seconds", approxFee: "~$0.001",
    recommended: false, warning: null,
  },
};

/* ─── Chain sets ─────────────────────────────────────────────────────────── */

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS).map(Number);
export const DEFAULT_CHAIN_ID = 56; // BSC — cheapest for most Kenyan users

/**
 * Chains that are "active" in the deposit selector — shown to users.
 * Others are registered but hidden until we enable them.
 * Toggle by moving chain IDs between the sets.
 */
export const ACTIVE_DEPOSIT_CHAIN_IDS = new Set([
  1,     // Ethereum
  56,    // BSC ← default
  137,   // Polygon
  42161, // Arbitrum
  10,    // Optimism
  8453,  // Base
  250,   // Fantom
  43114, // Avalanche
]);

export function isChainActive(chainId: number): boolean {
  return ACTIVE_DEPOSIT_CHAIN_IDS.has(chainId);
}

export function getChain(chainId: number): ChainConfig {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`Unsupported chain: ${chainId}. Add it to CHAINS in blockchain.ts`);
  return chain;
}

/* ─── Explorer URL helpers ───────────────────────────────────────────────── */

export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const chain = CHAINS[chainId];
  if (!chain) return `https://etherscan.io/tx/${txHash}`;
  return `${chain.explorerUrl}${chain.explorerTxPath}${txHash}`;
}

export function getExplorerAddressUrl(chainId: number, address: string): string {
  const chain = CHAINS[chainId];
  if (!chain) return `https://etherscan.io/address/${address}`;
  return `${chain.explorerUrl}/address/${address}`;
}

/* ─── Provider pool ──────────────────────────────────────────────────────── */

const providers = new Map<number, JsonRpcProvider>();

export function getProvider(chainId: number): JsonRpcProvider {
  if (providers.has(chainId)) return providers.get(chainId)!;
  const chain = getChain(chainId);
  const provider = new JsonRpcProvider(chain.rpcUrl);
  providers.set(chainId, provider);
  return provider;
}

/* ─── ERC-20 ABI ─────────────────────────────────────────────────────────── */

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

/* ─── Deposit network selector ───────────────────────────────────────────── */

export interface DepositNetwork {
  chainId: number;
  name: string;
  networkLabel: string;
  nativeSymbol: string;
  arrivalTime: string;
  approxFee: string;
  minDeposit: string;
  recommended: boolean;
  warning: string | null;
  explorerUrl: string;
}

/**
 * Returns all active deposit networks that support the given asset.
 * Sorted: recommended chains first, then by chain name.
 */
export function getDepositNetworks(asset: string): DepositNetwork[] {
  const assetUpper = asset.toUpperCase();

  const networks = Array.from(ACTIVE_DEPOSIT_CHAIN_IDS)
    .map((chainId) => {
      const chain = CHAINS[chainId];
      if (!chain) return null;

      const hasToken =
        assetUpper === "USDT" ? !!chain.usdtAddress :
        assetUpper === "USDC" ? !!chain.usdcAddress :
        assetUpper === chain.nativeSymbol; // native asset

      if (!hasToken) return null;

      return {
        chainId: chain.id,
        name: chain.name,
        networkLabel: `${chain.name} (${assetUpper})`,
        nativeSymbol: chain.nativeSymbol,
        arrivalTime: chain.arrivalTime,
        approxFee: chain.approxFee,
        minDeposit: `1 ${assetUpper}`,
        recommended: chain.recommended,
        warning: chain.warning,
        explorerUrl: chain.explorerUrl,
      } satisfies DepositNetwork;
    })
    .filter((n): n is DepositNetwork => n !== null);

  // Recommended first, then alphabetical
  return networks.sort((a, b) => {
    if (a.recommended && !b.recommended) return -1;
    if (!a.recommended && b.recommended) return 1;
    return a.name.localeCompare(b.name);
  });
}

/* ─── Balance reads (direct RPC — fast, no API key needed) ──────────────── */

export async function getTokenBalance(
  walletAddress: string,
  tokenAddress: string,
  chainId = DEFAULT_CHAIN_ID
): Promise<string> {
  try {
    const provider = getProvider(chainId);
    const contract = new Contract(tokenAddress, ERC20_ABI, provider);
    const [balance, decimals] = await Promise.all([
      contract.balanceOf(walletAddress) as Promise<bigint>,
      contract.decimals() as Promise<number>,
    ]);
    return ethers.formatUnits(balance, decimals);
  } catch {
    return "0";
  }
}

export async function getNativeBalance(
  walletAddress: string,
  chainId = DEFAULT_CHAIN_ID
): Promise<string> {
  try {
    const provider = getProvider(chainId);
    const balance = await provider.getBalance(walletAddress);
    return ethers.formatEther(balance);
  } catch {
    return "0";
  }
}

/** USDT balance across all active chains simultaneously */
export async function getUsdtBalancesAllChains(
  walletAddress: string
): Promise<Record<number, string>> {
  const results = await Promise.allSettled(
    Array.from(ACTIVE_DEPOSIT_CHAIN_IDS).map(async (chainId) => {
      const chain = CHAINS[chainId];
      if (!chain?.usdtAddress) return { chainId, balance: "0" };
      const balance = await getTokenBalance(walletAddress, chain.usdtAddress, chainId);
      return { chainId, balance };
    })
  );

  return Object.fromEntries(
    results
      .filter((r): r is PromiseFulfilledResult<{ chainId: number; balance: string }> =>
        r.status === "fulfilled"
      )
      .map((r) => [r.value.chainId, r.value.balance])
  );
}

/** Gas token balance across all active chains simultaneously */
export async function getNativeBalancesAllChains(
  walletAddress: string
): Promise<Record<number, string>> {
  const results = await Promise.allSettled(
    Array.from(ACTIVE_DEPOSIT_CHAIN_IDS).map(async (chainId) => {
      const balance = await getNativeBalance(walletAddress, chainId);
      return { chainId, balance };
    })
  );

  return Object.fromEntries(
    results
      .filter((r): r is PromiseFulfilledResult<{ chainId: number; balance: string }> =>
        r.status === "fulfilled"
      )
      .map((r) => [r.value.chainId, r.value.balance])
  );
}

/* ─── Transaction verification (Etherscan V2 + RPC fallback) ────────────── */

interface TxReceipt {
  success: boolean;
  from: string | null;
  to: string | null;
  blockNumber: number | null;
  confirmations: number;
  chainId: number;
  explorerUrl: string;
}

/**
 * Verify a transaction by hash on any supported chain.
 * Primary: Etherscan V2 (more detail, handles reorgs better)
 * Fallback: Direct RPC call (works without API key)
 */
export async function verifyTransaction(
  txHash: string,
  chainId = DEFAULT_CHAIN_ID
): Promise<TxReceipt> {
  const chain = getChain(chainId);
  const explorerUrl = getExplorerTxUrl(chainId, txHash);
  const failed: TxReceipt = {
    success: false, from: null, to: null,
    blockNumber: null, confirmations: 0, chainId, explorerUrl,
  };

  // Try Etherscan V2 first
  try {
    const [txData, receiptData] = await Promise.all([
      etherscanV2<{
        from: string; to: string; blockNumber: string; isError: string;
      }>(chainId, {
        module: "proxy",
        action: "eth_getTransactionByHash",
        txhash: txHash,
      }),
      etherscanV2<{
        status: string; blockNumber: string;
      }>(chainId, {
        module: "proxy",
        action: "eth_getTransactionReceipt",
        txhash: txHash,
      }),
    ]);

    if (!receiptData || !txData) return failed;

    const blockNumber = parseInt(receiptData.blockNumber, 16);
    const provider = getProvider(chainId);
    const currentBlock = await provider.getBlockNumber();
    const confirmations = Math.max(0, currentBlock - blockNumber);
    const required = chain.confirmationsRequired;

    return {
      success: receiptData.status === "0x1" && confirmations >= required,
      from: txData.from,
      to: txData.to,
      blockNumber,
      confirmations,
      chainId,
      explorerUrl,
    };
  } catch {
    // Fallback: direct RPC
  }

  try {
    const provider = getProvider(chainId);
    const [receipt, currentBlock] = await Promise.all([
      provider.getTransactionReceipt(txHash),
      provider.getBlockNumber(),
    ]);

    if (!receipt) return failed;

    const confirmations = Math.max(0, currentBlock - receipt.blockNumber);
    const required = chain.confirmationsRequired;

    return {
      success: receipt.status === 1 && confirmations >= required,
      from: receipt.from,
      to: receipt.to,
      blockNumber: receipt.blockNumber,
      confirmations,
      chainId,
      explorerUrl,
    };
  } catch {
    return failed;
  }
}

/* ─── Deposit detection (Etherscan V2 ERC-20 transfer scan) ─────────────── */

interface IncomingTransfer {
  txHash: string;
  from: string;
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  blockNumber: number;
  timestamp: number;
  chainId: number;
  explorerUrl: string;
}

/**
 * Poll for new ERC-20 deposits to a wallet address on a specific chain.
 * Uses Etherscan V2 token transfer API — same key, same endpoint, any chain.
 * In production this is replaced by Alchemy/Moralis webhooks for real-time delivery.
 */
export async function getIncomingTransfers(
  walletAddress: string,
  chainId: number,
  startBlock = 0
): Promise<IncomingTransfer[]> {
  interface EtherscanTransfer {
    hash: string;
    from: string;
    contractAddress: string;
    tokenSymbol: string;
    value: string;
    tokenDecimal: string;
    blockNumber: string;
    timeStamp: string;
  }

  try {
    const transfers = await etherscanV2<EtherscanTransfer[]>(chainId, {
      module: "account",
      action: "tokentx",
      address: walletAddress,
      startblock: String(startBlock),
      endblock: "latest",
      sort: "desc",
      offset: "50",
    });

    if (!Array.isArray(transfers)) return [];

    return transfers
      .filter((t) =>
        t.to?.toLowerCase() === walletAddress.toLowerCase() &&
        (t.tokenSymbol === "USDT" || t.tokenSymbol === "USDC")
      )
      .map((t) => ({
        txHash: t.hash,
        from: t.from,
        tokenAddress: t.contractAddress,
        tokenSymbol: t.tokenSymbol,
        amount: ethers.formatUnits(t.value, parseInt(t.tokenDecimal)),
        blockNumber: parseInt(t.blockNumber),
        timestamp: parseInt(t.timeStamp) * 1000,
        chainId,
        explorerUrl: getExplorerTxUrl(chainId, t.hash),
      }));
  } catch {
    return [];
  }
}

/**
 * Scan ALL active chains for incoming transfers to a wallet.
 * Used by the sweep job and deposit detection polling.
 */
export async function getIncomingTransfersAllChains(
  walletAddress: string,
  startBlock: Partial<Record<number, number>> = {}
): Promise<IncomingTransfer[]> {
  const results = await Promise.allSettled(
    Array.from(ACTIVE_DEPOSIT_CHAIN_IDS).map((chainId) =>
      getIncomingTransfers(
        walletAddress,
        chainId,
        startBlock[chainId] ?? 0
      )
    )
  );

  return results
    .filter((r): r is PromiseFulfilledResult<IncomingTransfer[]> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/* ─── Contract info (Etherscan V2) ──────────────────────────────────────── */

interface ContractInfo {
  name: string;
  symbol: string;
  decimals: number;
  isVerified: boolean;
  isProxy: boolean;
  implementationAddress: string | null;
}

export async function getContractInfo(
  tokenAddress: string,
  chainId = DEFAULT_CHAIN_ID
): Promise<ContractInfo | null> {
  try {
    const [abiResult, sourceResult] = await Promise.allSettled([
      etherscanV2<string>(chainId, {
        module: "contract",
        action: "getabi",
        address: tokenAddress,
      }),
      etherscanV2<Array<{
        ContractName: string;
        Implementation: string;
        Proxy: string;
      }>>(chainId, {
        module: "contract",
        action: "getsourcecode",
        address: tokenAddress,
      }),
    ]);

    const isVerified = abiResult.status === "fulfilled" && !!abiResult.value;
    const source = sourceResult.status === "fulfilled" ? sourceResult.value?.[0] : null;

    // Read ERC-20 metadata via RPC
    const provider = getProvider(chainId);
    const contract = new Contract(tokenAddress, ERC20_ABI, provider);
    const [name, symbol, decimals] = await Promise.all([
      (contract.name() as Promise<string>).catch(() => "Unknown"),
      (contract.symbol() as Promise<string>).catch(() => "???"),
      (contract.decimals() as Promise<number>).catch(() => 18),
    ]);

    return {
      name,
      symbol,
      decimals,
      isVerified,
      isProxy: source?.Proxy === "1",
      implementationAddress: source?.Implementation || null,
    };
  } catch {
    return null;
  }
}

/* ─── Gas estimation ─────────────────────────────────────────────────────── */

export async function estimateTransferGas(
  chainId: number,
  tokenAddress: string,
  from: string,
  to: string,
  amount: string,
  decimals = 6
): Promise<{ gasLimit: bigint; gasPriceWei: bigint; estimatedCostEth: string }> {
  const provider = getProvider(chainId);
  const contract = new Contract(tokenAddress, ERC20_ABI, provider);

  const amountWei = ethers.parseUnits(amount, decimals);
  const [gasLimit, feeData] = await Promise.all([
    contract.transfer.estimateGas(to, amountWei, { from }),
    provider.getFeeData(),
  ]);

  const gasPriceWei = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
  const costWei = gasLimit * gasPriceWei;
  const estimatedCostEth = ethers.formatEther(costWei);

  return { gasLimit, gasPriceWei, estimatedCostEth };
}

/* ─── BSC DEX price oracle (PancakeSwap V2) ──────────────────────────────── */

const PANCAKE_V2_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDT_BSC = CHAINS[56]!.usdtAddress!;

const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
];
const PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

export async function getBscTokenPrice(tokenAddress: string): Promise<string> {
  const cacheKey = CacheKeys.tokenPrice(tokenAddress);
  const cached = await redis.get<string>(cacheKey);
  if (cached) return cached;

  try {
    const provider = getProvider(56);
    const factory = new Contract(PANCAKE_V2_FACTORY, FACTORY_ABI, provider);

    // Try direct USDT pair first
    const directPair: string = await factory.getPair(tokenAddress, USDT_BSC);
    let price = "0";

    if (directPair !== ethers.ZeroAddress) {
      price = await _getPriceFromPair(provider, directPair, tokenAddress);
    } else {
      // Route through WBNB
      const [bnbPair, bnbUsdtPair]: [string, string] = await Promise.all([
        factory.getPair(tokenAddress, WBNB),
        factory.getPair(WBNB, USDT_BSC),
      ]);

      if (bnbPair !== ethers.ZeroAddress && bnbUsdtPair !== ethers.ZeroAddress) {
        const bnbPrice = await _getPriceFromPair(provider, bnbPair, tokenAddress, WBNB);
        const usdtPerBnb = await _getPriceFromPair(provider, bnbUsdtPair, WBNB, USDT_BSC);

        if (parseFloat(bnbPrice) > 0 && parseFloat(usdtPerBnb) > 0) {
          price = new Big(bnbPrice).times(usdtPerBnb).toFixed(8);
        }
      }
    }

    if (price !== "0") {
      await redis.set(cacheKey, price, { ex: CacheTTL.tokenPrice });
    }
    return price;
  } catch {
    return "0";
  }
}

async function _getPriceFromPair(
  provider: JsonRpcProvider,
  pairAddress: string,
  tokenIn: string,
  tokenOut?: string
): Promise<string> {
  const pair = new Contract(pairAddress, PAIR_ABI, provider);
  const [reserves, token0] = await Promise.all([
    pair.getReserves() as Promise<[bigint, bigint, number]>,
    pair.token0() as Promise<string>,
  ]);

  const isToken0 = token0.toLowerCase() === tokenIn.toLowerCase();
  const reserveIn = isToken0 ? reserves[0] : reserves[1];
  const reserveOut = isToken0 ? reserves[1] : reserves[0];

  if (reserveIn === 0n) return "0";
  return new Big(reserveOut.toString()).div(reserveIn.toString()).toFixed(8);
}

/* ─── Swap quote (BSC / PancakeSwap V2) ─────────────────────────────────── */

export interface SwapQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  price: string;
  priceImpact: string;
  fee: string;
  route: string[];
  chainId: number;
}

export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  chainId = DEFAULT_CHAIN_ID
): Promise<SwapQuote> {
  if (chainId !== 56) {
    throw new Error(`DEX swap not yet supported on chain ${chainId}. BSC only for now.`);
  }

  const provider = getProvider(56);
  const factory = new Contract(PANCAKE_V2_FACTORY, FACTORY_ABI, provider);
  const directPair: string = await factory.getPair(tokenIn, tokenOut);

  let amountOut = "0";
  let priceImpact = "0";
  let route: string[];

  if (directPair !== ethers.ZeroAddress) {
    const result = await _getAmountOut(provider, directPair, tokenIn, tokenOut, amountIn);
    amountOut = result.amountOut;
    priceImpact = result.priceImpact;
    route = [tokenIn, tokenOut];
  } else {
    const [p1, p2]: [string, string] = await Promise.all([
      factory.getPair(tokenIn, WBNB),
      factory.getPair(WBNB, tokenOut),
    ]);
    if (p1 === ethers.ZeroAddress || p2 === ethers.ZeroAddress) {
      throw new Error("No liquidity route found for this pair on BSC PancakeSwap");
    }
    const hop1 = await _getAmountOut(provider, p1, tokenIn, WBNB, amountIn);
    const hop2 = await _getAmountOut(provider, p2, WBNB, tokenOut, hop1.amountOut);
    amountOut = hop2.amountOut;
    priceImpact = new Big(hop1.priceImpact).plus(hop2.priceImpact).toFixed(2);
    route = [tokenIn, WBNB, tokenOut];
  }

  const fee = new Big(amountIn).times("0.0025").toFixed(8); // 0.25% PancakeSwap fee

  return {
    tokenIn, tokenOut, amountIn, amountOut,
    price: parseFloat(amountIn) > 0
      ? new Big(amountOut).div(amountIn).toFixed(8)
      : "0",
    priceImpact, fee, route, chainId,
  };
}

async function _getAmountOut(
  provider: JsonRpcProvider,
  pairAddress: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: string
): Promise<{ amountOut: string; priceImpact: string }> {
  const pair = new Contract(pairAddress, PAIR_ABI, provider);
  const [reserves, token0] = await Promise.all([
    pair.getReserves() as Promise<[bigint, bigint, number]>,
    pair.token0() as Promise<string>,
  ]);

  const isToken0In = token0.toLowerCase() === tokenIn.toLowerCase();
  const reserveIn = isToken0In ? reserves[0] : reserves[1];
  const reserveOut = isToken0In ? reserves[1] : reserves[0];

  const inContract = new Contract(tokenIn, ERC20_ABI, provider);
  const decimalsIn: number = await inContract.decimals();
  const amountInWei = ethers.parseUnits(amountIn, decimalsIn);

  const amountInWithFee = amountInWei * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  const amountOutWei = numerator / denominator;

  const outContract = new Contract(tokenOut, ERC20_ABI, provider);
  const decimalsOut: number = await outContract.decimals();
  const amountOut = ethers.formatUnits(amountOutWei, decimalsOut);

  const spotPrice = reserveIn > 0n
    ? new Big(reserveOut.toString()).div(reserveIn.toString())
    : new Big(0);
  const execPrice = parseFloat(amountIn) > 0
    ? new Big(amountOut).div(amountIn)
    : new Big(0);
  const priceImpact = spotPrice.gt(0)
    ? spotPrice.minus(execPrice).div(spotPrice).times(100).abs().toFixed(2)
    : "0";

  return { amountOut, priceImpact };
}

/* ─── HD Wallet derivation ───────────────────────────────────────────────── */

/**
 * Derive the deposit address for a user.
 * Because all EVM chains use the same address format, this address
 * works on every chain in CHAINS simultaneously.
 */
export function deriveDepositAddress(hdIndex: number): string {
  const seed = process.env.MASTER_SEED_PHRASE;
  if (!seed) throw new Error("MASTER_SEED_PHRASE is not configured");
  const wallet = HDNodeWallet.fromPhrase(seed, undefined, `m/44'/60'/0'/0/${hdIndex}`);
  return wallet.address;
}

export function deriveWallet(hdIndex: number): HDNodeWallet {
  const seed = process.env.MASTER_SEED_PHRASE;
  if (!seed) throw new Error("MASTER_SEED_PHRASE is not configured");
  return HDNodeWallet.fromPhrase(seed, undefined, `m/44'/60'/0'/0/${hdIndex}`);
}

/* ─── Backwards-compat aliases ───────────────────────────────────────────── */

export const getBnbBalance = (address: string) => getNativeBalance(address, 56);
export const getTokenPrice = getBscTokenPrice;
export const TOKENS = {
  WBNB,
  USDT: USDT_BSC,
  USDC: CHAINS[56]!.usdcAddress ?? "",
};

/* ─── EVM Withdrawal — send token or native coin from hot wallet ─────────── */

/**
 * Send an EVM withdrawal from the exchange hot wallet.
 * Called by the withdrawal queue processor in the cron endpoint.
 *
 * @param chainId     EVM chain ID (56 = BSC, 1 = ETH, etc.)
 * @param toAddress   Recipient wallet address
 * @param amount      Amount as a decimal string (e.g. "10.5")
 * @param asset       Token symbol (e.g. "USDT", "USDC", "BNB", "ETH")
 * @returns           Transaction hash
 */
export async function sendEvmWithdrawal(
  chainId: number,
  toAddress: string,
  amount: string,
  asset: string
): Promise<string> {
  const chain = getChain(chainId);
  const provider = getProvider(chainId);

  // Hot wallet = HD index 0 (the exchange operational wallet)
  const HOT_WALLET_INDEX = 0;
  const hotWallet = deriveWallet(HOT_WALLET_INDEX).connect(provider);
  const amountBig = ethers.parseUnits(amount, 18); // will re-parse below with correct decimals

  // ── Native coin withdrawal (BNB, ETH, MATIC, etc.) ──────────────────────
  const nativeSymbol = chain.nativeSymbol.toUpperCase();
  if (asset.toUpperCase() === nativeSymbol) {
    const amountWei = ethers.parseEther(amount);

    // Estimate gas, add 20% buffer
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? ethers.parseUnits("5", "gwei");

    const tx = await hotWallet.sendTransaction({
      to: toAddress,
      value: amountWei,
      gasPrice,
    });

    const receipt = await tx.wait(1);
    if (!receipt || receipt.status === 0) {
      throw new Error(`Native transfer failed on chain ${chainId}: tx ${tx.hash}`);
    }
    return tx.hash;
  }

  // ── ERC-20 token withdrawal ──────────────────────────────────────────────
  // Look up contract address for this asset on this chain
  let tokenAddress: string | undefined;

  if (asset.toUpperCase() === "USDT") {
    tokenAddress = chain.usdtAddress;
  } else if (asset.toUpperCase() === "USDC") {
    tokenAddress = chain.usdcAddress;
  } else {
    // Look up from DB if not a standard token
    const { getDb } = await import("@/server/db/client");
    const db = getDb();
    const { data: tokenRow } = await db
      .from("tokens")
      .select("addresses")
      .contains("chain_ids", [chainId])
      .filter("symbol", "ilike", asset)
      .maybeSingle();

    if (tokenRow?.addresses) {
      const addrs = tokenRow.addresses as Record<string, string>;
      tokenAddress = addrs[String(chainId)];
    }
  }

  if (!tokenAddress) {
    throw new Error(`No contract address found for ${asset} on chain ${chainId}`);
  }

  // Fetch decimals from contract
  const ERC20_MINIMAL = [
    "function decimals() view returns (uint8)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
  ];

  const contract = new Contract(tokenAddress, ERC20_MINIMAL, hotWallet);
  const decimals: number = await contract.decimals();
  const amountWei = ethers.parseUnits(amount, decimals);

  // Sanity-check hot wallet balance before sending
  const balance: bigint = await contract.balanceOf(hotWallet.address);
  if (balance < amountWei) {
    throw new Error(
      `Hot wallet has insufficient ${asset} on chain ${chainId}. ` +
      `Have: ${ethers.formatUnits(balance, decimals)}, need: ${amount}`
    );
  }

  // Estimate gas with 20% buffer
  let gasLimit: bigint;
  try {
    const estimated: bigint = await contract.transfer.estimateGas(toAddress, amountWei);
    gasLimit = (estimated * 120n) / 100n;
  } catch {
    gasLimit = 100_000n; // safe fallback for ERC-20 transfers
  }

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? ethers.parseUnits("5", "gwei");

  const tx = await contract.transfer(toAddress, amountWei, { gasLimit, gasPrice });
  const receipt = await tx.wait(1);

  if (!receipt || receipt.status === 0) {
    throw new Error(`ERC-20 transfer failed on chain ${chainId}: tx ${tx.hash}`);
  }

  return tx.hash as string;
}
