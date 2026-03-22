"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { usePrices, useAppStore } from "@/lib/store";
import { usePreferences } from "@/lib/store";

// ── Curated symbol list ───────────────────────────────────────────────────────
// Only these 60 pairs get WebSocket streams — zero processing waste on random tokens.
// Keep in sync with scripts/seed-tokens.mts
export const TRACKED_SYMBOLS = [
  "BTC","ETH","BNB","SOL","XRP","ADA","DOGE","TRX","AVAX","DOT",
  "LINK","MATIC","UNI","ATOM","LTC","NEAR","APT","ARB","OP","SUI",
  "PEPE","SHIB","INJ","WIF","BONK","FET","RNDR","WLD","GRT","AXS",
  "FIL","ICP","HBAR","VET","AAVE","CRV","MKR","CAKE","LDO","TIA",
  "JUP","ENA","NOT","ONDO","SEI","IMX","FLOKI","PYTH","STRK","XLM",
  "ALGO","SAND","MANA","CRO","RUNE","ETC","GMT","PENDLE","XMR","EGLD",
];

// Individual stream URLs — one per symbol.
// Binance allows up to 1024 combined streams per connection.
// 60 miniTicker streams = tiny payload per tick vs ~2000 from !miniTicker@arr.
const STREAM_NAMES = TRACKED_SYMBOLS.map(s => `${s.toLowerCase()}usdt@miniTicker`).join("/");
const BINANCE_WS = `wss://stream.binance.com:9443/stream?streams=${STREAM_NAMES}`;

interface BinanceMiniTicker {
  s: string;  // symbol e.g. "BTCUSDT"
  c: string;  // close (last) price
  P: string;  // 24h price change %
  v: string;  // base asset volume
  q: string;  // quote volume (USDT)
  h: string;  // 24h high
  l: string;  // 24h low
  o: string;  // open price
}

interface StreamMessage {
  stream: string;
  data: BinanceMiniTicker;
}

interface FearGreedData {
  value: number;
  classification: string;
  timestamp: string | null;
}

// ── Module-level batch buffer ─────────────────────────────────────────────────
// Individual stream messages arrive one per tick — batch them before dispatching
// to avoid triggering a React render on every single message.
let _batchPrices:   Record<string, string> = {};
let _batchChanges:  Record<string, string> = {};
let _batchVolumes:  Record<string, string> = {};
let _flushTimer:    ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 250; // flush at most 4× per second — eliminates 800ms violations

function scheduleBatchFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    const prices  = _batchPrices;
    const changes = _batchChanges;
    const volumes = _batchVolumes;
    _batchPrices  = {};
    _batchChanges = {};
    _batchVolumes = {};
    const store = useAppStore.getState();
    store.setPrices(prices);
    for (const [sym, change] of Object.entries(changes)) {
      store.updatePrice(sym, prices[sym] ?? "0", change, undefined, volumes[sym]);
    }
  }, FLUSH_INTERVAL);
}

export function useBinanceWebSocket() {
  const { setWsStatus } = usePrices();
  const { preferences } = usePreferences();
  const wsRef = useRef<WebSocket | null>(null);
  const dataSaverRef = useRef(preferences.dataSaver);
  dataSaverRef.current = preferences.dataSaver;
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();
  const failureCount = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setWsStatus("connecting");

    try {
      const ws = new WebSocket(BINANCE_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");
        failureCount.current = 0;
      };

      ws.onmessage = (event) => {
        if (dataSaverRef.current) return;
        try {
          // Combined stream wraps each tick in { stream, data }
          const msg = JSON.parse(event.data as string) as StreamMessage;
          const t = msg.data;
          if (!t?.s || !t?.c) return;
          _batchPrices[t.s]  = t.c;
          _batchChanges[t.s] = t.P;
          _batchVolumes[t.s] = t.q;
          scheduleBatchFlush();
        } catch {
          // malformed — ignore
        }
      };

      ws.onerror = () => { setWsStatus("reconnecting"); };

      ws.onclose = () => {
        wsRef.current = null;
        failureCount.current += 1;
        setWsStatus("reconnecting");
        const delay = Math.min(1000 * Math.pow(2, failureCount.current - 1), 30_000);
        reconnectTimeout.current = setTimeout(connect, delay);
      };
    } catch {
      setWsStatus("disconnected");
    }
  }, [setWsStatus]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      if (_flushTimer) clearTimeout(_flushTimer);
      wsRef.current?.close();
    };
  }, [connect]);
}

export function useFearGreed() {
  return useQuery({
    queryKey: ["market", "fear-greed"],
    queryFn: () => apiGet<FearGreedData>("/market/fear-greed"),
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
  });
}

export function useMarketOverview() {
  return useQuery({
    queryKey: ["market", "overview"],
    queryFn: () =>
      apiGet<Array<{
        symbol:  string;
        name:    string;
        price:   string;
        kesPrice:string;
        iconUrl: string | null;
        address: string;
        isNew:   boolean;
        isSeed:  boolean;
        volume:  string;
        rank:    number;
      }>>("/market/overview"),
    staleTime: 30_000,        // 30s — matches server Redis cache
    gcTime:    10 * 60_000,   // keep in memory 10 min — navigating to markets is instant
    refetchOnWindowFocus: false,
  });
}

export function useTicker(symbol: string) {
  const { prices, priceChanges } = usePrices();
  const livePrice  = prices[symbol];
  const liveChange = priceChanges[symbol];

  const query = useQuery({
    queryKey: ["market", "ticker", symbol],
    queryFn: () =>
      apiGet<{
        symbol: string;
        lastPrice: string;
        priceChangePercent: string;
        highPrice: string;
        lowPrice: string;
        volume: string;
        quoteVolume: string;
      }>(`/market/ticker/${symbol}`),
    staleTime: 10_000,
    enabled: !livePrice,
  });

  return {
    price:    livePrice  ?? query.data?.lastPrice           ?? "0",
    change:   liveChange ?? query.data?.priceChangePercent  ?? "0",
    high:     query.data?.highPrice  ?? "0",
    low:      query.data?.lowPrice   ?? "0",
    volume:   query.data?.volume     ?? "0",
    isLoading: !livePrice && query.isLoading,
  };
}
