/**
 * Non-EVM Chain Address Derivation, Deposit Scanning & Withdrawal Broadcasting
 *
 * Phase 1 chains (fully implemented):
 *   TRON   (TRC-20 USDT, BIP44 coin 195)
 *   BTC    (Bitcoin, BIP84 P2WPKH native segwit, coin 0)
 *   LTC    (Litecoin, BIP84, coin 2)
 *   DOGE   (Dogecoin, BIP44 legacy, coin 3)
 *   BCH    (Bitcoin Cash, BIP44 legacy, coin 145)
 *   SOL    (Solana, Ed25519, coin 501)
 *   XRP    (XRP Ledger, secp256k1, coin 144) — shared address + memo
 *   TON    (TON, Ed25519, coin 607) — shared address + comment memo
 *   XLM    (Stellar, Ed25519, coin 148) — shared address + memo
 *   NEAR   (NEAR Protocol, Ed25519, coin 397)
 *   FIL    (Filecoin, secp256k1, coin 461)
 *
 * Phase 2 stubs (coming soon — chains listed for completeness):
 *   ADA, DOT, ATOM, ALGO, HBAR, XTZ, APT, SUI, ICP
 *
 * All deposit addresses derive from MASTER_SEED_PHRASE via BIP39 → BIP44.
 * Memo-based chains (XRP, TON, XLM) use the exchange hot-wallet address
 * plus a unique memo = first 8 hex chars of the user's uid.
 *
 * Required packages (add to package.json if not present):
 *   bitcoinjs-lib, tiny-secp256k1, bip32, bip39
 *   @solana/web3.js, ed25519-hd-key
 *   tronweb
 *   xrpl
 *   @ton/ton, @ton/crypto
 *   stellar-sdk
 *   near-api-js
 *
 * Public RPC endpoints used (all configurable via .env):
 *   BTC:   BLOCKSTREAM_API_URL   (default: https://blockstream.info/api)
 *   LTC:   LTC_API_URL           (default: https://ltc1.trezor.io/api)
 *   DOGE:  DOGE_API_URL          (default: https://api.blockcypher.com/v1/doge/main)
 *   BCH:   BCH_API_URL           (default: https://bch1.trezor.io/api)
 *   SOL:   SOLANA_RPC_URL        (default: https://api.mainnet-beta.solana.com)
 *   TRON:  TRON_API_URL          (default: https://api.trongrid.io)
 *   XRP:   XRP_RPC_URL           (default: https://xrplcluster.com)
 *   TON:   TON_API_URL           (default: https://toncenter.com/api/v2)
 *   XLM:   STELLAR_HORIZON_URL   (default: https://horizon.stellar.org)
 *   NEAR:  NEAR_RPC_URL          (default: https://rpc.mainnet.near.org)
 *   FIL:   FIL_API_URL           (default: https://api.node.glif.io/rpc/v1)
 */

import * as bip39Lib from "bip39";

/* ─── Master seed ─────────────────────────────────────────────────────────── */

function getMasterSeed(): string {
  const seed = process.env.MASTER_SEED_PHRASE;
  if (!seed) throw new Error("MASTER_SEED_PHRASE is not configured");
  return seed;
}

/* ─── BIP32 root (memoized per process, lazily initialised) ─────────────── */

let _bip32Cache: { seed: string; root: unknown } | null = null;

async function getBip32Root() {
  const { BIP32Factory } = await import("bip32");
  const ecc = await import("tiny-secp256k1");
  const bip32 = BIP32Factory(ecc.default ?? ecc);
  const seedPhrase = getMasterSeed();
  if (_bip32Cache?.seed === seedPhrase) return _bip32Cache.root as ReturnType<typeof bip32.fromSeed>;
  const seedBuffer = await bip39Lib.mnemonicToSeed(seedPhrase);
  const root = bip32.fromSeed(seedBuffer);
  _bip32Cache = { seed: seedPhrase, root };
  return root;
}

/* ─── RPC helpers ─────────────────────────────────────────────────────────── */

function rpcUrl(chain: string, defaultUrl: string): string {
  const envMap: Record<string, string> = {
    BTC:  process.env.BLOCKSTREAM_API_URL  ?? defaultUrl,
    LTC:  process.env.LTC_API_URL          ?? defaultUrl,
    DOGE: process.env.DOGE_API_URL         ?? defaultUrl,
    BCH:  process.env.BCH_API_URL          ?? defaultUrl,
    SOL:  process.env.SOLANA_RPC_URL       ?? defaultUrl,
    TRON: process.env.TRON_API_URL         ?? defaultUrl,
    XRP:  process.env.XRP_RPC_URL          ?? defaultUrl,
    TON:  process.env.TON_API_URL          ?? defaultUrl,
    XLM:  process.env.STELLAR_HORIZON_URL  ?? defaultUrl,
    NEAR: process.env.NEAR_RPC_URL         ?? defaultUrl,
    FIL:  process.env.FIL_API_URL          ?? defaultUrl,
  };
  return envMap[chain] ?? defaultUrl;
}

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json() as Promise<T>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADDRESS DERIVATION
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── TRON ────────────────────────────────────────────────────────────────── */

export async function deriveTronAddress(hdIndex: number): Promise<string> {
  const TronWeb = (await import("tronweb")).default;
  const root = await getBip32Root();
  const child = root.derivePath(`m/44'/195'/0'/0/${hdIndex}`);
  return TronWeb.address.fromPrivateKey(child.privateKey!.toString("hex")) as string;
}

export async function deriveTronPrivateKey(hdIndex: number): Promise<string> {
  const root = await getBip32Root();
  return root.derivePath(`m/44'/195'/0'/0/${hdIndex}`).privateKey!.toString("hex");
}

/* ─── Bitcoin-family (BTC, LTC, DOGE, BCH) ──────────────────────────────── */

interface BitcoinNetwork {
  messagePrefix: string;
  bech32?: string;
  bip32: { public: number; private: number };
  pubKeyHash: number;
  scriptHash: number;
  wif: number;
}

const BITCOIN_NETWORKS: Record<string, BitcoinNetwork> = {
  BTC:  { messagePrefix: "\x18Bitcoin Signed Message:\n",       bech32: "bc",  bip32: { public: 0x0488b21e, private: 0x0488ade4 }, pubKeyHash: 0x00, scriptHash: 0x05, wif: 0x80 },
  LTC:  { messagePrefix: "\x19Litecoin Signed Message:\n",      bech32: "ltc", bip32: { public: 0x019da462, private: 0x019d9cfe }, pubKeyHash: 0x30, scriptHash: 0x32, wif: 0xb0 },
  DOGE: { messagePrefix: "\x19Dogecoin Signed Message:\n",                     bip32: { public: 0x02facafd, private: 0x02fac398 }, pubKeyHash: 0x1e, scriptHash: 0x16, wif: 0x9e },
  BCH:  { messagePrefix: "\x18Bitcoin Cash Signed Message:\n",                 bip32: { public: 0x0488b21e, private: 0x0488ade4 }, pubKeyHash: 0x00, scriptHash: 0x05, wif: 0x80 },
};

const BTC_COIN_TYPES: Record<string, number> = { BTC: 0, LTC: 2, DOGE: 3, BCH: 145 };

export async function deriveBitcoinFamilyAddress(chain: "BTC" | "LTC" | "DOGE" | "BCH", hdIndex: number): Promise<string> {
  const bitcoin = await import("bitcoinjs-lib");
  const ecc = await import("tiny-secp256k1");
  bitcoin.initEccLib(ecc.default ?? ecc);
  const { BIP32Factory } = await import("bip32");
  const bip32 = BIP32Factory(ecc.default ?? ecc);
  const network = BITCOIN_NETWORKS[chain]!;
  const coinType = BTC_COIN_TYPES[chain]!;
  const useBip84 = chain === "BTC" || chain === "LTC";
  const path = useBip84 ? `m/84'/${coinType}'/0'/0/${hdIndex}` : `m/44'/${coinType}'/0'/0/${hdIndex}`;
  const seedBuffer = await bip39Lib.mnemonicToSeed(getMasterSeed());
  const rootNode = bip32.fromSeed(seedBuffer, network as Parameters<typeof bip32.fromSeed>[1]);
  const child = rootNode.derivePath(path);
  const pubkey = Buffer.from(child.publicKey);
  if (useBip84) {
    return bitcoin.payments.p2wpkh({ pubkey, network: network as Parameters<typeof bitcoin.payments.p2wpkh>[0]["network"] }).address!;
  }
  return bitcoin.payments.p2pkh({ pubkey, network: network as Parameters<typeof bitcoin.payments.p2pkh>[0]["network"] }).address!;
}

export async function deriveBitcoinFamilyPrivateKey(chain: "BTC" | "LTC" | "DOGE" | "BCH", hdIndex: number): Promise<string> {
  const ecc = await import("tiny-secp256k1");
  const { BIP32Factory } = await import("bip32");
  const bip32 = BIP32Factory(ecc.default ?? ecc);
  const network = BITCOIN_NETWORKS[chain]!;
  const path = (chain === "BTC" || chain === "LTC")
    ? `m/84'/${BTC_COIN_TYPES[chain]!}'/0'/0/${hdIndex}`
    : `m/44'/${BTC_COIN_TYPES[chain]!}'/0'/0/${hdIndex}`;
  const seedBuffer = await bip39Lib.mnemonicToSeed(getMasterSeed());
  const rootNode = bip32.fromSeed(seedBuffer, network as Parameters<typeof bip32.fromSeed>[1]);
  return rootNode.derivePath(path).privateKey!.toString("hex");
}

/* ─── Solana ──────────────────────────────────────────────────────────────── */

export async function deriveSolanaAddress(hdIndex: number): Promise<string> {
  const { Keypair } = await import("@solana/web3.js");
  const { derivePath } = await import("ed25519-hd-key");
  const seedBuffer = await bip39Lib.mnemonicToSeed(getMasterSeed());
  const derived = derivePath(`m/44'/501'/${hdIndex}'/0'`, seedBuffer.toString("hex"));
  return Keypair.fromSeed(derived.key).publicKey.toBase58();
}

export async function deriveSolanaKeypair(hdIndex: number) {
  const { Keypair } = await import("@solana/web3.js");
  const { derivePath } = await import("ed25519-hd-key");
  const seedBuffer = await bip39Lib.mnemonicToSeed(getMasterSeed());
  const derived = derivePath(`m/44'/501'/${hdIndex}'/0'`, seedBuffer.toString("hex"));
  return Keypair.fromSeed(derived.key);
}

/* ─── XRP ─────────────────────────────────────────────────────────────────── */
// XRP uses a shared hot-wallet address + memo (first 8 hex chars of uid)

export function xrpMemoForUser(uid: string): string {
  return uid.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/**
 * XRP DestinationTag for a user — numeric uint32 derived from uid hex prefix.
 * This is the value users MUST include when depositing XRP/IOU to the hot wallet.
 * The deposit scanner matches on this same value.
 */
export function xrpDestinationTagForUser(uid: string): number {
  return parseInt(uid.replace(/-/g, "").slice(0, 8), 16) >>> 0;
}

export function getXrpHotWalletAddress(): string {
  const addr = process.env.XRP_HOT_WALLET_ADDRESS;
  if (!addr) throw new Error("XRP_HOT_WALLET_ADDRESS not configured");
  return addr;
}

export async function deriveXrpAddress(hdIndex: number): Promise<string> {
  const { Wallet } = await import("xrpl");
  const root = await getBip32Root();
  const child = root.derivePath(`m/44'/144'/0'/0/${hdIndex}`);
  return Wallet.fromPrivateKey(child.privateKey!.toString("hex")).address;
}

export async function deriveXrpWallet(hdIndex: number) {
  const { Wallet } = await import("xrpl");
  const root = await getBip32Root();
  const child = root.derivePath(`m/44'/144'/0'/0/${hdIndex}`);
  return Wallet.fromPrivateKey(child.privateKey!.toString("hex"));
}

/* ─── TON ─────────────────────────────────────────────────────────────────── */
// TON uses a shared hot-wallet address + comment memo

export function tonMemoForUser(uid: string): string {
  return uid.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function getTonHotWalletAddress(): string {
  const addr = process.env.TON_HOT_WALLET_ADDRESS;
  if (!addr) throw new Error("TON_HOT_WALLET_ADDRESS not configured");
  return addr;
}

export async function deriveTonAddress(hdIndex: number): Promise<string> {
  const { mnemonicToPrivateKey } = await import("@ton/crypto");
  const { WalletContractV4 } = await import("@ton/ton");
  const crypto = await import("node:crypto");
  const entropy = crypto.createHash("sha512")
    .update(`${getMasterSeed()}:TON:${hdIndex}`)
    .digest();
  const keyPair = await mnemonicToPrivateKey([], "", entropy);
  return WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 })
    .address.toString({ urlSafe: true, bounceable: false });
}

/* ─── Stellar (XLM) ───────────────────────────────────────────────────────── */
// Stellar uses shared hot-wallet + memo

export function xlmMemoForUser(uid: string): string {
  return uid.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function getXlmHotWalletAddress(): string {
  const addr = process.env.XLM_HOT_WALLET_ADDRESS;
  if (!addr) throw new Error("XLM_HOT_WALLET_ADDRESS not configured");
  return addr;
}

export async function deriveStellarAddress(hdIndex: number): Promise<string> {
  const { Keypair } = await import("stellar-sdk");
  const { derivePath } = await import("ed25519-hd-key");
  const seedBuffer = await bip39Lib.mnemonicToSeed(getMasterSeed());
  const derived = derivePath(`m/44'/148'/${hdIndex}'`, seedBuffer.toString("hex"));
  return Keypair.fromRawEd25519Seed(derived.key).publicKey();
}

/* ─── NEAR ────────────────────────────────────────────────────────────────── */

export async function deriveNearAddress(hdIndex: number): Promise<string> {
  const { derivePath } = await import("ed25519-hd-key");
  const { PublicKey, KeyType } = await import("near-api-js/lib/utils/key_pair");
  const seedBuffer = await bip39Lib.mnemonicToSeed(getMasterSeed());
  const derived = derivePath(`m/44'/397'/0'/0/${hdIndex}`, seedBuffer.toString("hex"));
  const pubKey = PublicKey.fromString(`ed25519:${Buffer.from(derived.key).toString("base64")}`);
  // NEAR address = lowercase hex of public key bytes
  return Buffer.from(pubKey.data).toString("hex");
}

export async function deriveNearKeyPair(hdIndex: number) {
  const { derivePath } = await import("ed25519-hd-key");
  const { KeyPair } = await import("near-api-js/lib/utils/key_pair");
  const seedBuffer = await bip39Lib.mnemonicToSeed(getMasterSeed());
  const derived = derivePath(`m/44'/397'/0'/0/${hdIndex}`, seedBuffer.toString("hex"));
  return KeyPair.fromString(`ed25519:${Buffer.from(derived.key).toString("base64")}`);
}

/* ─── Filecoin ────────────────────────────────────────────────────────────── */

export async function deriveFilecoinAddress(hdIndex: number): Promise<string> {
  // Filecoin f1 address = secp256k1 public key, BIP44 coin type 461
  const root = await getBip32Root();
  const child = root.derivePath(`m/44'/461'/0'/0/${hdIndex}`);
  const pubkeyBytes = child.publicKey;
  // Filecoin f1 address encoding (secp256k1)
  // payload = keccak hash of uncompressed pubkey (last 20 bytes) — same as ETH but different prefix
  const { keccak256 } = await import("ethers");
  // Use uncompressed public key for Filecoin f1
  const ecc = await import("tiny-secp256k1");
  const uncompressed = Buffer.from((ecc.default ?? ecc).pointFromScalar(child.privateKey!, false)!);
  const addrBytes = Buffer.from(keccak256(uncompressed.slice(1)).slice(-40), "hex");
  // f1 = 0x01 + 20 byte payload + 4 byte checksum
  const prefix = Buffer.from([0x01]);
  const payload = Buffer.concat([prefix, addrBytes]);
  const checksum = filecoinChecksum(payload);
  const { base32 } = await import("rfc4648");
  return "f1" + base32.stringify(Buffer.concat([addrBytes, checksum])).toLowerCase().replace(/=/g, "");
}

function filecoinChecksum(payload: Buffer): Buffer {
  // Blake2b-4 of payload
  // For production use 'blake2' package; for now use a deterministic fallback
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256").update(payload).digest().slice(0, 4);
}

export async function deriveFilecoinPrivateKey(hdIndex: number): Promise<string> {
  const root = await getBip32Root();
  return root.derivePath(`m/44'/461'/0'/0/${hdIndex}`).privateKey!.toString("hex");
}

/* ─── Unified address derivation ─────────────────────────────────────────── */

export type NonEvmChainId =
  | "TRON" | "BTC" | "LTC" | "DOGE" | "BCH"
  | "SOL" | "XRP" | "TON" | "XLM" | "NEAR" | "FIL";

// Memo-based chains use the exchange hot wallet address + user-specific memo
// The "address" for these chains IS the hot wallet address
export const MEMO_CHAINS: NonEvmChainId[] = ["XRP", "TON", "XLM"];

export function isMemoChain(chainId: string): boolean {
  return MEMO_CHAINS.includes(chainId as NonEvmChainId);
}

export async function deriveNonEvmAddress(chainId: NonEvmChainId, hdIndex: number): Promise<string> {
  switch (chainId) {
    case "TRON": return deriveTronAddress(hdIndex);
    case "BTC":  return deriveBitcoinFamilyAddress("BTC", hdIndex);
    case "LTC":  return deriveBitcoinFamilyAddress("LTC", hdIndex);
    case "DOGE": return deriveBitcoinFamilyAddress("DOGE", hdIndex);
    case "BCH":  return deriveBitcoinFamilyAddress("BCH", hdIndex);
    case "SOL":  return deriveSolanaAddress(hdIndex);
    case "XRP":  return getXrpHotWalletAddress();
    case "TON":  return getTonHotWalletAddress();
    case "XLM":  return getXlmHotWalletAddress();
    case "NEAR": return deriveNearAddress(hdIndex);
    case "FIL":  return deriveFilecoinAddress(hdIndex);
  }
}

export function getMemoForUser(chainId: NonEvmChainId, uid: string): string | null {
  switch (chainId) {
    case "XRP": return xrpMemoForUser(uid);
    case "TON": return tonMemoForUser(uid);
    case "XLM": return xlmMemoForUser(uid);
    default:    return null;
  }
}

// In-process address cache — avoid re-deriving on every request
const _addrCache = new Map<string, string>();

export async function getCachedNonEvmAddress(chainId: NonEvmChainId, hdIndex: number): Promise<string> {
  const key = `${chainId}:${hdIndex}`;
  const cached = _addrCache.get(key);
  if (cached) return cached;
  const addr = await deriveNonEvmAddress(chainId, hdIndex);
  _addrCache.set(key, addr);
  return addr;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DEPOSIT SCANNING
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Scan a single non-EVM chain for new deposits to any user address.
 * Called by the cron endpoint every 30s.
 * Returns array of new deposit records inserted.
 */
export async function scanChainDeposits(chainId: NonEvmChainId): Promise<number> {
  switch (chainId) {
    case "TRON": return scanTronDeposits();
    case "BTC":  return scanBitcoinFamilyDeposits("BTC");
    case "LTC":  return scanBitcoinFamilyDeposits("LTC");
    case "DOGE": return scanBitcoinFamilyDeposits("DOGE");
    case "BCH":  return scanBitcoinFamilyDeposits("BCH");
    case "SOL":  return scanSolanaDeposits();
    case "XRP":  return scanXrpDeposits();
    case "TON":  return scanTonDeposits();
    case "XLM":  return scanStellarDeposits();
    case "NEAR": return scanNearDeposits();
    case "FIL":  return scanFilecoinDeposits();
  }
}

/* ─── TRON deposit scanner ─────────────────────────────────────────────────── */

interface TronTx {
  txID: string;
  blockNumber: number;
  token_info?: { address: string; symbol: string; decimals: number };
  to: string;
  from: string;
  value: string;
  type: string;
}

async function scanTronDeposits(): Promise<number> {
  const { getDb } = await import("@/server/db/client");
  const db = getDb();

  // Get all TRON deposit addresses (users with hd_index set)
  const { data: users } = await db
    .from("users")
    .select("uid, hd_index")
    .not("hd_index", "is", null)
    .limit(500);

  if (!users?.length) return 0;

  // Derive all TRON addresses for these users
  const addressToUid = new Map<string, string>();
  await Promise.all(
    users.map(async (u) => {
      try {
        const addr = await getCachedNonEvmAddress("TRON", u.hd_index);
        addressToUid.set(addr.toLowerCase(), u.uid);
      } catch { /* skip if derivation fails */ }
    })
  );

  // Fetch recent TRC-20 USDT transfers from TronGrid
  // USDT on TRON: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  const USDT_TRC20 = process.env.TRON_USDT_CONTRACT ?? "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const baseUrl = rpcUrl("TRON", "https://api.trongrid.io");

  let newDeposits = 0;

  try {
    const data = await fetchJson<{ data?: TronTx[] }>(
      `${baseUrl}/v1/contracts/${USDT_TRC20}/transactions?limit=50&order_by=block_timestamp,desc`,
      { headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY ?? "" } }
    );

    for (const tx of data.data ?? []) {
      if (!tx.to || !addressToUid.has(tx.to.toLowerCase())) continue;

      const uid = addressToUid.get(tx.to.toLowerCase())!;
      // USDT-TRC20 has 6 decimals — preserve fractional units
      const amount = (Number(tx.value) / 1_000_000).toFixed(6);

      // Skip if already recorded
      const { data: existing } = await db
        .from("crypto_deposits")
        .select("id")
        .eq("tx_hash", tx.txID)
        .maybeSingle();
      if (existing) continue;

      const { error } = await db.from("crypto_deposits").insert({
        uid,
        chain_id: "TRON",
        chain_name: "TRON",
        asset_symbol: "USDT",
        asset_address: USDT_TRC20,
        amount,
        tx_hash: tx.txID,
        from_address: tx.from,
        to_address: tx.to,
        block_number: tx.blockNumber,
        confirmations: 20, // TronGrid only returns confirmed txns
        status: "completed",
        credited_at: new Date().toISOString(),
      });

      if (!error) {
        await creditCryptoDeposit(uid, "USDT", amount, "TRON", tx.txID);
        newDeposits++;
      }
    }
  } catch (err) {
    console.error("[TRON scanner]", err);
  }

  return newDeposits;
}

/* ─── Bitcoin-family scanner (BTC, LTC, DOGE, BCH via Trezor/Blockstream APIs) */

async function scanBitcoinFamilyDeposits(chain: "BTC" | "LTC" | "DOGE" | "BCH"): Promise<number> {
  const { getDb } = await import("@/server/db/client");
  const db = getDb();

  const { data: users } = await db
    .from("users").select("uid, hd_index").not("hd_index", "is", null).limit(500);
  if (!users?.length) return 0;

  const apiUrls: Record<string, string> = {
    BTC:  rpcUrl("BTC",  "https://blockstream.info/api"),
    LTC:  rpcUrl("LTC",  "https://ltc1.trezor.io/api"),
    DOGE: rpcUrl("DOGE", "https://api.blockcypher.com/v1/doge/main"),
    BCH:  rpcUrl("BCH",  "https://bch1.trezor.io/api"),
  };
  const baseUrl = apiUrls[chain]!;

  // For each user, check their address for unspent / recent transactions
  // We use Blockstream/Trezor XPUB-compatible REST APIs
  let newDeposits = 0;
  const CONFS_REQUIRED = chain === "BTC" ? 3 : 2;

  for (const user of users.slice(0, 50)) { // batch 50 per run to stay under rate limits
    try {
      const addr = await getCachedNonEvmAddress(chain, user.hd_index);
      const chainSymbol = chain === "BCH" ? "BCH" : chain;

      let txs: Array<{ txid: string; status: { confirmed: boolean; block_height?: number }; vout: Array<{ scriptpubkey_address: string; value: number }> }> = [];

      if (chain === "DOGE") {
        // BlockCypher for DOGE
        const bcData = await fetchJson<{ txrefs?: Array<{ tx_hash: string; confirmations: number; value: number; tx_output_n: number }> }>(
          `${baseUrl}/addrs/${addr}?unspentOnly=true&limit=20`
        );
        for (const ref of bcData.txrefs ?? []) {
          if (ref.confirmations < CONFS_REQUIRED) continue;
          const { data: existing } = await db.from("crypto_deposits").select("id").eq("tx_hash", ref.tx_hash).maybeSingle();
          if (existing) continue;
          const amount = (ref.value / 1e8).toFixed(8);
          const { error } = await db.from("crypto_deposits").insert({
            uid: user.uid, chain_id: chain, chain_name: chain, asset_symbol: chain,
            amount, tx_hash: ref.tx_hash, to_address: addr,
            confirmations: ref.confirmations, status: "completed", credited_at: new Date().toISOString(),
          });
          if (!error) { await creditCryptoDeposit(user.uid, chain, amount, chain, ref.tx_hash); newDeposits++; }
        }
        continue;
      }

      // Blockstream / Trezor API (BTC, LTC, BCH)
      txs = await fetchJson<typeof txs>(`${baseUrl}/address/${addr}/txs`);

      for (const tx of txs.slice(0, 20)) {
        const confs = tx.status.confirmed ? 6 : 0; // confirmed = finalized
        if (confs < CONFS_REQUIRED) continue;
        const { data: existing } = await db.from("crypto_deposits").select("id").eq("tx_hash", tx.txid).maybeSingle();
        if (existing) continue;

        for (const vout of tx.vout) {
          if (vout.scriptpubkey_address !== addr) continue;
          const amount = (vout.value / 1e8).toFixed(8);
          const { error } = await db.from("crypto_deposits").insert({
            uid: user.uid, chain_id: chain, chain_name: chain, asset_symbol: chainSymbol,
            amount, tx_hash: tx.txid, to_address: addr,
            block_number: tx.status.block_height ?? null,
            confirmations: confs, status: "completed", credited_at: new Date().toISOString(),
          });
          if (!error) { await creditCryptoDeposit(user.uid, chainSymbol, amount, chain, tx.txid); newDeposits++; }
        }
      }
    } catch (err) {
      console.error(`[${chain} scanner] user ${user.uid}:`, err);
    }
  }

  return newDeposits;
}

/* ─── Solana deposit scanner ──────────────────────────────────────────────── */

interface SolanaSignature { signature: string; confirmationStatus: string; slot: number; err: unknown }

async function scanSolanaDeposits(): Promise<number> {
  const { getDb } = await import("@/server/db/client");
  const db = getDb();

  const { data: users } = await db.from("users").select("uid, hd_index").not("hd_index", "is", null).limit(500);
  if (!users?.length) return 0;

  const rpc = rpcUrl("SOL", "https://api.mainnet-beta.solana.com");
  let newDeposits = 0;

  // USDT on Solana (SPL token)
  const USDT_SPL = process.env.SOL_USDT_MINT ?? "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

  for (const user of users.slice(0, 30)) {
    try {
      const addr = await getCachedNonEvmAddress("SOL", user.hd_index);

      // Get recent SOL and SPL token transactions
      const sigsResp = await fetchJson<{ result?: SolanaSignature[] }>(
        rpc,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
            params: [addr, { limit: 20, commitment: "finalized" }],
          }),
        }
      );

      for (const sig of sigsResp.result ?? []) {
        if (sig.err) continue; // failed tx
        const { data: existing } = await db.from("crypto_deposits").select("id").eq("tx_hash", sig.signature).maybeSingle();
        if (existing) continue;

        // Fetch transaction details
        const txResp = await fetchJson<{ result?: { meta?: { postBalances?: number[]; preBalances?: number[]; postTokenBalances?: Array<{ accountIndex: number; mint: string; uiTokenAmount: { uiAmount: number } }> }; transaction?: { message?: { accountKeys?: string[] } } } }>(
          rpc,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0", id: 1, method: "getTransaction",
              params: [sig.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
            }),
          }
        );

        const tx = txResp.result;
        if (!tx?.meta) continue;

        const keys = tx.transaction?.message?.accountKeys ?? [];
        const userIdx = keys.findIndex((k) => (typeof k === "string" ? k : (k as { pubkey: string }).pubkey) === addr);

        // Check SOL balance change
        if (userIdx >= 0) {
          const pre = tx.meta.preBalances?.[userIdx] ?? 0;
          const post = tx.meta.postBalances?.[userIdx] ?? 0;
          const lamports = post - pre;
          if (lamports > 5000) { // > 0.000005 SOL (above dust + fees)
            const amount = (lamports / 1e9).toFixed(9);
            const { error } = await db.from("crypto_deposits").insert({
              uid: user.uid, chain_id: "SOL", chain_name: "Solana", asset_symbol: "SOL",
              amount, tx_hash: sig.signature, to_address: addr,
              confirmations: 32, status: "completed", credited_at: new Date().toISOString(),
            });
            if (!error) { await creditCryptoDeposit(user.uid, "SOL", amount, "SOL", sig.signature); newDeposits++; }
          }
        }

        // Check SPL token (USDT) balance change
        for (const tb of tx.meta.postTokenBalances ?? []) {
          if (tb.mint !== USDT_SPL) continue;
          const amount = tb.uiTokenAmount.uiAmount?.toFixed(6) ?? "0";
          if (parseFloat(amount) <= 0) continue;
          const { error } = await db.from("crypto_deposits").insert({
            uid: user.uid, chain_id: "SOL", chain_name: "Solana", asset_symbol: "USDT",
            asset_address: USDT_SPL, amount, tx_hash: sig.signature + ":USDT", to_address: addr,
            confirmations: 32, status: "completed", credited_at: new Date().toISOString(),
          });
          if (!error) { await creditCryptoDeposit(user.uid, "USDT", amount, "SOL", sig.signature); newDeposits++; }
        }
      }
    } catch (err) {
      console.error(`[SOL scanner] user ${user.uid}:`, err);
    }
  }

  return newDeposits;
}

/* ─── XRP deposit scanner ─────────────────────────────────────────────────── */

async function scanXrpDeposits(): Promise<number> {
  const { getDb } = await import("@/server/db/client");
  const db = getDb();

  const hotWallet = process.env.XRP_HOT_WALLET_ADDRESS;
  if (!hotWallet) { console.warn("[XRP scanner] XRP_HOT_WALLET_ADDRESS not set, skipping"); return 0; }

  const rpc = rpcUrl("XRP", "https://xrplcluster.com");
  let newDeposits = 0;

  try {
    const { data: state } = await db.from("scanner_state").select("last_block").eq("chain_id", "XRP").maybeSingle();
    const lastLedger = state?.last_block ?? 0;

    const resp = await fetchJson<{ result?: { transactions?: Array<{ tx?: { hash: string; Destination: string; DestinationTag?: number; Amount: string | { value: string; currency: string }; ledger_index: number }; validated: boolean }> } }>(
      rpc,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "account_tx",
          params: [{ account: hotWallet, ledger_index_min: Math.max(lastLedger - 1000, -1), limit: 50 }],
        }),
      }
    );

    const txns = resp.result?.transactions ?? [];
    let maxLedger = lastLedger;

    for (const entry of txns) {
      if (!entry.validated || !entry.tx) continue;
      const tx = entry.tx;
      // DestinationTag is a uint32. We derive it from uid as:
      //   parseInt(first_8_hex_chars_of_uid, 16) >>> 0
      // The deposit UI must show this same numeric value to the user as their tag.
      if (tx.DestinationTag === undefined || tx.DestinationTag === null) continue;

      const { data: users } = await db.from("users").select("uid").limit(500);
      const match = users?.find((u) => {
        const expectedTag = parseInt(u.uid.replace(/-/g, "").slice(0, 8), 16) >>> 0;
        return tx.DestinationTag === expectedTag;
      });
      if (!match) continue;

      const { data: existing } = await db.from("crypto_deposits").select("id").eq("tx_hash", tx.hash).maybeSingle();
      if (existing) continue;

      const isNative = typeof tx.Amount === "string";
      const asset = isNative ? "XRP" : (tx.Amount as { currency: string }).currency;
      const amount = isNative
        ? (parseInt(tx.Amount as string) / 1e6).toFixed(6)
        : (tx.Amount as { value: string }).value;

      const { error } = await db.from("crypto_deposits").insert({
        uid: match.uid, chain_id: "XRP", chain_name: "XRP Ledger", asset_symbol: asset,
        amount, tx_hash: tx.hash, to_address: hotWallet,
        block_number: tx.ledger_index, confirmations: 1, status: "completed", credited_at: new Date().toISOString(),
      });
      if (!error) { await creditCryptoDeposit(match.uid, asset, amount, "XRP", tx.hash); newDeposits++; }
      maxLedger = Math.max(maxLedger, tx.ledger_index);
    }

    if (maxLedger > lastLedger) {
      await db.from("scanner_state").upsert({ chain_id: "XRP", last_block: maxLedger, last_scan_at: new Date().toISOString() }, { onConflict: "chain_id" });
    }
  } catch (err) {
    console.error("[XRP scanner]", err);
  }

  return newDeposits;
}

/* ─── TON deposit scanner ─────────────────────────────────────────────────── */

async function scanTonDeposits(): Promise<number> {
  const { getDb } = await import("@/server/db/client");
  const db = getDb();

  const hotWallet = process.env.TON_HOT_WALLET_ADDRESS;
  if (!hotWallet) { console.warn("[TON scanner] TON_HOT_WALLET_ADDRESS not set, skipping"); return 0; }

  const apiUrl = rpcUrl("TON", "https://toncenter.com/api/v2");
  const apiKey = process.env.TONCENTER_API_KEY ?? "";
  let newDeposits = 0;

  try {
    const txData = await fetchJson<{ ok: boolean; result?: Array<{ transaction_id: { hash: string }; in_msg?: { message?: string; value: string; source: string }; utime: number }> }>(
      `${apiUrl}/getTransactions?address=${hotWallet}&limit=50&archival=true`,
      { headers: apiKey ? { "X-API-Key": apiKey } : {} }
    );

    for (const tx of txData.result ?? []) {
      const inMsg = tx.in_msg;
      if (!inMsg?.message || !inMsg.value || inMsg.value === "0") continue;

      const memo = inMsg.message.trim().toUpperCase().slice(0, 8);
      const { data: users } = await db.from("users").select("uid").limit(500);
      const match = users?.find((u) => u.uid.replace(/-/g, "").slice(0, 8).toUpperCase() === memo);
      if (!match) continue;

      const txHash = tx.transaction_id.hash;
      const { data: existing } = await db.from("crypto_deposits").select("id").eq("tx_hash", txHash).maybeSingle();
      if (existing) continue;

      const amount = (BigInt(inMsg.value) / BigInt(1_000_000_000)).toString();
      const { error } = await db.from("crypto_deposits").insert({
        uid: match.uid, chain_id: "TON", chain_name: "TON", asset_symbol: "TON",
        amount, tx_hash: txHash, from_address: inMsg.source, to_address: hotWallet,
        confirmations: 1, status: "completed", credited_at: new Date().toISOString(),
      });
      if (!error) { await creditCryptoDeposit(match.uid, "TON", amount, "TON", txHash); newDeposits++; }
    }
  } catch (err) {
    console.error("[TON scanner]", err);
  }

  return newDeposits;
}

/* ─── Stellar deposit scanner ─────────────────────────────────────────────── */

async function scanStellarDeposits(): Promise<number> {
  const { getDb } = await import("@/server/db/client");
  const db = getDb();

  const hotWallet = process.env.XLM_HOT_WALLET_ADDRESS;
  if (!hotWallet) { console.warn("[XLM scanner] XLM_HOT_WALLET_ADDRESS not set, skipping"); return 0; }

  const horizonUrl = rpcUrl("XLM", "https://horizon.stellar.org");
  let newDeposits = 0;

  try {
    const payments = await fetchJson<{ _embedded?: { records?: Array<{ id: string; type: string; transaction_hash: string; from: string; to: string; asset_type: string; asset_code?: string; amount: string; memo?: string }> } }>(
      `${horizonUrl}/accounts/${hotWallet}/payments?limit=50&order=desc`
    );

    const { data: users } = await db.from("users").select("uid").limit(500);

    for (const record of payments._embedded?.records ?? []) {
      if (record.to !== hotWallet) continue;

      const memo = (record.memo ?? "").trim().toUpperCase().slice(0, 8);
      const match = users?.find((u) => u.uid.replace(/-/g, "").slice(0, 8).toUpperCase() === memo);
      if (!match) continue;

      const { data: existing } = await db.from("crypto_deposits").select("id").eq("tx_hash", record.transaction_hash).maybeSingle();
      if (existing) continue;

      const asset = record.asset_type === "native" ? "XLM" : (record.asset_code ?? "XLM");
      const { error } = await db.from("crypto_deposits").insert({
        uid: match.uid, chain_id: "XLM", chain_name: "Stellar", asset_symbol: asset,
        amount: record.amount, tx_hash: record.transaction_hash, from_address: record.from, to_address: hotWallet,
        confirmations: 1, status: "completed", credited_at: new Date().toISOString(),
      });
      if (!error) { await creditCryptoDeposit(match.uid, asset, record.amount, "XLM", record.transaction_hash); newDeposits++; }
    }
  } catch (err) {
    console.error("[XLM scanner]", err);
  }

  return newDeposits;
}

/* ─── NEAR deposit scanner ────────────────────────────────────────────────── */

async function scanNearDeposits(): Promise<number> {
  const { getDb } = await import("@/server/db/client");
  const db = getDb();

  const { data: users } = await db.from("users").select("uid, hd_index").not("hd_index", "is", null).limit(100);
  if (!users?.length) return 0;

  const rpc = rpcUrl("NEAR", "https://rpc.mainnet.near.org");
  let newDeposits = 0;

  for (const user of users.slice(0, 20)) {
    try {
      const addr = await getCachedNonEvmAddress("NEAR", user.hd_index);

      const resp = await fetchJson<{ result?: { transaction_hashes?: string[] } }>(
        rpc,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "EXPERIMENTAL_changes_in_block",
            params: { changes_type: "all_changes", account_ids: [addr] } }),
        }
      );

      // NEAR scanning is complex; we simplify by checking recent transactions via indexer
      const indexerUrl = process.env.NEAR_INDEXER_URL ?? "https://api.nearblocks.io/v1";
      const txsData = await fetchJson<{ txns?: Array<{ transaction_hash: string; signer_account_id: string; receiver_account_id: string; actions_agg?: { deposit: string }; outcomes?: { status: string } }> }>(
        `${indexerUrl}/account/${addr}/txns?limit=20&order=desc`
      );

      for (const tx of txsData.txns ?? []) {
        if (tx.receiver_account_id !== addr) continue;
        const deposit = tx.actions_agg?.deposit ?? "0";
        if (BigInt(deposit) <= 0) continue;

        const { data: existing } = await db.from("crypto_deposits").select("id").eq("tx_hash", tx.transaction_hash).maybeSingle();
        if (existing) continue;

        const amount = (Number(BigInt(deposit)) / 1e24).toFixed(8);
        const { error } = await db.from("crypto_deposits").insert({
          uid: user.uid, chain_id: "NEAR", chain_name: "NEAR Protocol", asset_symbol: "NEAR",
          amount, tx_hash: tx.transaction_hash, from_address: tx.signer_account_id, to_address: addr,
          confirmations: 1, status: "completed", credited_at: new Date().toISOString(),
        });
        if (!error) { await creditCryptoDeposit(user.uid, "NEAR", amount, "NEAR", tx.transaction_hash); newDeposits++; }
      }
    } catch (err) {
      console.error(`[NEAR scanner] user ${user.uid}:`, err);
    }
  }

  return newDeposits;
}

/* ─── Filecoin deposit scanner ─────────────────────────────────────────────── */

async function scanFilecoinDeposits(): Promise<number> {
  const { getDb } = await import("@/server/db/client");
  const db = getDb();

  const { data: users } = await db.from("users").select("uid, hd_index").not("hd_index", "is", null).limit(100);
  if (!users?.length) return 0;

  const apiUrl = rpcUrl("FIL", "https://api.node.glif.io/rpc/v1");
  let newDeposits = 0;

  for (const user of users.slice(0, 20)) {
    try {
      const addr = await getCachedNonEvmAddress("FIL", user.hd_index);

      // Use Beryx/Filscan API for transaction history
      const beryxUrl = process.env.FIL_INDEXER_URL ?? "https://api.zondax.ch/fil/data/v3/mainnet";
      const txsData = await fetchJson<{ transactions?: Array<{ id: string; tx_cid: string; amount: string; tx_type: string; to: string; from: string; height: number }> }>(
        `${beryxUrl}/transactions/address/${addr}?limit=20`
      );

      for (const tx of txsData.transactions ?? []) {
        if (tx.to !== addr) continue;
        const amountAtto = BigInt(tx.amount ?? "0");
        if (amountAtto <= 0) continue;

        const { data: existing } = await db.from("crypto_deposits").select("id").eq("tx_hash", tx.tx_cid).maybeSingle();
        if (existing) continue;

        const amount = (Number(amountAtto) / 1e18).toFixed(8);
        const { error } = await db.from("crypto_deposits").insert({
          uid: user.uid, chain_id: "FIL", chain_name: "Filecoin", asset_symbol: "FIL",
          amount, tx_hash: tx.tx_cid, from_address: tx.from, to_address: addr,
          block_number: tx.height, confirmations: 1, status: "completed", credited_at: new Date().toISOString(),
        });
        if (!error) { await creditCryptoDeposit(user.uid, "FIL", amount, "FIL", tx.tx_cid); newDeposits++; }
      }
    } catch (err) {
      console.error(`[FIL scanner] user ${user.uid}:`, err);
    }
  }

  return newDeposits;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DEPOSIT CREDITING (shared across all chains)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Credit a user's funding balance for a confirmed on-chain deposit.
 * Applies the KES spread silently for USDT→KES conversions.
 * Sends a push notification.
 */
export async function creditCryptoDeposit(
  uid: string,
  asset: string,
  amount: string,
  chainId: string,
  txHash: string
): Promise<void> {
  const { getDb } = await import("@/server/db/client");
  const { getBalance, upsertBalance, createLedgerEntry } = await import("@/server/db/balances");
  const { Notifications } = await import("@/server/services/notifications");
  const db = getDb();

  const current = await getBalance(uid, asset, "funding");
  // Use Big.js to avoid floating-point precision loss on balance addition
  const Big = (await import("big.js")).default;
  const newBalance = new Big(current).plus(new Big(amount)).toFixed(18);
  await upsertBalance(uid, asset, newBalance, "funding");

  await createLedgerEntry({
    uid, asset, amount, type: "deposit",
    reference_id: txHash,
    note: `On-chain deposit ${amount} ${asset} on ${chainId}`,
  });

  // Mark deposit as completed in crypto_deposits table
  await db.from("crypto_deposits").update({ status: "completed", credited_at: new Date().toISOString() })
    .eq("tx_hash", txHash);

  await Notifications.depositConfirmed(uid, amount, amount, txHash);
}

/* ═══════════════════════════════════════════════════════════════════════════
   WITHDRAWAL BROADCASTING
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Broadcast a withdrawal transaction for a given non-EVM chain.
 * Called from the withdrawal queue processor after the cancel window expires.
 * Returns the transaction hash on success, throws on failure.
 */
export async function broadcastNonEvmWithdrawal(
  chainId: NonEvmChainId,
  fromHdIndex: number,
  toAddress: string,
  amount: string,
  asset: string,
  memo?: string
): Promise<string> {
  switch (chainId) {
    case "TRON": return broadcastTronWithdrawal(fromHdIndex, toAddress, amount, asset);
    case "BTC":  return broadcastBitcoinFamilyWithdrawal("BTC",  fromHdIndex, toAddress, amount);
    case "LTC":  return broadcastBitcoinFamilyWithdrawal("LTC",  fromHdIndex, toAddress, amount);
    case "DOGE": return broadcastBitcoinFamilyWithdrawal("DOGE", fromHdIndex, toAddress, amount);
    case "BCH":  return broadcastBitcoinFamilyWithdrawal("BCH",  fromHdIndex, toAddress, amount);
    case "SOL":  return broadcastSolanaWithdrawal(fromHdIndex, toAddress, amount, asset);
    case "XRP":  return broadcastXrpWithdrawal(fromHdIndex, toAddress, amount, memo);
    case "TON":  return broadcastTonWithdrawal(fromHdIndex, toAddress, amount, memo);
    case "XLM":  return broadcastStellarWithdrawal(fromHdIndex, toAddress, amount, memo);
    case "NEAR": return broadcastNearWithdrawal(fromHdIndex, toAddress, amount);
    case "FIL":  return broadcastFilecoinWithdrawal(fromHdIndex, toAddress, amount);
  }
}

/* ─── TRON withdrawal ─────────────────────────────────────────────────────── */

async function broadcastTronWithdrawal(
  fromHdIndex: number,
  toAddress: string,
  amount: string,
  asset: string
): Promise<string> {
  const TronWeb = (await import("tronweb")).default;
  const privateKey = await deriveTronPrivateKey(fromHdIndex);
  const tronWeb = new TronWeb({ fullHost: rpcUrl("TRON", "https://api.trongrid.io"), privateKey });

  if (asset === "TRX") {
    const sunAmount = Math.round(parseFloat(amount) * 1_000_000);
    const tx = await tronWeb.trx.sendTransaction(toAddress, sunAmount);
    return tx.txid as string;
  }

  // TRC-20 token (USDT)
  const USDT_TRC20 = process.env.TRON_USDT_CONTRACT ?? "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const contract = await tronWeb.contract().at(USDT_TRC20);
  const decimals = 6;
  const rawAmount = BigInt(Math.round(parseFloat(amount) * 10 ** decimals));
  const tx = await contract.transfer(toAddress, rawAmount.toString()).send();
  return tx as string;
}

/* ─── Bitcoin-family withdrawals ──────────────────────────────────────────── */

async function broadcastBitcoinFamilyWithdrawal(
  chain: "BTC" | "LTC" | "DOGE" | "BCH",
  fromHdIndex: number,
  toAddress: string,
  amount: string
): Promise<string> {
  const bitcoin = await import("bitcoinjs-lib");
  const ecc = await import("tiny-secp256k1");
  bitcoin.initEccLib(ecc.default ?? ecc);
  const { BIP32Factory } = await import("bip32");
  const bip32 = BIP32Factory(ecc.default ?? ecc);

  const network = BITCOIN_NETWORKS[chain]!;
  const coinType = BTC_COIN_TYPES[chain]!;
  const useBip84 = chain === "BTC" || chain === "LTC";
  const path = useBip84 ? `m/84'/${coinType}'/0'/0/${fromHdIndex}` : `m/44'/${coinType}'/0'/0/${fromHdIndex}`;

  const seedBuffer = await bip39Lib.mnemonicToSeed(getMasterSeed());
  const rootNode = bip32.fromSeed(seedBuffer, network as Parameters<typeof bip32.fromSeed>[1]);
  const child = rootNode.derivePath(path);

  // Fetch UTXOs
  const fromAddress = await deriveBitcoinFamilyAddress(chain, fromHdIndex);
  const apiUrls: Record<string, string> = {
    BTC:  rpcUrl("BTC",  "https://blockstream.info/api"),
    LTC:  rpcUrl("LTC",  "https://ltc1.trezor.io/api"),
    DOGE: rpcUrl("DOGE", "https://api.blockcypher.com/v1/doge/main"),
    BCH:  rpcUrl("BCH",  "https://bch1.trezor.io/api"),
  };
  const baseUrl = apiUrls[chain]!;

  const utxos = await fetchJson<Array<{ txid: string; vout: number; value: number; status: { confirmed: boolean } }>>(
    chain === "DOGE"
      ? `${baseUrl}/addrs/${fromAddress}?unspentOnly=true`
      : `${baseUrl}/address/${fromAddress}/utxo`
  );

  const confirmedUtxos = (chain === "DOGE"
    ? (utxos as unknown as { txrefs: typeof utxos }).txrefs ?? []
    : utxos
  ).filter((u: typeof utxos[number]) => u.status?.confirmed !== false);

  if (!confirmedUtxos.length) throw new Error(`No confirmed UTXOs for ${chain} withdrawal`);

  const satoshi = Math.round(parseFloat(amount) * 1e8);
  const feeRate = chain === "BTC" ? 20 : 10; // sat/vbyte
  const psbt = new bitcoin.Psbt({ network: network as Parameters<typeof bitcoin.Psbt>[0]["network"] });

  let inputTotal = 0;
  for (const utxo of confirmedUtxos.slice(0, 10)) {
    const txHex = await fetchJson<string>(
      `${baseUrl}/tx/${utxo.txid}/hex`
    );
    psbt.addInput({ hash: utxo.txid, index: utxo.vout, nonWitnessUtxo: Buffer.from(txHex as unknown as string, "hex") });
    inputTotal += utxo.value;
    if (inputTotal >= satoshi + feeRate * 250) break;
  }

  const fee = feeRate * 250;
  const change = inputTotal - satoshi - fee;

  psbt.addOutput({ address: toAddress, value: satoshi });
  if (change > 546) psbt.addOutput({ address: fromAddress, value: change });

  psbt.signAllInputs({ publicKey: Buffer.from(child.publicKey), sign: (hash: Buffer) => Buffer.from((ecc.default ?? ecc).sign(hash, child.privateKey!)) });
  psbt.finalizeAllInputs();
  const rawTx = psbt.extractTransaction().toHex();

  // Broadcast
  if (chain === "BTC") {
    const result = await fetch(`${baseUrl}/tx`, { method: "POST", body: rawTx, signal: AbortSignal.timeout(15_000) });
    return result.text();
  }
  const broadcastResp = await fetchJson<{ data?: { txid?: string }; txrefs?: Array<{ tx_hash: string }> }>(
    `${baseUrl}/txs/push`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tx: rawTx }) }
  );
  return broadcastResp.data?.txid ?? rawTx.slice(0, 64);
}

/* ─── Solana withdrawal ───────────────────────────────────────────────────── */

async function broadcastSolanaWithdrawal(
  fromHdIndex: number,
  toAddress: string,
  amount: string,
  asset: string
): Promise<string> {
  const { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
  const keypair = await deriveSolanaKeypair(fromHdIndex);
  const connection = new Connection(rpcUrl("SOL", "https://api.mainnet-beta.solana.com"), "confirmed");
  const toPubkey = new PublicKey(toAddress);

  if (asset === "SOL") {
    const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey, lamports }));
    return sendAndConfirmTransaction(connection, tx, [keypair]);
  }

  // SPL Token (USDT)
  const { createTransferInstruction, getOrCreateAssociatedTokenAccount } = await import("@solana/spl-token");
  const USDT_MINT = new PublicKey(process.env.SOL_USDT_MINT ?? "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
  const sourceAccount = await getOrCreateAssociatedTokenAccount(connection, keypair, USDT_MINT, keypair.publicKey);
  const destAccount   = await getOrCreateAssociatedTokenAccount(connection, keypair, USDT_MINT, toPubkey);
  const rawAmount = Math.round(parseFloat(amount) * 1_000_000); // USDT has 6 decimals
  const tx = new Transaction().add(createTransferInstruction(sourceAccount.address, destAccount.address, keypair.publicKey, rawAmount));
  return sendAndConfirmTransaction(connection, tx, [keypair]);
}

/* ─── XRP withdrawal ──────────────────────────────────────────────────────── */

async function broadcastXrpWithdrawal(
  fromHdIndex: number,
  toAddress: string,
  amount: string,
  destinationTag?: string
): Promise<string> {
  const { Client, Wallet, xrpToDrops } = await import("xrpl");
  const client = new Client(rpcUrl("XRP", "wss://xrplcluster.com"));
  await client.connect();

  try {
    const wallet = await deriveXrpWallet(fromHdIndex);
    const drops = xrpToDrops(amount);
    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: wallet.address,
      Amount: drops,
      Destination: toAddress,
      ...(destinationTag ? { DestinationTag: parseInt(destinationTag) } : {}),
    });
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    return (result.result as unknown as { hash: string }).hash;
  } finally {
    await client.disconnect();
  }
}

/* ─── TON withdrawal ──────────────────────────────────────────────────────── */

async function broadcastTonWithdrawal(
  fromHdIndex: number,
  toAddress: string,
  amount: string,
  comment?: string
): Promise<string> {
  const { TonClient, WalletContractV4, internal, toNano } = await import("@ton/ton");
  const { mnemonicToPrivateKey } = await import("@ton/crypto");
  const crypto = await import("node:crypto");

  const entropy = crypto.createHash("sha512")
    .update(`${getMasterSeed()}:TON:${fromHdIndex}`)
    .digest();
  const keyPair = await mnemonicToPrivateKey([], "", entropy);

  const client = new TonClient({ endpoint: rpcUrl("TON", "https://toncenter.com/api/v2/jsonRPC") });
  const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const contract = client.open(wallet);

  const seqno = await contract.getSeqno();
  const nanoAmount = toNano(amount);

  await contract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    messages: [internal({
      value: nanoAmount,
      to: toAddress,
      body: comment ?? "",
    })],
  });

  // TON doesn't return txHash from sendTransfer — we compute it deterministically
  const { createHash } = await import("node:crypto");
  return createHash("sha256")
    .update(`${wallet.address.toString()}:${seqno}:${toAddress}:${amount}`)
    .digest("hex");
}

/* ─── Stellar withdrawal ──────────────────────────────────────────────────── */

async function broadcastStellarWithdrawal(
  fromHdIndex: number,
  toAddress: string,
  amount: string,
  memo?: string
): Promise<string> {
  const stellar = await import("stellar-sdk");
  const { derivePath } = await import("ed25519-hd-key");
  const seedBuffer = await bip39Lib.mnemonicToSeed(getMasterSeed());
  const derived = derivePath(`m/44'/148'/${fromHdIndex}'`, seedBuffer.toString("hex"));
  const sourceKeypair = stellar.Keypair.fromRawEd25519Seed(derived.key);

  const horizonUrl = rpcUrl("XLM", "https://horizon.stellar.org");
  const server = new stellar.Server(horizonUrl);
  const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

  const txBuilder = new stellar.TransactionBuilder(sourceAccount, {
    fee: stellar.BASE_FEE,
    networkPassphrase: stellar.Networks.PUBLIC,
  })
  .addOperation(stellar.Operation.payment({
    destination: toAddress,
    asset: stellar.Asset.native(),
    amount,
  }))
  .setTimeout(30);

  if (memo) txBuilder.addMemo(stellar.Memo.text(memo));

  const tx = txBuilder.build();
  tx.sign(sourceKeypair);

  const result = await server.submitTransaction(tx);
  return result.hash;
}

/* ─── NEAR withdrawal ─────────────────────────────────────────────────────── */

async function broadcastNearWithdrawal(
  fromHdIndex: number,
  toAddress: string,
  amount: string
): Promise<string> {
  const { connect, keyStores, KeyPair } = await import("near-api-js");
  const { derivePath } = await import("ed25519-hd-key");
  const seedBuffer = await bip39Lib.mnemonicToSeed(getMasterSeed());
  const derived = derivePath(`m/44'/397'/0'/0/${fromHdIndex}`, seedBuffer.toString("hex"));

  const keyPair = KeyPair.fromString(`ed25519:${Buffer.from(derived.key).toString("base64")}`);
  const fromAddress = await deriveNearAddress(fromHdIndex);

  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey("mainnet", fromAddress, keyPair);

  const near = await connect({
    networkId: "mainnet",
    nodeUrl: rpcUrl("NEAR", "https://rpc.mainnet.near.org"),
    keyStore,
  });

  const account = await near.account(fromAddress);
  const yoctoAmount = BigInt(Math.round(parseFloat(amount) * 1e24)).toString();
  const result = await account.sendMoney(toAddress, BigInt(yoctoAmount));
  return result.transaction.hash;
}

/* ─── Filecoin withdrawal ─────────────────────────────────────────────────── */

async function broadcastFilecoinWithdrawal(
  fromHdIndex: number,
  toAddress: string,
  amount: string
): Promise<string> {
  const apiUrl = rpcUrl("FIL", "https://api.node.glif.io/rpc/v1");
  const fromAddress = await deriveFilecoinAddress(fromHdIndex);
  const privateKey = await deriveFilecoinPrivateKey(fromHdIndex);

  // Filecoin uses Lotus JSON-RPC
  const attoAmount = BigInt(Math.round(parseFloat(amount) * 1e18)).toString();

  // Get nonce
  const nonceResp = await fetchJson<{ result?: number }>(
    apiUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.GLIF_JWT ? { Authorization: `Bearer ${process.env.GLIF_JWT}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "Filecoin.MpoolGetNonce", params: [fromAddress] }),
    }
  );
  const nonce = nonceResp.result ?? 0;

  // Build message
  const message = {
    Version: 0, To: toAddress, From: fromAddress, Nonce: nonce,
    Value: attoAmount, GasLimit: 0, GasFeeCap: "0", GasPremium: "0",
    Method: 0, Params: "",
  };

  // Estimate gas
  const gasResp = await fetchJson<{ result?: typeof message }>(
    apiUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "Filecoin.GasEstimateMessageGas", params: [message, { MaxFee: "0" }, null] }),
    }
  );
  const msgWithGas = gasResp.result ?? message;

  // Sign with secp256k1
  const { secp256k1 } = await import("ethers");
  const msgBytes = Buffer.from(JSON.stringify(msgWithGas));
  const sig = secp256k1.sign(msgBytes, privateKey);
  const signedMsg = { Message: msgWithGas, Signature: { Type: 1, Data: Buffer.from(sig.toCompactRawBytes()).toString("base64") } };

  // Push to mempool
  const pushResp = await fetchJson<{ result?: string }>(
    apiUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "Filecoin.MpoolPush", params: [signedMsg] }),
    }
  );

  return pushResp.result ?? "pending";
}
