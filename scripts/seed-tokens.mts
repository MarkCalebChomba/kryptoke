/**
 * ONE-TIME SETUP SCRIPT
 * Run: pnpm seed:tokens
 * Run once against production with pnpm seed:tokens — all 200 tokens defined here.
 *
 * 1. Creates 'token-logos' bucket in Supabase Storage
 * 2. Downloads logos from CoinGecko → uploads to your Supabase Storage
 * 3. Seeds tokens table with 200 tokens (rank 1–200)
 *
 * Ranks 1–60:  in WebSocket stream → prices live instantly
 * Ranks 61–200: prices fetched on demand when user scrolls
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const BUCKET = "token-logos";

// ── 200 tokens ordered by rank ──────────────────────────────────────────────
// Ranks 1–60 are in the WS stream (TRACKED_SYMBOLS in useMarketData.ts)
// Ranks 61–200 have metadata only until user loads more
const ALL_TOKENS = [
  // ── Rank 1-60: WS stream ─────────────────────────────────────────────────
  { rank:1,   symbol:"BTC",    name:"Bitcoin",               cg:"1",     file:"bitcoin.png",                     coingecko_id:"bitcoin" },
  { rank:2,   symbol:"ETH",    name:"Ethereum",              cg:"279",   file:"ethereum.png",                    coingecko_id:"ethereum" },
  { rank:3,   symbol:"BNB",    name:"BNB",                   cg:"825",   file:"bnb-icon2_2x.png",                coingecko_id:"binancecoin" },
  { rank:4,   symbol:"SOL",    name:"Solana",                cg:"4128",  file:"solana.png",                      coingecko_id:"solana" },
  { rank:5,   symbol:"XRP",    name:"XRP",                   cg:"44",    file:"xrp-symbol-white-128.png",        coingecko_id:"ripple" },
  { rank:6,   symbol:"ADA",    name:"Cardano",               cg:"975",   file:"cardano.png",                     coingecko_id:"cardano" },
  { rank:7,   symbol:"DOGE",   name:"Dogecoin",              cg:"5",     file:"dogecoin.png",                    coingecko_id:"dogecoin" },
  { rank:8,   symbol:"TRX",    name:"TRON",                  cg:"1094",  file:"tron-logo.png",                   coingecko_id:"tron" },
  { rank:9,   symbol:"AVAX",   name:"Avalanche",             cg:"12559", file:"Avalanche_Circle_RedWhite_Trans.png", coingecko_id:"avalanche-2" },
  { rank:10,  symbol:"DOT",    name:"Polkadot",              cg:"12171", file:"polkadot.png",                    coingecko_id:"polkadot" },
  { rank:11,  symbol:"LINK",   name:"Chainlink",             cg:"877",   file:"chainlink-new-logo.png",          coingecko_id:"chainlink" },
  { rank:12,  symbol:"MATIC",  name:"Polygon",               cg:"4713",  file:"matic-token-icon.png",            coingecko_id:"matic-network" },
  { rank:13,  symbol:"UNI",    name:"Uniswap",               cg:"12504", file:"uniswap-uni.png",                 coingecko_id:"uniswap" },
  { rank:14,  symbol:"ATOM",   name:"Cosmos",                cg:"1481",  file:"cosmos_hub.png",                  coingecko_id:"cosmos" },
  { rank:15,  symbol:"LTC",    name:"Litecoin",              cg:"2",     file:"litecoin.png",                    coingecko_id:"litecoin" },
  { rank:16,  symbol:"NEAR",   name:"NEAR Protocol",         cg:"10365", file:"near.jpg",                        coingecko_id:"near" },
  { rank:17,  symbol:"APT",    name:"Aptos",                 cg:"26455", file:"aptos_round.png",                 coingecko_id:"aptos" },
  { rank:18,  symbol:"ARB",    name:"Arbitrum",              cg:"16547", file:"photo_2023-03-29_21.47.00.jpeg",  coingecko_id:"arbitrum" },
  { rank:19,  symbol:"OP",     name:"Optimism",              cg:"25244", file:"Optimism.png",                    coingecko_id:"optimism" },
  { rank:20,  symbol:"SUI",    name:"Sui",                   cg:"26375", file:"sui_asset.jpeg",                  coingecko_id:"sui" },
  { rank:21,  symbol:"PEPE",   name:"Pepe",                  cg:"29850", file:"pepe-token.jpeg",                 coingecko_id:"pepe" },
  { rank:22,  symbol:"SHIB",   name:"Shiba Inu",             cg:"11939", file:"shiba.png",                       coingecko_id:"shiba-inu" },
  { rank:23,  symbol:"INJ",    name:"Injective",             cg:"12882", file:"Secondary_Symbol.png",            coingecko_id:"injective-protocol" },
  { rank:24,  symbol:"WIF",    name:"dogwifhat",             cg:"33566", file:"dogwifhat.png",                   coingecko_id:"dogwifhat" },
  { rank:25,  symbol:"BONK",   name:"Bonk",                  cg:"28600", file:"bonk.jpg",                        coingecko_id:"bonk" },
  { rank:26,  symbol:"FET",    name:"Fetch.ai",              cg:"5681",  file:"Fetch.jpg",                       coingecko_id:"fetch-ai" },
  { rank:27,  symbol:"RNDR",   name:"Render",                cg:"11636", file:"rndr.png",                        coingecko_id:"render-token" },
  { rank:28,  symbol:"WLD",    name:"Worldcoin",             cg:"31069", file:"worldcoin.jpeg",                  coingecko_id:"worldcoin-wld" },
  { rank:29,  symbol:"GRT",    name:"The Graph",             cg:"13397", file:"Graph_Token.png",                 coingecko_id:"the-graph" },
  { rank:30,  symbol:"AXS",    name:"Axie Infinity",         cg:"13029", file:"axie_infinity_logo.png",          coingecko_id:"axie-infinity" },
  { rank:31,  symbol:"FIL",    name:"Filecoin",              cg:"12817", file:"filecoin.png",                    coingecko_id:"filecoin" },
  { rank:32,  symbol:"ICP",    name:"Internet Computer",     cg:"14495", file:"Internet_Computer_logo.png",      coingecko_id:"internet-computer" },
  { rank:33,  symbol:"HBAR",   name:"Hedera",                cg:"3688",  file:"hbar.png",                        coingecko_id:"hedera-hashgraph" },
  { rank:34,  symbol:"VET",    name:"VeChain",               cg:"1167",  file:"VET_Token_Icon.png",              coingecko_id:"vechain" },
  { rank:35,  symbol:"AAVE",   name:"Aave",                  cg:"12645", file:"AAVE.png",                        coingecko_id:"aave" },
  { rank:36,  symbol:"CRV",    name:"Curve DAO",             cg:"12124", file:"Curve.png",                       coingecko_id:"curve-dao-token" },
  { rank:37,  symbol:"MKR",    name:"Maker",                 cg:"1364",  file:"Mark_Maker.png",                  coingecko_id:"maker" },
  { rank:38,  symbol:"CAKE",   name:"PancakeSwap",           cg:"12632", file:"pancakeswap-cake-logo.png",       coingecko_id:"pancakeswap-token" },
  { rank:39,  symbol:"LDO",    name:"Lido DAO",              cg:"13573", file:"Lido_DAO.png",                    coingecko_id:"lido-dao" },
  { rank:40,  symbol:"TIA",    name:"Celestia",              cg:"31967", file:"tia.jpg",                         coingecko_id:"celestia" },
  { rank:41,  symbol:"JUP",    name:"Jupiter",               cg:"34529", file:"jup.png",                         coingecko_id:"jupiter-exchange-solana" },
  { rank:42,  symbol:"ENA",    name:"Ethena",                cg:"36530", file:"ethena.png",                      coingecko_id:"ethena" },
  { rank:43,  symbol:"NOT",    name:"Notcoin",               cg:"36072", file:"notcoin.webp",                    coingecko_id:"notcoin" },
  { rank:44,  symbol:"ONDO",   name:"Ondo",                  cg:"26580", file:"ONDO.png",                        coingecko_id:"ondo-finance" },
  { rank:45,  symbol:"SEI",    name:"Sei",                   cg:"28205", file:"Sei_Logo_-_Transparent.png",      coingecko_id:"sei-network" },
  { rank:46,  symbol:"IMX",    name:"Immutable X",           cg:"17233", file:"imx.png",                         coingecko_id:"immutable-x" },
  { rank:47,  symbol:"FLOKI",  name:"FLOKI",                 cg:"16746", file:"PNG_image.png",                   coingecko_id:"floki" },
  { rank:48,  symbol:"PYTH",   name:"Pyth Network",          cg:"31950", file:"pyth.png",                        coingecko_id:"pyth-network" },
  { rank:49,  symbol:"STRK",   name:"StarkNet",              cg:"26433", file:"starknet.png",                    coingecko_id:"starknet" },
  { rank:50,  symbol:"XLM",    name:"Stellar",               cg:"100",   file:"stellar_logo_black_rgb.png",      coingecko_id:"stellar" },
  { rank:51,  symbol:"ALGO",   name:"Algorand",              cg:"4380",  file:"download.png",                    coingecko_id:"algorand" },
  { rank:52,  symbol:"SAND",   name:"The Sandbox",           cg:"12129", file:"sandbox_logo.jpg",                coingecko_id:"the-sandbox" },
  { rank:53,  symbol:"MANA",   name:"Decentraland",          cg:"878",   file:"decentraland-mana.png",           coingecko_id:"decentraland" },
  { rank:54,  symbol:"CRO",    name:"Cronos",                cg:"7310",  file:"cro_token_logo.png",              coingecko_id:"crypto-com-chain" },
  { rank:55,  symbol:"RUNE",   name:"THORChain",             cg:"6595",  file:"Rune200x200.png",                 coingecko_id:"thorchain" },
  { rank:56,  symbol:"ETC",    name:"Ethereum Classic",      cg:"453",   file:"ethereum-classic-logo.png",       coingecko_id:"ethereum-classic" },
  { rank:57,  symbol:"GMT",    name:"STEPN",                 cg:"23597", file:"gmt.png",                         coingecko_id:"stepn" },
  { rank:58,  symbol:"PENDLE", name:"Pendle",                cg:"15069", file:"Pendle_Logo_Normal-03.png",       coingecko_id:"pendle" },
  { rank:59,  symbol:"XMR",    name:"Monero",                cg:"69",    file:"monero_logo.png",                 coingecko_id:"monero" },
  { rank:60,  symbol:"EGLD",   name:"MultiversX",            cg:"12335", file:"egld-token-logo.png",             coingecko_id:"elrond-erd-2" },
  // ── Rank 61-200: metadata only, prices on demand ─────────────────────────
  { rank:61,  symbol:"CHZ",    name:"Chiliz",                cg:"9576",  file:"chiliz.png",                      coingecko_id:"chiliz" },
  { rank:62,  symbol:"SNX",    name:"Synthetix",             cg:"2586",  file:"synthetix.png",                   coingecko_id:"havven" },
  { rank:63,  symbol:"ZEC",    name:"Zcash",                 cg:"486",   file:"circle-zcash-color.png",          coingecko_id:"zcash" },
  { rank:64,  symbol:"COMP",   name:"Compound",              cg:"7084",  file:"comp.png",                        coingecko_id:"compound-governance-token" },
  { rank:65,  symbol:"1INCH",  name:"1inch",                 cg:"13130", file:"1inch.png",                       coingecko_id:"1inch" },
  { rank:66,  symbol:"BAT",    name:"Basic Attention Token", cg:"3408",  file:"cat.png",                         coingecko_id:"basic-attention-token" },
  { rank:67,  symbol:"YFI",    name:"yearn.finance",         cg:"11858", file:"yearn-finance.png",               coingecko_id:"yearn-finance" },
  { rank:68,  symbol:"ZIL",    name:"Zilliqa",               cg:"2605",  file:"zilliqa.png",                     coingecko_id:"zilliqa" },
  { rank:69,  symbol:"KSM",    name:"Kusama",                cg:"5034",  file:"kusama.png",                      coingecko_id:"kusama" },
  { rank:70,  symbol:"BAL",    name:"Balancer",              cg:"11523", file:"bal.png",                         coingecko_id:"balancer" },
  { rank:71,  symbol:"BNX",    name:"BinaryX",               cg:"20983", file:"bnx.png",                         coingecko_id:"binaryx-2" },
  { rank:72,  symbol:"COTI",   name:"COTI",                  cg:"6649",  file:"coti.png",                        coingecko_id:"coti" },
  { rank:73,  symbol:"DYDX",   name:"dYdX",                  cg:"17522", file:"dydx.jpg",                        coingecko_id:"dydx-chain" },
  { rank:74,  symbol:"GALA",   name:"Gala",                  cg:"12493", file:"gala.png",                        coingecko_id:"gala" },
  { rank:75,  symbol:"HIGH",   name:"Highstreet",            cg:"19737", file:"high.png",                        coingecko_id:"highstreet" },
  { rank:76,  symbol:"HFT",    name:"Hashflow",              cg:"24530", file:"hft.png",                         coingecko_id:"hashflow" },
  { rank:77,  symbol:"HOOK",   name:"Hooked Protocol",       cg:"24765", file:"hook.png",                        coingecko_id:"hooked-protocol" },
  { rank:78,  symbol:"ID",     name:"Space ID",              cg:"26774", file:"id.png",                          coingecko_id:"space-id" },
  { rank:79,  symbol:"IDEX",   name:"IDEX",                  cg:"4603",  file:"idex.png",                        coingecko_id:"idex" },
  { rank:80,  symbol:"ILV",    name:"Illuvium",              cg:"15212", file:"ilv.png",                         coingecko_id:"illuvium" },
  { rank:81,  symbol:"JOE",    name:"JOE",                   cg:"17375", file:"joe.png",                         coingecko_id:"joe" },
  { rank:82,  symbol:"KEY",    name:"SelfKey",               cg:"2508",  file:"selfkey.png",                     coingecko_id:"selfkey" },
  { rank:83,  symbol:"LINA",   name:"Linear Finance",        cg:"7764",  file:"linear.png",                      coingecko_id:"linear" },
  { rank:84,  symbol:"LOKA",   name:"League of Kingdoms",    cg:"15867", file:"loka.png",                        coingecko_id:"league-of-kingdoms" },
  { rank:85,  symbol:"LOOM",   name:"Loom Network",          cg:"3760",  file:"loom.png",                        coingecko_id:"loom-network-new" },
  { rank:86,  symbol:"MAGIC",  name:"MAGIC",                 cg:"17682", file:"magic.jpg",                       coingecko_id:"magic" },
  { rank:87,  symbol:"MBOX",   name:"MOBOX",                 cg:"14568", file:"mobox.jpg",                       coingecko_id:"mobox" },
  { rank:88,  symbol:"MDT",    name:"Measurable Data Token", cg:"3437",  file:"mdt.png",                         coingecko_id:"measurable-data-token" },
  { rank:89,  symbol:"MINA",   name:"Mina Protocol",         cg:"16547", file:"mina.jpg",                        coingecko_id:"mina-protocol" },
  { rank:90,  symbol:"MNT",    name:"Mantle",                cg:"27075", file:"mantle.jpg",                      coingecko_id:"mantle" },
  { rank:91,  symbol:"MTL",    name:"Metal DAO",             cg:"1788",  file:"metal.png",                       coingecko_id:"metal" },
  { rank:92,  symbol:"NTRN",   name:"Neutron",               cg:"29869", file:"neutron.png",                     coingecko_id:"neutron-3" },
  { rank:93,  symbol:"OGN",    name:"Origin Protocol",       cg:"5765",  file:"ogn.png",                         coingecko_id:"origin-protocol" },
  { rank:94,  symbol:"OMG",    name:"OMG Network",           cg:"836",   file:"omg.jpg",                         coingecko_id:"omisego" },
  { rank:95,  symbol:"OXT",    name:"Orchid",                cg:"5026",  file:"orchid.png",                      coingecko_id:"orchid-protocol" },
  { rank:96,  symbol:"PAXG",   name:"PAX Gold",              cg:"9760",  file:"paxg.png",                        coingecko_id:"pax-gold" },
  { rank:97,  symbol:"PERP",   name:"Perpetual Protocol",    cg:"12508", file:"perp.jpg",                        coingecko_id:"perpetual-protocol" },
  { rank:98,  symbol:"PHB",    name:"Phoenix",               cg:"1161",  file:"phb.png",                         coingecko_id:"phoenix-global" },
  { rank:99,  symbol:"QKC",    name:"QuarkChain",            cg:"3645",  file:"quarkchain.png",                  coingecko_id:"quark-chain" },
  { rank:100, symbol:"QNT",    name:"Quant",                 cg:"3155",  file:"quant.png",                       coingecko_id:"quant-network" },
  { rank:101, symbol:"RDNT",   name:"Radiant Capital",       cg:"27944", file:"rdnt.png",                        coingecko_id:"radiant-capital" },
  { rank:102, symbol:"REI",    name:"REI Network",           cg:"21154", file:"rei.png",                         coingecko_id:"rei-network" },
  { rank:103, symbol:"RPL",    name:"Rocket Pool",           cg:"2090",  file:"rpl.png",                         coingecko_id:"rocket-pool" },
  { rank:104, symbol:"RSR",    name:"Reserve Rights",        cg:"3964",  file:"rsr.png",                         coingecko_id:"reserve-rights-token" },
  { rank:105, symbol:"RVN",    name:"Ravencoin",             cg:"2577",  file:"ravencoin.png",                   coingecko_id:"ravencoin" },
  { rank:106, symbol:"SC",     name:"Siacoin",               cg:"1042",  file:"siacoin.png",                     coingecko_id:"siacoin" },
  { rank:107, symbol:"SKL",    name:"SKALE",                 cg:"5765",  file:"skale.png",                       coingecko_id:"skale" },
  { rank:108, symbol:"SLP",    name:"Smooth Love Potion",    cg:"12425", file:"slp.png",                         coingecko_id:"smooth-love-potion" },
  { rank:109, symbol:"SSV",    name:"SSV Network",           cg:"23765", file:"ssv.png",                         coingecko_id:"ssv-network" },
  { rank:110, symbol:"STMX",   name:"StormX",                cg:"3840",  file:"stmx.png",                        coingecko_id:"storm" },
  { rank:111, symbol:"STORJ",  name:"Storj",                 cg:"1772",  file:"storj.png",                       coingecko_id:"storj" },
  { rank:112, symbol:"STPT",   name:"Standard Tokenization Protocol", cg:"5765", file:"stpt.png",                coingecko_id:"stpt" },
  { rank:113, symbol:"SUPER",  name:"SuperVerse",            cg:"14105", file:"super.jpg",                       coingecko_id:"superverse" },
  { rank:114, symbol:"SUSHI",  name:"SushiSwap",             cg:"12271", file:"sushi.png",                       coingecko_id:"sushi" },
  { rank:115, symbol:"SXP",    name:"SXP",                   cg:"4434",  file:"solar.png",                       coingecko_id:"solar" },
  { rank:116, symbol:"T",      name:"Threshold",             cg:"15175", file:"t.png",                           coingecko_id:"threshold-network-token" },
  { rank:117, symbol:"THETA",  name:"Theta Network",         cg:"2538",  file:"theta-token-logo.png",            coingecko_id:"theta-token" },
  { rank:118, symbol:"TKO",    name:"Tokocrypto",            cg:"16167", file:"tko.jpg",                         coingecko_id:"tokocrypto" },
  { rank:119, symbol:"TLM",    name:"Alien Worlds",          cg:"14565", file:"tlm.png",                         coingecko_id:"alien-worlds" },
  { rank:120, symbol:"TOKEN",  name:"Tokenfi",               cg:"30101", file:"tokenfi.png",                     coingecko_id:"tokenfi" },
  { rank:121, symbol:"TORN",   name:"Tornado Cash",          cg:"13512", file:"tornado-cash.png",                coingecko_id:"tornado-cash" },
  { rank:122, symbol:"TRB",    name:"Tellor",                cg:"5402",  file:"trb.png",                         coingecko_id:"tellor" },
  { rank:123, symbol:"TROY",   name:"TROY",                  cg:"5765",  file:"troy.png",                        coingecko_id:"troy" },
  { rank:124, symbol:"TUSD",   name:"TrueUSD",               cg:"3449",  file:"tusd.png",                        coingecko_id:"true-usd" },
  { rank:125, symbol:"TWT",    name:"Trust Wallet",          cg:"10528", file:"trust_platform.png",              coingecko_id:"trust-wallet-token" },
  { rank:126, symbol:"UFT",    name:"UniLend Finance",       cg:"7605",  file:"uft.png",                         coingecko_id:"unilend-finance" },
  { rank:127, symbol:"UNFI",   name:"Unifi Protocol DAO",    cg:"7672",  file:"unfi.png",                        coingecko_id:"unifi-protocol-dao" },
  { rank:128, symbol:"UTK",    name:"Utrust",                cg:"3078",  file:"utrust.png",                      coingecko_id:"utrust" },
  { rank:129, symbol:"VELO",   name:"Velo",                  cg:"5765",  file:"velo.png",                        coingecko_id:"velo" },
  { rank:130, symbol:"VIDT",   name:"VIDT DAO",              cg:"4562",  file:"vidt.png",                        coingecko_id:"vidt-datalink" },
  { rank:131, symbol:"VITE",   name:"VITE",                  cg:"3858",  file:"vite.png",                        coingecko_id:"vite" },
  { rank:132, symbol:"VOXEL",  name:"Voxies",                cg:"21728", file:"voxel.png",                       coingecko_id:"voxies" },
  { rank:133, symbol:"WAN",    name:"Wanchain",              cg:"2606",  file:"wanchain.png",                    coingecko_id:"wanchain" },
  { rank:134, symbol:"WAVES",  name:"Waves",                 cg:"1274",  file:"waves.png",                       coingecko_id:"waves" },
  { rank:135, symbol:"WIN",    name:"WINkLink",              cg:"4206",  file:"win.png",                         coingecko_id:"wink" },
  { rank:136, symbol:"WOO",    name:"WOO",                   cg:"12921", file:"woo.png",                         coingecko_id:"woo-network" },
  { rank:137, symbol:"XEC",    name:"eCash",                 cg:"17799", file:"xec.png",                         coingecko_id:"ecash" },
  { rank:138, symbol:"XEM",    name:"NEM",                   cg:"873",   file:"nem.png",                         coingecko_id:"nem" },
  { rank:139, symbol:"XNO",    name:"Nano",                  cg:"1177",  file:"nano.png",                        coingecko_id:"nano" },
  { rank:140, symbol:"XTZ",    name:"Tezos",                 cg:"976",   file:"Tezos-logo.png",                  coingecko_id:"tezos" },
  { rank:141, symbol:"XVS",    name:"Venus",                 cg:"7897",  file:"venus.png",                       coingecko_id:"venus" },
  { rank:142, symbol:"YGG",    name:"Yield Guild Games",     cg:"16748", file:"ygg.png",                         coingecko_id:"yield-guild-games" },
  { rank:143, symbol:"ZEN",    name:"Horizen",               cg:"1698",  file:"horizen.png",                     coingecko_id:"horizen" },
  { rank:144, symbol:"ZRX",    name:"0x Protocol",           cg:"1896",  file:"0x.png",                          coingecko_id:"0x" },
  { rank:145, symbol:"ACH",    name:"Alchemy Pay",           cg:"5765",  file:"ach.png",                         coingecko_id:"alchemy-pay" },
  { rank:146, symbol:"ACM",    name:"AC Milan Fan Token",    cg:"14796", file:"ac-milan.png",                    coingecko_id:"ac-milan-fan-token" },
  { rank:147, symbol:"ADA",    name:"Cardano",               cg:"975",   file:"cardano.png",                     coingecko_id:"cardano" },
  { rank:148, symbol:"ADX",    name:"Ambire AdEx",           cg:"1768",  file:"adex.png",                        coingecko_id:"adex" },
  { rank:149, symbol:"AGIX",   name:"SingularityNET",        cg:"2424",  file:"singularitynet.png",              coingecko_id:"singularitynet" },
  { rank:150, symbol:"AGI",    name:"Delysium",              cg:"27561", file:"agi.png",                         coingecko_id:"delysium" },
  { rank:151, symbol:"AIOZ",   name:"AIOZ Network",          cg:"13455", file:"aioz.png",                        coingecko_id:"aioz-network" },
  { rank:152, symbol:"AKRO",   name:"Akropolis",             cg:"4079",  file:"akropolis.png",                   coingecko_id:"akropolis" },
  { rank:153, symbol:"ALCX",   name:"Alchemix",              cg:"14381", file:"alchemix.png",                    coingecko_id:"alchemix" },
  { rank:154, symbol:"ALEPH",  name:"Aleph.im",              cg:"5765",  file:"aleph.png",                       coingecko_id:"aleph-im" },
  { rank:155, symbol:"ALPHA",  name:"Stella",                cg:"7737",  file:"alpha-finance.png",               coingecko_id:"alpha-finance" },
  { rank:156, symbol:"AMB",    name:"Ambrosus",              cg:"2081",  file:"amber.png",                       coingecko_id:"ambrosus" },
  { rank:157, symbol:"AMP",    name:"Amp",                   cg:"12809", file:"amp.png",                         coingecko_id:"amp-token" },
  { rank:158, symbol:"ANKR",   name:"Ankr",                  cg:"3714",  file:"ankr.png",                        coingecko_id:"ankr" },
  { rank:159, symbol:"ANT",    name:"Aragon",                cg:"1680",  file:"ant.png",                         coingecko_id:"aragon" },
  { rank:160, symbol:"APE",    name:"ApeCoin",               cg:"24383", file:"apecoin.png",                     coingecko_id:"apecoin" },
  { rank:161, symbol:"API3",   name:"API3",                  cg:"12920", file:"api3.png",                        coingecko_id:"api3" },
  { rank:162, symbol:"ARK",    name:"ARK",                   cg:"1586",  file:"ark.png",                         coingecko_id:"ark" },
  { rank:163, symbol:"ARPA",   name:"ARPA",                  cg:"4506",  file:"arpa.png",                        coingecko_id:"arpa" },
  { rank:164, symbol:"ASR",    name:"AS Roma Fan Token",     cg:"9803",  file:"asr.png",                         coingecko_id:"as-roma-fan-token" },
  { rank:165, symbol:"ATM",    name:"Atletico Madrid Fan Token", cg:"8732", file:"atm.png",                      coingecko_id:"atletico-madrid" },
  { rank:166, symbol:"AUDIO",  name:"Audius",                cg:"12913", file:"audius.png",                      coingecko_id:"audius" },
  { rank:167, symbol:"AUTO",   name:"Auto",                  cg:"14217", file:"auto.png",                        coingecko_id:"auto" },
  { rank:168, symbol:"AVA",    name:"Travala",               cg:"3638",  file:"ava.png",                         coingecko_id:"travala" },
  { rank:169, symbol:"AVAX",   name:"Avalanche",             cg:"12559", file:"Avalanche_Circle_RedWhite_Trans.png", coingecko_id:"avalanche-2" },
  { rank:170, symbol:"AXL",    name:"Axelar",                cg:"24781", file:"axelar.png",                      coingecko_id:"axelar" },
  { rank:171, symbol:"BADGER", name:"Badger DAO",            cg:"13608", file:"badger-dao.png",                  coingecko_id:"badger-dao" },
  { rank:172, symbol:"BAND",   name:"Band Protocol",         cg:"4947",  file:"band-protocol.png",               coingecko_id:"band-protocol" },
  { rank:173, symbol:"BCH",    name:"Bitcoin Cash",          cg:"1831",  file:"bitcoin-cash.png",                coingecko_id:"bitcoin-cash" },
  { rank:174, symbol:"BETA",   name:"Beta Finance",          cg:"17344", file:"beta-finance.png",                coingecko_id:"beta-finance" },
  { rank:175, symbol:"BICO",   name:"Biconomy",              cg:"18677", file:"bico.png",                        coingecko_id:"biconomy" },
  { rank:176, symbol:"BLUR",   name:"Blur",                  cg:"28451", file:"blur.png",                        coingecko_id:"blur" },
  { rank:177, symbol:"BNT",    name:"Bancor",                cg:"1727",  file:"bancor.png",                      coingecko_id:"bancor" },
  { rank:178, symbol:"BOME",   name:"BOOK OF MEME",          cg:"34436", file:"bome.png",                        coingecko_id:"book-of-meme" },
  { rank:179, symbol:"BSW",    name:"Biswap",                cg:"18765", file:"biswap.png",                      coingecko_id:"biswap" },
  { rank:180, symbol:"BURGER", name:"BurgerCities",          cg:"11865", file:"burger.png",                      coingecko_id:"burger-swap" },
  { rank:181, symbol:"CELO",   name:"Celo",                  cg:"11090", file:"InjXBNx9_400x400.jpg",            coingecko_id:"celo" },
  { rank:182, symbol:"CFX",    name:"Conflux",               cg:"3755",  file:"conflux.png",                     coingecko_id:"conflux-token" },
  { rank:183, symbol:"CHESS",  name:"Tranchess",             cg:"17628", file:"chess.png",                       coingecko_id:"tranchess" },
  { rank:184, symbol:"CLV",    name:"CLV",                   cg:"10070", file:"clv.png",                         coingecko_id:"clover-finance" },
  { rank:185, symbol:"COMBO",  name:"Furucombo",             cg:"8956",  file:"furucombo.png",                   coingecko_id:"furucombo" },
  { rank:186, symbol:"CTK",    name:"CertiK",                cg:"7697",  file:"ctk.png",                         coingecko_id:"certik" },
  { rank:187, symbol:"CTSI",   name:"Cartesi",               cg:"5444",  file:"cartesi.png",                     coingecko_id:"cartesi" },
  { rank:188, symbol:"CVC",    name:"Civic",                 cg:"788",   file:"civic.png",                       coingecko_id:"civic" },
  { rank:189, symbol:"CVP",    name:"PowerPool",             cg:"7728",  file:"powerpool.png",                   coingecko_id:"concentrated-voting-power" },
  { rank:190, symbol:"CYBER",  name:"CyberConnect",          cg:"30347", file:"cyber.png",                       coingecko_id:"cyberconnect" },
  { rank:191, symbol:"DAR",    name:"Mines of Dalarnia",     cg:"17777", file:"dar.png",                         coingecko_id:"mines-of-dalarnia" },
  { rank:192, symbol:"DASH",   name:"Dash",                  cg:"19",    file:"dash-logo.png",                   coingecko_id:"dash" },
  { rank:193, symbol:"DATA",   name:"Streamr",               cg:"2143",  file:"streamr.png",                     coingecko_id:"streamr" },
  { rank:194, symbol:"DCR",    name:"Decred",                cg:"1168",  file:"decred.png",                      coingecko_id:"decred" },
  { rank:195, symbol:"DENT",   name:"Dent",                  cg:"1868",  file:"dent.png",                        coingecko_id:"dent" },
  { rank:196, symbol:"DGB",    name:"DigiByte",              cg:"1",     file:"digibyte.png",                    coingecko_id:"digibyte" },
  { rank:197, symbol:"DIA",    name:"DIA",                   cg:"8780",  file:"dia-data.jpg",                    coingecko_id:"dia-data" },
  { rank:198, symbol:"DOCK",   name:"Dock",                  cg:"2675",  file:"dock.png",                        coingecko_id:"dock" },
  { rank:199, symbol:"DODO",   name:"DODO",                  cg:"13083", file:"dodo.png",                        coingecko_id:"dodo" },
  { rank:200, symbol:"DOGE",   name:"Dogecoin",              cg:"5",     file:"dogecoin.png",                    coingecko_id:"dogecoin" },
];

// Deduplicate by symbol (keep lowest rank)
const TOKENS = Array.from(
  ALL_TOKENS.reduce((m, t) => {
    if (!m.has(t.symbol) || m.get(t.symbol)!.rank > t.rank) m.set(t.symbol, t);
    return m;
  }, new Map<string, typeof ALL_TOKENS[0]>()).values()
).sort((a, b) => a.rank - b.rank);

async function ensureBucket() {
  const { error } = await sb.storage.createBucket(BUCKET, {
    public: true, fileSizeLimit: 524288,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
  if (error && !error.message.toLowerCase().includes("already exists"))
    throw new Error(`Bucket error: ${error.message}`);
  console.log(`✓ Storage bucket '${BUCKET}' ready`);
}

async function uploadOne(t: typeof TOKENS[0]): Promise<string | null> {
  const url = `https://assets.coingecko.com/coins/images/${t.cg}/thumb/${t.file}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
        "Referer": "https://www.coingecko.com/",
        "Accept": "image/webp,image/png,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) { process.stdout.write(` ✗ ${t.symbol}(${res.status})`); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = t.file.split(".").pop()!;
    const mime = ext === "webp" ? "image/webp" : (ext === "jpg" || ext === "jpeg") ? "image/jpeg" : "image/png";
    const { error } = await sb.storage.from(BUCKET).upload(`${t.symbol.toLowerCase()}.${ext}`, buf, { contentType: mime, upsert: true });
    if (error) { process.stdout.write(` ✗ ${t.symbol}(upload)`); return null; }
    const { data } = sb.storage.from(BUCKET).getPublicUrl(`${t.symbol.toLowerCase()}.${ext}`);
    process.stdout.write(` ✓${t.symbol}`);
    return data.publicUrl;
  } catch { process.stdout.write(` ✗ ${t.symbol}`); return null; }
}

async function main() {
  console.log("\n=== KryptoKe Token Seeder — 200 tokens ===");
  await ensureBucket();

  console.log("\nUploading logos (this takes ~2 min):");
  const logoMap: Record<string, string> = {};
  for (let i = 0; i < TOKENS.length; i += 5) {
    const batch = TOKENS.slice(i, i + 5);
    const res = await Promise.all(batch.map(uploadOne));
    batch.forEach((t, j) => { if (res[j]) logoMap[t.symbol] = res[j]!; });
    if (i + 5 < TOKENS.length) await new Promise(r => setTimeout(r, 300));
  }
  console.log(`\n\nUploaded: ${Object.keys(logoMap).length}/${TOKENS.length} logos`);

  console.log("\nSeeding tokens table...");
  const rows = TOKENS.map((t) => ({
    address:     t.symbol.toLowerCase(),
    symbol:      t.symbol,
    name:        t.name,
    decimals:    18,
    is_native:   false,
    is_new:      false,
    is_seed:     false,
    coingecko_id: t.coingecko_id,
    icon_url:    logoMap[t.symbol] ?? null,
    rank:        t.rank,
    whitelisted_at: new Date(Date.now() - t.rank * 1000).toISOString(),
  }));

  // Upsert in batches of 50
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await sb.from("tokens").upsert(batch, { onConflict: "address" });
    if (error) { console.error(`Batch ${i} error:`, error.message); }
  }

  console.log(`✓ ${rows.length} tokens seeded`);
  console.log("\nDone! The app will automatically use the new tokens.\n");
}

main().catch(e => { console.error(e); process.exit(1); });
