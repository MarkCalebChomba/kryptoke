"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/lib/hooks/useWallet";
import { useWithdrawChains, useWithdrawFeeInfo } from "@/lib/hooks/useDepositAddress";
import { PinPad } from "@/components/auth/PinPad";
import { SkeletonCoinRow } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils/cn";
import { sanitizeNumberInput, formatKes } from "@/lib/utils/formatters";
import { subtract, lt } from "@/lib/utils/money";
import { IconCheck, IconX, IconChevronRight, IconMpesa } from "@/components/icons";
import { useToastActions } from "@/components/shared/ToastContainer";
import { apiGet, apiPost } from "@/lib/api/client";
import { usePrices, useAuth } from "@/lib/store";
import type { Balance } from "@/types";
import Big from "big.js";

type WithdrawView =
  | "method_select"    // M-Pesa vs On-chain
  | "mpesa_token"      // pick token to convert to KES
  | "mpesa_amount"     // enter KES amount
  | "mpesa_confirm"    // confirm breakdown
  | "crypto_token"     // pick token for on-chain
  | "crypto_chain"     // pick chain
  | "crypto_address"   // enter address + amount
  | "pin"
  | "queued"           // queued with cancel option
  | "success"
  | "failed";

// All tokens shown with icon
// All tokens available for withdrawal — sourced from Binance + OKX spot pairs, deduplicated.
// OKX format: BTC-USDT → normalised to BTC. Binance format: BTCUSDT → BTC.
// Stablecoins treated separately (USDT is the primary, KES via M-Pesa).
// Sorted: major L1s first, then DeFi, L2, meme, AI, gaming, infrastructure.
const ALL_TOKENS: Array<{ symbol: string; name: string; color: string; iconUrl: string }> = [
  // ── Stablecoins ─────────────────────────────────────────────────────────
  { symbol: "USDT",  name: "Tether USD",         color: "#26A17B", iconUrl: "https://assets.coingecko.com/coins/images/325/thumb/Tether.png" },
  // ── Major L1s ───────────────────────────────────────────────────────────
  { symbol: "BTC",   name: "Bitcoin",             color: "#F7931A", iconUrl: "https://assets.coingecko.com/coins/images/1/thumb/bitcoin.png" },
  { symbol: "ETH",   name: "Ethereum",            color: "#627EEA", iconUrl: "https://assets.coingecko.com/coins/images/279/thumb/ethereum.png" },
  { symbol: "BNB",   name: "BNB",                 color: "#F3BA2F", iconUrl: "https://assets.coingecko.com/coins/images/825/thumb/bnb-icon2_2x.png" },
  { symbol: "SOL",   name: "Solana",              color: "#9945FF", iconUrl: "https://assets.coingecko.com/coins/images/4128/thumb/solana.png" },
  { symbol: "XRP",   name: "XRP",                 color: "#00AAE4", iconUrl: "https://assets.coingecko.com/coins/images/44/thumb/xrp-symbol-white-128.png" },
  { symbol: "ADA",   name: "Cardano",             color: "#0033AD", iconUrl: "https://assets.coingecko.com/coins/images/975/thumb/cardano.png" },
  { symbol: "TRX",   name: "TRON",                color: "#FF0013", iconUrl: "https://assets.coingecko.com/coins/images/1094/thumb/tron-logo.png" },
  { symbol: "AVAX",  name: "Avalanche",           color: "#E84142", iconUrl: "https://assets.coingecko.com/coins/images/12559/thumb/Avalanche_Circle_RedWhite_Trans.png" },
  { symbol: "DOT",   name: "Polkadot",            color: "#E6007A", iconUrl: "https://assets.coingecko.com/coins/images/12171/thumb/polkadot.png" },
  { symbol: "MATIC", name: "Polygon",             color: "#8247E5", iconUrl: "https://assets.coingecko.com/coins/images/4713/thumb/matic-token-icon.png" },
  { symbol: "DOGE",  name: "Dogecoin",            color: "#C3A634", iconUrl: "https://assets.coingecko.com/coins/images/5/thumb/dogecoin.png" },
  { symbol: "LTC",   name: "Litecoin",            color: "#A0A0A0", iconUrl: "https://assets.coingecko.com/coins/images/2/thumb/litecoin.png" },
  { symbol: "BCH",   name: "Bitcoin Cash",        color: "#8DC351", iconUrl: "https://assets.coingecko.com/coins/images/780/thumb/bitcoin-cash-circle.png" },
  { symbol: "XLM",   name: "Stellar",             color: "#7D00FF", iconUrl: "https://assets.coingecko.com/coins/images/100/thumb/Stellar_symbol_black_RGB.png" },
  { symbol: "ATOM",  name: "Cosmos",              color: "#2E3148", iconUrl: "https://assets.coingecko.com/coins/images/1481/thumb/cosmos_hub.png" },
  { symbol: "TON",   name: "TON",                 color: "#0088CC", iconUrl: "https://assets.coingecko.com/coins/images/17980/thumb/ton_symbol.png" },
  { symbol: "NEAR",  name: "NEAR Protocol",       color: "#00C08B", iconUrl: "https://assets.coingecko.com/coins/images/10365/thumb/near.jpg" },
  { symbol: "FIL",   name: "Filecoin",            color: "#0090FF", iconUrl: "https://assets.coingecko.com/coins/images/12817/thumb/filecoin.png" },
  { symbol: "ICP",   name: "Internet Computer",   color: "#F15A29", iconUrl: "https://assets.coingecko.com/coins/images/14495/thumb/Internet_Computer_logo.png" },
  { symbol: "ALGO",  name: "Algorand",            color: "#00B4D8", iconUrl: "https://assets.coingecko.com/coins/images/4380/thumb/download.png" },
  { symbol: "HBAR",  name: "Hedera",              color: "#00ADEF", iconUrl: "https://assets.coingecko.com/coins/images/3688/thumb/hbar.png" },
  { symbol: "VET",   name: "VeChain",             color: "#15BDFF", iconUrl: "https://assets.coingecko.com/coins/images/1167/thumb/VET_Token_Icon.png" },
  { symbol: "ETC",   name: "Ethereum Classic",    color: "#328332", iconUrl: "https://assets.coingecko.com/coins/images/453/thumb/ethereum-classic-logo.png" },
  { symbol: "XTZ",   name: "Tezos",               color: "#A6E000", iconUrl: "https://assets.coingecko.com/coins/images/976/thumb/Tezos-logo.png" },
  { symbol: "XMR",   name: "Monero",              color: "#FF6600", iconUrl: "https://assets.coingecko.com/coins/images/69/thumb/monero_logo.png" },
  { symbol: "ZEC",   name: "Zcash",               color: "#F4B728", iconUrl: "https://assets.coingecko.com/coins/images/486/thumb/circle-zcash-color.png" },
  { symbol: "DASH",  name: "Dash",                color: "#008DE4", iconUrl: "https://assets.coingecko.com/coins/images/19/thumb/dash-logo.png" },
  { symbol: "EGLD",  name: "MultiversX",          color: "#1D4ED8", iconUrl: "https://assets.coingecko.com/coins/images/12335/thumb/egld-token-logo.png" },
  { symbol: "FLOW",  name: "Flow",                color: "#00EF8B", iconUrl: "https://assets.coingecko.com/coins/images/13446/thumb/5f6294c0c7a8cda55cb1c936_Flow_Wordmark.png" },
  { symbol: "THETA", name: "Theta Network",       color: "#2AB8E6", iconUrl: "https://assets.coingecko.com/coins/images/2538/thumb/theta-token-logo.png" },
  { symbol: "KAVA",  name: "Kava",                color: "#FF433E", iconUrl: "https://assets.coingecko.com/coins/images/9761/thumb/kava.png" },
  { symbol: "RUNE",  name: "THORChain",           color: "#33FF99", iconUrl: "https://assets.coingecko.com/coins/images/6595/thumb/Rune200x200.png" },
  { symbol: "ONE",   name: "Harmony",             color: "#00AEE9", iconUrl: "https://assets.coingecko.com/coins/images/4344/thumb/Y88JAze.png" },
  { symbol: "CELO",  name: "Celo",                color: "#FBCC5C", iconUrl: "https://assets.coingecko.com/coins/images/11090/thumb/InjXBNx9_400x400.jpg" },
  // ── DeFi ────────────────────────────────────────────────────────────────
  { symbol: "UNI",   name: "Uniswap",             color: "#FF007A", iconUrl: "https://assets.coingecko.com/coins/images/12504/thumb/uniswap-uni.png" },
  { symbol: "LINK",  name: "Chainlink",           color: "#2A5ADA", iconUrl: "https://assets.coingecko.com/coins/images/877/thumb/chainlink-new-logo.png" },
  { symbol: "AAVE",  name: "Aave",                color: "#B6509E", iconUrl: "https://assets.coingecko.com/coins/images/12645/thumb/AAVE.png" },
  { symbol: "CRV",   name: "Curve DAO",           color: "#840000", iconUrl: "https://assets.coingecko.com/coins/images/12124/thumb/Curve.png" },
  { symbol: "COMP",  name: "Compound",            color: "#00D395", iconUrl: "https://assets.coingecko.com/coins/images/10775/thumb/COMP.png" },
  { symbol: "MKR",   name: "Maker",               color: "#1AAB9B", iconUrl: "https://assets.coingecko.com/coins/images/1364/thumb/Mark_Maker.png" },
  { symbol: "SNX",   name: "Synthetix",           color: "#00D1FF", iconUrl: "https://assets.coingecko.com/coins/images/3406/thumb/SNX.png" },
  { symbol: "CAKE",  name: "PancakeSwap",         color: "#1FC7D4", iconUrl: "https://assets.coingecko.com/coins/images/12632/thumb/pancakeswap-cake-logo.png" },
  { symbol: "SUSHI", name: "SushiSwap",           color: "#FA52A0", iconUrl: "https://assets.coingecko.com/coins/images/12271/thumb/512x512_Logo_no_chop.png" },
  { symbol: "1INCH", name: "1inch",               color: "#94A6C3", iconUrl: "https://assets.coingecko.com/coins/images/13469/thumb/1inch-token.png" },
  { symbol: "LDO",   name: "Lido DAO",            color: "#00A3FF", iconUrl: "https://assets.coingecko.com/coins/images/13573/thumb/Lido_DAO.png" },
  { symbol: "PENDLE",name: "Pendle",              color: "#4ADE80", iconUrl: "https://assets.coingecko.com/coins/images/15069/thumb/Pendle_Logo_Normal-03.png" },
  { symbol: "OSMO",  name: "Osmosis",             color: "#6E26E8", iconUrl: "https://assets.coingecko.com/coins/images/16724/thumb/osmo.png" },
  // ── Layer 2 / Scaling ───────────────────────────────────────────────────
  { symbol: "ARB",   name: "Arbitrum",            color: "#2D374B", iconUrl: "https://assets.coingecko.com/coins/images/16547/thumb/photo_2023-03-29_21.47.00.jpeg" },
  { symbol: "OP",    name: "Optimism",            color: "#FF0420", iconUrl: "https://assets.coingecko.com/coins/images/25244/thumb/Optimism.png" },
  { symbol: "INJ",   name: "Injective",           color: "#00F2FE", iconUrl: "https://assets.coingecko.com/coins/images/12882/thumb/Secondary_Symbol.png" },
  { symbol: "IMX",   name: "Immutable X",         color: "#17B5CB", iconUrl: "https://assets.coingecko.com/coins/images/17233/thumb/imx.png" },
  { symbol: "STRK",  name: "StarkNet",            color: "#FF4C00", iconUrl: "https://assets.coingecko.com/coins/images/26433/thumb/starknet.png" },
  // ── New L1s / Newer ecosystems ──────────────────────────────────────────
  { symbol: "APT",   name: "Aptos",               color: "#00C2A8", iconUrl: "https://assets.coingecko.com/coins/images/26455/thumb/aptos_round.png" },
  { symbol: "SUI",   name: "Sui",                 color: "#6FBCF0", iconUrl: "https://assets.coingecko.com/coins/images/26375/thumb/sui_asset.jpeg" },
  { symbol: "SEI",   name: "Sei",                 color: "#9B1C1C", iconUrl: "https://assets.coingecko.com/coins/images/28205/thumb/Sei_Logo_-_Transparent.png" },
  { symbol: "TIA",   name: "Celestia",            color: "#7B2FBE", iconUrl: "https://assets.coingecko.com/coins/images/31967/thumb/tia.jpg" },
  { symbol: "JUP",   name: "Jupiter",             color: "#C7B299", iconUrl: "https://assets.coingecko.com/coins/images/34529/thumb/jup.png" },
  { symbol: "PYTH",  name: "Pyth Network",        color: "#6C3FC3", iconUrl: "https://assets.coingecko.com/coins/images/31950/thumb/pyth.png" },
  // ── Meme coins ──────────────────────────────────────────────────────────
  { symbol: "SHIB",  name: "Shiba Inu",           color: "#FFA409", iconUrl: "https://assets.coingecko.com/coins/images/11939/thumb/shiba.png" },
  { symbol: "PEPE",  name: "Pepe",                color: "#00B050", iconUrl: "https://assets.coingecko.com/coins/images/29850/thumb/pepe-token.jpeg" },
  { symbol: "WIF",   name: "dogwifhat",           color: "#A36A40", iconUrl: "https://assets.coingecko.com/coins/images/33566/thumb/dogwifhat.png" },
  { symbol: "BONK",  name: "Bonk",                color: "#F4A900", iconUrl: "https://assets.coingecko.com/coins/images/28600/thumb/bonk.jpg" },
  { symbol: "FLOKI", name: "FLOKI",               color: "#F5A623", iconUrl: "https://assets.coingecko.com/coins/images/16746/thumb/PNG_image.png" },
  // ── AI / Data ───────────────────────────────────────────────────────────
  { symbol: "FET",   name: "Fetch.ai",            color: "#1D3557", iconUrl: "https://assets.coingecko.com/coins/images/5681/thumb/Fetch.jpg" },
  { symbol: "RNDR",  name: "Render",              color: "#E84142", iconUrl: "https://assets.coingecko.com/coins/images/11636/thumb/rndr.png" },
  { symbol: "WLD",   name: "Worldcoin",           color: "#000000", iconUrl: "https://assets.coingecko.com/coins/images/31069/thumb/worldcoin.jpeg" },
  { symbol: "GRT",   name: "The Graph",           color: "#6747ED", iconUrl: "https://assets.coingecko.com/coins/images/13397/thumb/Graph_Token.png" },
  { symbol: "AGIX",  name: "SingularityNET",      color: "#7B2FBE", iconUrl: "https://assets.coingecko.com/coins/images/2138/thumb/singularitynet.png" },
  // ── Gaming / Metaverse ──────────────────────────────────────────────────
  { symbol: "AXS",   name: "Axie Infinity",       color: "#0055D5", iconUrl: "https://assets.coingecko.com/coins/images/13029/thumb/axie_infinity_logo.png" },
  { symbol: "SAND",  name: "The Sandbox",         color: "#00ADEF", iconUrl: "https://assets.coingecko.com/coins/images/12129/thumb/sandbox_logo.jpg" },
  { symbol: "MANA",  name: "Decentraland",        color: "#FF2D55", iconUrl: "https://assets.coingecko.com/coins/images/878/thumb/decentraland-mana.png" },
  { symbol: "GMT",   name: "STEPN",               color: "#C8B400", iconUrl: "https://assets.coingecko.com/coins/images/23597/thumb/gmt.png" },
  // ── Exchange tokens ─────────────────────────────────────────────────────
  { symbol: "OKB",   name: "OKB",                 color: "#2354E6", iconUrl: "https://assets.coingecko.com/coins/images/4463/thumb/WeChat_Image_20220118095654.png" },
  { symbol: "CRO",   name: "Cronos",              color: "#002D74", iconUrl: "https://assets.coingecko.com/coins/images/7310/thumb/cro_token_logo.png" },
  // ── Oracle ──────────────────────────────────────────────────────────────
  { symbol: "BAND",  name: "Band Protocol",       color: "#516AFF", iconUrl: "https://assets.coingecko.com/coins/images/9545/thumb/Band_token_blue_violet_token.png" },
  // ── Liquid staking / Yield ──────────────────────────────────────────────
  { symbol: "RPL",   name: "Rocket Pool",         color: "#FF6600", iconUrl: "https://assets.coingecko.com/coins/images/2090/thumb/rocket_pool_%28RPL%29.png" },
  { symbol: "ONDO",  name: "Ondo",                color: "#1447E6", iconUrl: "https://assets.coingecko.com/coins/images/26580/thumb/ONDO.png" },
  { symbol: "ENA",   name: "Ethena",              color: "#6247AA", iconUrl: "https://assets.coingecko.com/coins/images/36530/thumb/ethena.png" },
  { symbol: "NOT",   name: "Notcoin",             color: "#F5C542", iconUrl: "https://assets.coingecko.com/coins/images/36072/thumb/notcoin.webp" },
];

const MEMO_CHAINS = new Set(["XRP", "TON", "XLM"]);

const QUICK_KES_AMOUNTS = [500, 2000, 5000, 20000, 50000, 150000];

interface CryptoWithdrawFormProps {
  initialToken?: string;
  onSuccess?: () => void;
}

export function CryptoWithdrawForm({ initialToken, onSuccess }: CryptoWithdrawFormProps) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const { prices } = usePrices();
  const { user } = useAuth();

  const [view, setView] = useState<WithdrawView>(
    initialToken ? "crypto_chain" : "method_select"
  );

  // Check fund password
  const { data: secStatus } = useQuery({
    queryKey: ["security", "status"],
    queryFn: () => apiGet<{ fundPasswordSet: boolean }>("/account/security-status"),
    staleTime: 60_000,
  });
  const [selectedToken, setSelectedToken]   = useState(initialToken ?? "");
  const [selectedChainId, setSelectedChainId] = useState("");
  const [toAddress, setToAddress]           = useState("");
  const [memo, setMemo]                     = useState("");
  const [amount, setAmount]                 = useState("");      // on-chain amount in token units
  const [kesAmount, setKesAmount]           = useState("");      // M-Pesa KES amount
  const [pinError, setPinError]             = useState<string | null>(null);
  const [txResult, setTxResult]             = useState<{
    id: string; message: string; canCancel: boolean; cancelExpiresAt?: string;
  } | null>(null);

  const { usdtBalance, kesBalance, rate } = useWallet();
  const kesPerUsd = parseFloat(rate?.kesPerUsd ?? "130");

  // All balances for token picker
  const { data: allBalances } = useQuery({
    queryKey: ["wallet", "balances"],
    queryFn: () => apiGet<Balance[]>("/wallet/balances"),
    staleTime: 30_000,
  });

  function getBalance(symbol: string): string {
    if (symbol === "KES")  return kesBalance;
    if (symbol === "USDT") return usdtBalance;
    return allBalances?.find((b) => b.asset === symbol && b.account === "funding")
      ?.amount?.toString() ?? "0";
  }

  function getUsdValue(symbol: string, amount: string): number {
    if (!amount || parseFloat(amount) <= 0) return 0;
    if (symbol === "USDT" || symbol === "USDC") return parseFloat(amount);
    if (symbol === "KES") return parseFloat(amount) / kesPerUsd;
    const price = prices[`${symbol}USDT`] ?? "0";
    return parseFloat(amount) * parseFloat(price);
  }

  function getAssetCostForKes(symbol: string, kes: number): string {
    if (kes <= 0) return "0";
    // Use slightly worse rate (spread applied server-side, but we show approx)
    const usdNeeded = kes / kesPerUsd;
    if (symbol === "USDT" || symbol === "USDC") return usdNeeded.toFixed(6);
    if (symbol === "KES") return kes.toFixed(2);
    const price = parseFloat(prices[`${symbol}USDT`] ?? "0");
    if (price <= 0) return "0";
    return (usdNeeded / price).toFixed(8);
  }

  // Chain list for on-chain withdrawal
  const { data: chains, isLoading: chainsLoading } = useWithdrawChains(
    view === "crypto_chain" ? selectedToken : ""
  );

  // Fee for selected chain
  const { data: feeData } = useWithdrawFeeInfo(
    (view === "crypto_address") ? selectedChainId : null,
    selectedToken
  );

  const fee         = feeData?.feeFlat ?? "0";
  const feeAsset    = feeData?.feeAsset ?? selectedToken;
  const minWithdraw = feeData?.minWithdraw ?? "0";
  const balance     = getBalance(selectedToken);

  const netAmount = amount && parseFloat(amount) > parseFloat(fee)
    ? subtract(amount, fee)
    : "0";

  // M-Pesa mutation — converts ANY token to KES
  const mpesaWithdraw = useMutation({
    mutationFn: (pin: string) =>
      apiPost<{ txId: string; netKes: string; assetDeducted: string; asset: string; message: string }>(
        "/withdraw/mpesa-usdt",
        { kesAmount: parseFloat(kesAmount), asset: selectedToken, phone: user?.phone ?? "", assetPin: pin }
      ),
    onSuccess: (data) => {
      setTxResult({ id: data.txId, message: data.message, canCancel: false });
      setView("success");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      onSuccess?.();
    },
    onError: (err) => {
      setPinError(err instanceof Error ? err.message : "Withdrawal failed");
    },
  });

  // On-chain crypto withdrawal mutation
  const cryptoWithdraw = useMutation({
    mutationFn: (pin: string) =>
      apiPost<{ queueId: string; netAmount: string; cancelExpiresAt: string; requiresAdminApproval: boolean; message: string }>(
        "/withdraw/crypto",
        { asset: selectedToken, chainId: selectedChainId, toAddress, amount, assetPin: pin, memo: memo || undefined }
      ),
    onSuccess: (data) => {
      setTxResult({
        id: data.queueId,
        message: data.message,
        canCancel: !data.requiresAdminApproval,
        cancelExpiresAt: data.cancelExpiresAt,
      });
      setView(data.requiresAdminApproval ? "success" : "queued");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      onSuccess?.();
    },
    onError: (err) => {
      setPinError(err instanceof Error ? err.message : "Withdrawal failed");
    },
  });

  // Cancel on-chain withdrawal
  const cancelWithdraw = useMutation({
    mutationFn: (id: string) => apiPost(`/withdraw/cancel/${id}`, {}),
    onSuccess: () => {
      toast.success("Withdrawal cancelled. Balance restored.");
      setView("crypto_token");
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Cancel failed"),
  });

  function handlePinComplete(pin: string) {
    setPinError(null);
    if (view !== "pin") return;
    if (selectedChainId === "MPESA") {
      mpesaWithdraw.mutate(pin);
    } else {
      cryptoWithdraw.mutate(pin);
    }
  }

  function BackBtn({ to }: { to: WithdrawView }) {
    return (
      <button onClick={() => setView(to)} className="tap-target -ml-1 text-text-muted">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    );
  }

  /* ── PIN ── */
  if (view === "pin") {
    const isMpesa = selectedChainId === "MPESA";
    return (
      <div className="px-4 py-4">
        <PinPad
          onComplete={handlePinComplete}
          onCancel={() => setView(isMpesa ? "mpesa_confirm" : "crypto_address")}
          title="Enter Asset PIN"
          subtitle={isMpesa
            ? `Convert ${getAssetCostForKes(selectedToken, parseFloat(kesAmount))} ${selectedToken} → KSh ${parseFloat(kesAmount).toLocaleString()}`
            : `Withdraw ${amount} ${selectedToken}`}
          error={pinError}
          isLoading={cryptoWithdraw.isPending || mpesaWithdraw.isPending}
        />
      </div>
    );
  }

  /* ── Queued (on-chain with cancel option) ── */
  if (view === "queued") {
    const expiresAt = txResult?.cancelExpiresAt ? new Date(txResult.cancelExpiresAt) : null;
    const minsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 60000)) : 0;
    return (
      <div className="flex flex-col items-center text-center px-6 py-10">
        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-5">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#00E5B4" strokeWidth="1.75"/>
            <path d="M12 6v6l4 2" stroke="#00E5B4" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </div>
        <h3 className="font-syne font-bold text-lg text-text-primary mb-2">Withdrawal queued</h3>
        <p className="font-outfit text-sm text-text-muted leading-relaxed max-w-xs mb-6">
          {txResult?.message}
        </p>
        {txResult?.canCancel && minsLeft > 0 && (
          <button
            onClick={() => cancelWithdraw.mutate(txResult.id)}
            disabled={cancelWithdraw.isPending}
            className="py-3 px-6 rounded-2xl border border-down/40 bg-down/5 font-outfit text-sm text-down font-semibold disabled:opacity-50"
          >
            {cancelWithdraw.isPending ? "Cancelling…" : `Cancel within ${minsLeft} min`}
          </button>
        )}
      </div>
    );
  }

  /* ── Success ── */
  if (view === "success") {
    return (
      <div className="flex flex-col items-center text-center px-6 py-10">
        <div className="w-16 h-16 rounded-full bg-up/10 border border-up/30 flex items-center justify-center mb-5">
          <IconCheck size={28} className="text-up" />
        </div>
        <h3 className="font-syne font-bold text-lg text-text-primary mb-2">
          {selectedChainId === "MPESA" ? "Payment sent" : "Withdrawal submitted"}
        </h3>
        <p className="font-outfit text-sm text-text-muted leading-relaxed max-w-xs">
          {txResult?.message}
        </p>
      </div>
    );
  }

  /* ── Failed ── */
  if (view === "failed") {
    return (
      <div className="flex flex-col items-center text-center px-6 py-10">
        <div className="w-16 h-16 rounded-full bg-down/10 border border-down/30 flex items-center justify-center mb-5">
          <IconX size={28} className="text-down" />
        </div>
        <h3 className="font-syne font-bold text-lg text-text-primary mb-2">Withdrawal failed</h3>
        <p className="font-outfit text-sm text-text-muted mb-5">Your balance has been restored.</p>
        <button onClick={() => setView("method_select")} className="btn-primary max-w-xs w-full">Try Again</button>
      </div>
    );
  }

  /* ── Method select ── */
  if (view === "method_select") {
    return (
      <div className="px-4 py-5">
        <h2 className="font-syne font-bold text-lg text-text-primary mb-2">Withdraw</h2>
        <p className="font-outfit text-sm text-text-muted mb-5">
          Convert any crypto to KES instantly via M-Pesa, or send to an external wallet.
        </p>
        <div className="space-y-3">
          {/* M-Pesa — hero option */}
          <button
            onClick={() => setView("mpesa_token")}
            className="w-full card border-mpesa/40 bg-mpesa/5 flex items-center gap-3 active:scale-[0.98] transition-transform"
          >
            <div className="w-11 h-11 rounded-xl bg-mpesa/15 flex items-center justify-center flex-shrink-0">
              <IconMpesa size={22} className="text-mpesa" />
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <p className="font-outfit font-semibold text-sm text-text-primary">Withdraw via M-Pesa</p>
                <span className="text-[9px] font-bold text-mpesa border border-mpesa/40 px-1.5 py-0.5 rounded-full">INSTANT</span>
              </div>
              <p className="font-outfit text-xs text-text-muted mt-0.5">
                86 coins → KES · 1% fee · Up to KSh 150,000
              </p>
            </div>
            <IconChevronRight size={16} className="text-text-muted" />
          </button>

          {/* On-chain */}
          <button
            onClick={() => setView("crypto_token")}
            className="w-full card flex items-center gap-3 active:scale-[0.98] transition-transform"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#00E5B4" strokeWidth="1.75"/>
                <path d="M7 17l10-10M17 7H9m8 0v8" stroke="#00E5B4" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex-1 text-left">
              <p className="font-outfit font-semibold text-sm text-text-primary">Send to Wallet</p>
              <p className="font-outfit text-xs text-text-muted mt-0.5">86 coins · 20 networks · External wallet</p>
            </div>
            <IconChevronRight size={16} className="text-text-muted" />
          </button>
        </div>
      </div>
    );
  }

  /* ── M-Pesa token picker ── */
  if (view === "mpesa_token") {
    const tokensWithBalance = ALL_TOKENS.filter((t) => t.symbol !== "KES");
    return (
      <div className="px-4 py-5">
        <div className="flex items-center gap-2 mb-4">
          <BackBtn to="method_select" />
          <div>
            <h2 className="font-syne font-bold text-base text-text-primary">Select coin to sell</h2>
            <p className="font-outfit text-xs text-text-muted">You will receive KES via M-Pesa</p>
          </div>
        </div>

        <div className="space-y-0.5 max-h-[60dvh] overflow-y-auto">
          {tokensWithBalance.map((token) => {
            const bal = getBalance(token.symbol);
            const balNum = parseFloat(bal);
            const usdVal = getUsdValue(token.symbol, bal);
            const kesVal = usdVal * kesPerUsd;
            const hasBalance = balNum > 0;
            return (
              <button key={token.symbol}
                onClick={() => {
                  setSelectedToken(token.symbol);
                  setSelectedChainId("MPESA");
                  setView("mpesa_amount");
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl active:bg-bg-surface2 transition-colors"
              >
                <div className="w-9 h-9 rounded-full border border-border flex-shrink-0 overflow-hidden flex items-center justify-center"
                  style={{ backgroundColor: token.color + "18" }}>
                  {token.iconUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={token.iconUrl} alt={token.symbol} className="w-7 h-7 object-cover rounded-full"
                        onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                    : <span className="font-price text-[10px] font-bold" style={{ color: token.color }}>{token.symbol.slice(0,3)}</span>}
                </div>
                <div className="flex-1 text-left">
                  <p className={cn("font-outfit font-semibold text-sm", hasBalance ? "text-text-primary" : "text-text-muted")}>
                    {token.symbol}
                  </p>
                  <p className="font-outfit text-xs text-text-muted">{token.name}</p>
                </div>
                <div className="text-right">
                  <p className={cn("font-price text-sm", hasBalance ? "text-text-primary" : "text-text-muted")}>
                    {balNum.toFixed(balNum < 0.01 && balNum > 0 ? 6 : 4)}
                  </p>
                  {hasBalance && (
                    <p className="font-outfit text-[10px] text-text-muted">
                      ≈ {formatKes(kesVal.toFixed(2))}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── M-Pesa amount entry ── */
  if (view === "mpesa_amount") {
    const assetBalance   = getBalance(selectedToken);
    const assetCost      = getAssetCostForKes(selectedToken, parseFloat(kesAmount) || 0);
    const hasEnough      = parseFloat(assetBalance) >= parseFloat(assetCost);
    const maxKes         = Math.floor(getUsdValue(selectedToken, assetBalance) * kesPerUsd * 0.99);
    const clampedMax     = Math.min(maxKes, 150_000);
    const canContinue    = parseFloat(kesAmount) >= 100 && parseFloat(kesAmount) <= 150_000 && hasEnough;
    const usdtCostApprox = assetCost;

    return (
      <div className="px-4 py-5">
        <div className="flex items-center gap-2 mb-5">
          <BackBtn to="mpesa_token" />
          <div>
            <h2 className="font-syne font-bold text-base text-text-primary">
              Sell {selectedToken} for KES
            </h2>
            <p className="font-outfit text-xs text-text-muted">Receive on M-Pesa: {user?.phone ?? "set phone in settings"}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block font-outfit text-xs text-text-secondary mb-2">Amount to receive (KSh)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-price text-text-muted text-sm">KSh</span>
            <input type="text" inputMode="decimal" value={kesAmount}
              onChange={(e) => setKesAmount(sanitizeNumberInput(e.target.value, 2))}
              className="input-field pl-14 font-price text-xl" placeholder="0" autoFocus />
          </div>

          {/* Quick amounts */}
          <div className="grid grid-cols-3 gap-2 mt-2">
            {QUICK_KES_AMOUNTS.filter((a) => a <= clampedMax + 1).map((a) => (
              <button key={a} onClick={() => setKesAmount(a.toString())}
                className={cn("py-1.5 rounded-lg font-outfit text-xs font-medium border transition-colors",
                  kesAmount === a.toString()
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border text-text-muted")}>
                {a >= 1000 ? `KSh ${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}K` : `KSh ${a}`}
              </button>
            ))}
          </div>

          {/* Max button */}
          {clampedMax > 0 && (
            <button onClick={() => setKesAmount(clampedMax.toString())}
              className="mt-2 text-primary font-outfit text-xs font-semibold">
              Max: {formatKes(clampedMax.toFixed(2))}
            </button>
          )}
        </div>

        {/* Preview */}
        {parseFloat(kesAmount) > 0 && (
          <div className="card-2 space-y-2 mb-4">
            <div className="flex justify-between">
              <span className="font-outfit text-xs text-text-muted">{selectedToken} cost (approx)</span>
              <span className="font-price text-xs text-text-primary">{usdtCostApprox} {selectedToken}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-outfit text-xs text-text-muted">Fee (1%)</span>
              <span className="font-price text-xs text-text-secondary">
                KSh {(parseFloat(kesAmount) * 0.01).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="font-outfit text-xs font-semibold text-text-primary">You receive</span>
              <span className="font-price text-sm text-mpesa font-bold">
                KSh {(parseFloat(kesAmount) * 0.99).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Blockchain fee info — shown low, transparent */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-surface2 border border-border mb-4">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-text-muted flex-shrink-0">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75"/>
            <path d="M12 8v5M12 16v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
          <p className="font-outfit text-[11px] text-text-muted leading-relaxed">
            <span className="text-text-secondary font-semibold">Network processing fee: ~$0.05</span>
            {" "}· Charged on-chain when we convert your {selectedToken}. Already included in the calculation above.
          </p>
        </div>

        {!hasEnough && parseFloat(kesAmount) > 0 && (
          <p className="font-outfit text-xs text-down mb-4">
            Insufficient {selectedToken}. Max you can receive: {formatKes(clampedMax.toFixed(2))}
          </p>
        )}

        <button onClick={() => setView("pin")} disabled={!canContinue}
          className="btn-mpesa disabled:opacity-50">
          Continue to PIN
        </button>
      </div>
    );
  }

  /* ── On-chain token picker ── */
  if (view === "crypto_token") {
    return (
      <div className="px-4 py-5">
        <div className="flex items-center gap-2 mb-4">
          <BackBtn to="method_select" />
          <h2 className="font-syne font-bold text-base text-text-primary">Select coin</h2>
        </div>
        <div className="space-y-0.5 max-h-[60dvh] overflow-y-auto">
          {ALL_TOKENS.filter((t) => t.symbol !== "KES").map((token) => {
            const bal = getBalance(token.symbol);
            const hasBalance = parseFloat(bal) > 0;
            return (
              <button key={token.symbol}
                onClick={() => { setSelectedToken(token.symbol); setView("crypto_chain"); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl active:bg-bg-surface2 transition-colors">
                <div className="w-9 h-9 rounded-full border border-border flex-shrink-0 overflow-hidden flex items-center justify-center"
                  style={{ backgroundColor: token.color + "18" }}>
                  {token.iconUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={token.iconUrl} alt={token.symbol} className="w-7 h-7 object-cover rounded-full"
                        onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                    : <span className="font-price text-[10px] font-bold" style={{ color: token.color }}>{token.symbol.slice(0,3)}</span>}
                </div>
                <div className="flex-1 text-left">
                  <p className={cn("font-outfit font-semibold text-sm", hasBalance ? "text-text-primary" : "text-text-muted")}>
                    {token.symbol}
                  </p>
                  <p className="font-outfit text-xs text-text-muted">{token.name}</p>
                </div>
                <div className="text-right">
                  <p className={cn("font-price text-sm", hasBalance ? "text-text-primary" : "text-text-muted")}>
                    {parseFloat(bal).toFixed(4)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── On-chain chain picker ── */
  if (view === "crypto_chain") {
    return (
      <div className="px-4 py-5">
        <div className="flex items-center gap-2 mb-4">
          <BackBtn to={initialToken ? "method_select" : "crypto_token"} />
          <div>
            <h2 className="font-syne font-bold text-base text-text-primary">Select network</h2>
            <p className="font-outfit text-xs text-text-muted">Withdrawing {selectedToken}</p>
          </div>
        </div>
        {chainsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCoinRow key={i} />)
        ) : (
          <div className="space-y-2">
            {(chains ?? []).map((chain) => (
              <button key={chain.chainId}
                onClick={() => { setSelectedChainId(chain.chainId); setView("crypto_address"); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-border bg-bg-surface2 active:border-primary/40 transition-colors">
                <div className="flex-1 text-left">
                  <p className="font-outfit font-semibold text-sm text-text-primary">{chain.name}</p>
                  <div className="flex gap-3 mt-0.5">
                    <span className="font-outfit text-[10px] text-text-muted">
                      Fee: {chain.fee} {selectedToken}
                    </span>
                    <span className="font-outfit text-[10px] text-text-muted">
                      {chain.arrivalTime}
                    </span>
                    {chain.hasMemo && (
                      <span className="font-outfit text-[10px] text-down font-semibold">Memo required</span>
                    )}
                  </div>
                </div>
                <IconChevronRight size={14} className="text-text-muted" />
              </button>
            ))}
            {(chains ?? []).length === 0 && !chainsLoading && (
              <p className="text-center font-outfit text-sm text-text-muted py-8">
                No networks available for {selectedToken}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── On-chain address + amount ── */
  if (view === "crypto_address") {
    const hasMemo    = MEMO_CHAINS.has(selectedChainId);
    const canContinue =
      toAddress.length >= 10 &&
      (!hasMemo || memo.length > 0) &&
      parseFloat(amount) > parseFloat(minWithdraw) &&
      parseFloat(amount) <= parseFloat(balance) &&
      parseFloat(netAmount) > 0;

    return (
      <div className="px-4 py-5">
        <div className="flex items-center gap-2 mb-5">
          <BackBtn to="crypto_chain" />
          <div>
            <h2 className="font-syne font-bold text-base text-text-primary">
              Withdraw {selectedToken}
            </h2>
            <p className="font-outfit text-xs text-text-muted">{selectedChainId}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">
              Destination address
            </label>
            <input type="text" value={toAddress}
              onChange={(e) => setToAddress(e.target.value.trim())}
              className="input-field font-price text-sm"
              placeholder={`${selectedToken} wallet address`}
              autoComplete="off" autoCorrect="off" spellCheck={false} />
          </div>

          {hasMemo && (
            <div>
              <label className="font-outfit text-xs text-down font-bold mb-1.5 block">
                ⚠ Memo / Destination Tag — REQUIRED
              </label>
              <input type="text" value={memo}
                onChange={(e) => setMemo(e.target.value.trim())}
                className="input-field font-price text-sm border-down/40"
                placeholder="Destination tag / memo"
                autoComplete="off" />
              <p className="font-outfit text-[10px] text-down mt-1 leading-relaxed">
                Missing memo will result in permanent loss of funds. Verify with your destination wallet.
              </p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-outfit text-xs text-text-secondary">Amount</label>
              <span className="font-outfit text-xs text-text-muted">
                Available: {parseFloat(balance).toFixed(6)} {selectedToken}
              </span>
            </div>
            <div className="relative">
              <input type="text" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(sanitizeNumberInput(e.target.value, 8))}
                className="input-field font-price text-lg pr-16"
                placeholder="0.00" />
              <button type="button"
                onClick={() => setAmount(parseFloat(balance) > parseFloat(fee)
                  ? subtract(balance, fee)
                  : "0")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-primary font-outfit text-xs font-bold">
                MAX
              </button>
            </div>
            {parseFloat(amount) > 0 && parseFloat(amount) < parseFloat(minWithdraw) && (
              <p className="font-outfit text-[10px] text-down mt-1">
                Minimum: {minWithdraw} {selectedToken}
              </p>
            )}
          </div>

          {amount && parseFloat(amount) > 0 && (
            <div className="card-2 space-y-1.5">
              <div className="flex justify-between">
                <span className="font-outfit text-xs text-text-muted">You send</span>
                <span className="font-price text-xs text-text-primary">{amount} {selectedToken}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-outfit text-xs text-text-muted">Network fee</span>
                <span className="font-price text-xs text-text-secondary">{fee} {feeAsset}</span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between">
                <span className="font-outfit text-xs font-semibold text-text-primary">Recipient gets</span>
                <span className="font-price text-sm text-up font-bold">{netAmount} {selectedToken}</span>
              </div>
            </div>
          )}

          <div className="card border-gold/20 bg-gold/5">
            <p className="font-outfit text-xs text-gold/90 leading-relaxed">
              Double-check the address. Crypto withdrawals cannot be reversed once broadcast.
            </p>
          </div>

          <button onClick={() => setView("pin")} disabled={!canContinue}
            className="btn-primary disabled:opacity-50">
            Continue to PIN
          </button>
        </div>
      </div>
    );
  }

  return null;
}
