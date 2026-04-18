"use client";

import { useState, useEffect, useRef } from "react";

export interface OrderEntry {
  price: string;
  quantity: string;
  depth: number; // 0–1 relative to max qty in the side
}

export interface OrderBookState {
  bids: OrderEntry[];
  asks: OrderEntry[];
  spread: string;
  isLoading: boolean;
}

/**
 * Live orderbook via Binance partial depth stream.
 * Uses wss://stream.binance.com:9443/ws/<symbol>usdt@depth20@100ms
 * — 20 price levels, updated every 100 ms, no API key needed.
 *
 * Falls back gracefully if WebSocket is unavailable (SSR, network block).
 */
export function useOrderBook(symbol: string): OrderBookState {
  const [bids, setBids] = useState<OrderEntry[]>([]);
  const [asks, setAsks] = useState<OrderEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!symbol || typeof window === "undefined") return;

    function connect() {
      if (!mountedRef.current) return;

      const sym = symbol.toLowerCase().replace("usdt", "");
      const url = `wss://stream.binance.com:9443/ws/${sym}usdt@depth20@100ms`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(e.data as string) as {
            bids: [string, string][];
            asks: [string, string][];
          };
          if (!data.bids || !data.asks) return;

          // Bids — highest price first (Binance already sorts this way)
          const bidQtys = data.bids.map(([, q]) => parseFloat(q));
          const maxBid = Math.max(...bidQtys, 0.0001);
          setBids(
            data.bids.slice(0, 15).map(([p, q]) => ({
              price: p,
              quantity: q,
              depth: parseFloat(q) / maxBid,
            }))
          );

          // Asks — lowest price first
          const askQtys = data.asks.map(([, q]) => parseFloat(q));
          const maxAsk = Math.max(...askQtys, 0.0001);
          setAsks(
            data.asks.slice(0, 15).map(([p, q]) => ({
              price: p,
              quantity: q,
              depth: parseFloat(q) / maxAsk,
            }))
          );
        } catch { /* malformed frame — ignore */ }
      };

      ws.onerror = () => ws.close();

      ws.onclose = () => {
        if (!mountedRef.current) return;
        // Reconnect after 2s on unexpected close
        clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      mountedRef.current = false; // prevent reconnect
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setBids([]);
      setAsks([]);
    };
  }, [symbol]);

  const spread =
    bids[0] && asks[0]
      ? (parseFloat(asks[0].price) - parseFloat(bids[0].price)).toFixed(2)
      : "0";

  return {
    bids,
    asks,
    spread,
    isLoading: bids.length === 0 && asks.length === 0,
  };
}
