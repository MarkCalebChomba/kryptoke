"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { formatPrice, formatVolume, formatChange, priceDirection } from "@/lib/utils/formatters";
import { usePreferences } from "@/lib/store";
import { SkeletonCoinRow } from "@/components/shared/Skeleton";
import { IconSearch, IconStarFilled, IconStar } from "@/components/icons";
import { apiGet } from "@/lib/api/client";

interface Coin {
  symbol:     string;
  name:       string;
  logo_url:   string;
  cmc_rank:   number;
  chain_ids:  string[];
  price:      string;
  change_24h: string;
  change_1h:  string;
  volume_24h: string;
  high_24h:   string;
  low_24h:    string;
}

type Tab = "All" | "Favourites" | "Hot" | "Gainers" | "Losers";
type SortKey = "volume" | "price" | "change";
type SortDir = "asc" | "desc";

const TABS: Tab[] = ["All", "Favourites", "Hot", "Gainers", "Losers"];
const PAGE_SIZE = 100;

const CHAIN_FILTERS = [
  { label: "All Chains", value: "" },
  { label: "EVM",        value: "1" },
  { label: "BNB",        value: "56" },
  { label: "Solana",     value: "SOL" },
  { label: "Tron",       value: "TRON" },
  { label: "Bitcoin",    value: "BTC" },
];

type PriceUpdate = Record<string, { price: string }>;

function useVisibleSymbolsWs(visibleSymbols: string[], onUpdate: (u: PriceUpdate) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<string[]>([]);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const flushRef = useRef<ReturnType<typeof setTimeout>>();
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const sendSubscribe = useCallback((symbols: string[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      pendingRef.current.push(...symbols);
      return;
    }
    wsRef.current.send(JSON.stringify({
      method: "SUBSCRIBE",
      params: symbols.map((s) => `${s.toLowerCase()}usdt@miniTicker`),
      id: Date.now(),
    }));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket("wss://stream.binance.com:9443/ws");
    wsRef.current = ws;
    ws.onopen = () => {
      const toSub = [...Array.from(subscribedRef.current), ...pendingRef.current];
      pendingRef.current = [];
      if (toSub.length) sendSubscribe(toSub);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.e === "24hrMiniTicker") {
          onUpdateRef.current({ [(msg.s as string).replace("USDT", "")]: { price: msg.c as string } });
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      wsRef.current = null;
      reconnectRef.current = setTimeout(connect, 3000);
    };
  }, [sendSubscribe]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      clearTimeout(flushRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  useEffect(() => {
    const fresh = visibleSymbols.filter((s) => !subscribedRef.current.has(s));
    if (!fresh.length) return;
    fresh.forEach((s) => subscribedRef.current.add(s));
    clearTimeout(flushRef.current);
    flushRef.current = setTimeout(() => sendSubscribe(fresh), 100);
  }, [visibleSymbols, sendSubscribe]);
}

interface CoinRowProps extends Coin {
  showChange:  "1h" | "24h";
  isFav:       boolean;
  onToggleFav: (symbol: string) => void;
  onClick:     () => void;
  observerRef?: (el: HTMLButtonElement | null) => void;
}

function CoinRow({ symbol, name, logo_url, price, change_24h, change_1h, volume_24h,
  showChange, isFav, onToggleFav, onClick, observerRef }: CoinRowProps) {
  const change = showChange === "1h" ? change_1h : change_24h;
  const dir = priceDirection(change);
  return (
    <button ref={observerRef} data-symbol={symbol} onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 w-full active:bg-bg-surface2 transition-colors">
      <div className="w-8 h-8 rounded-full bg-bg-surface2 border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
        {logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logo_url} alt={symbol} className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          : <span className="font-price text-[10px] text-text-muted">{symbol.slice(0, 2)}</span>
        }
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-outfit font-semibold text-sm text-text-primary">{symbol}</span>
          <span className="font-outfit text-xs text-text-muted">/USDT</span>
        </div>
        <p className="font-outfit text-[10px] text-text-muted truncate">Vol {formatVolume(volume_24h)}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-price text-sm font-medium text-text-primary tabular-nums">{formatPrice(price)}</p>
        <span className={cn(
          "inline-block text-[10px] font-price font-semibold mt-0.5 px-2 py-0.5 rounded-lg tabular-nums",
          dir === "up"   ? "bg-up/20 text-up ring-1 ring-up/30" :
          dir === "down" ? "bg-down/20 text-down ring-1 ring-down/30" :
          "bg-bg-surface2 text-text-muted"
        )}>{formatChange(change)}</span>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onToggleFav(symbol); }}
        className="w-8 h-8 flex items-center justify-center flex-shrink-0 tap-target"
        aria-label={isFav ? "Remove favourite" : "Add favourite"}>
        {isFav ? <IconStarFilled size={14} className="text-gold" /> : <IconStar size={14} className="text-text-muted" />}
      </button>
    </button>
  );
}

export default function MarketsPage() {
  const router = useRouter();
  const { isFavorite, toggleFavorite } = usePreferences();

  const [activeTab,      setActiveTab]      = useState<Tab>("All");
  const [chainFilter,    setChainFilter]    = useState("");
  const [search,         setSearch]         = useState("");
  const [searchVisible,  setSearchVisible]  = useState(false);
  const [showChange,     setShowChange]     = useState<"1h" | "24h">("24h");
  const [sortKey,        setSortKey]        = useState<SortKey>("volume");
  const [sortDir,        setSortDir]        = useState<SortDir>("desc");
  const [coins,          setCoins]          = useState<Coin[]>([]);
  const [page,           setPage]           = useState(1);
  const [hasMore,        setHasMore]        = useState(true);
  const [loading,        setLoading]        = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [error,          setError]          = useState(false);
  const [livePrices,     setLivePrices]     = useState<PriceUpdate>({});
  const [visibleSymbols, setVisibleSymbols] = useState<string[]>([]);

  useVisibleSymbolsWs(visibleSymbols, useCallback((u: PriceUpdate) => {
    setLivePrices((prev) => ({ ...prev, ...u }));
  }, []));

  // Row observer for WS subscription tracking
  const rowObserverRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    rowObserverRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => (e.target as HTMLElement).dataset.symbol)
          .filter(Boolean) as string[];
        if (visible.length) setVisibleSymbols((prev) => Array.from(new Set([...prev, ...visible])));
      },
      { rootMargin: "100px" }
    );
    return () => rowObserverRef.current?.disconnect();
  }, []);
  const attachObserver = useCallback((el: HTMLButtonElement | null) => {
    if (el && rowObserverRef.current) rowObserverRef.current.observe(el);
  }, []);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore && !loading) {
          setPage((p) => p + 1);
        }
      },
      { rootMargin: "200px" }
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading]);

  // Fetch — only depends on filter values, no auth state
  const fetchCoins = useCallback(async (nextPage: number, reset: boolean) => {
    if (reset) { setLoading(true); setError(false); }
    else setLoadingMore(true);
    try {
      const tab = activeTab === "Favourites" ? "all" : activeTab.toLowerCase();
      const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE), tab });
      if (chainFilter) params.set("chain", chainFilter);
      if (search)      params.set("search", search);
      const res = await apiGet<Coin[]>(`/market/coins?${params}`);
      const coins = Array.isArray(res) ? res : (res as unknown as { data: Coin[] }).data ?? [];
      setCoins((prev) => reset ? coins : [...prev, ...coins]);
      setHasMore(coins.length === PAGE_SIZE);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, chainFilter, search]);

  // Reset on filter change
  useEffect(() => {
    setPage(1);
    setCoins([]);
    setHasMore(true);
    setLivePrices({});
    setVisibleSymbols([]);
    fetchCoins(1, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, chainFilter, search]);

  // Load more pages
  useEffect(() => {
    if (page > 1) fetchCoins(page, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const enrichedCoins = useMemo(() =>
    (coins ?? []).map((c) => {
      const live = livePrices[c.symbol];
      return live ? { ...c, price: live.price ?? c.price } : c;
    }),
  [coins, livePrices]);

  const displayCoins = useMemo(() => {
    let list = enrichedCoins ?? [];
    if (activeTab === "Favourites") list = list.filter((c) => isFavorite(c.symbol));
    if (activeTab === "All") {
      list = [...list].sort((a, b) => {
        const val = (x: Coin) => {
          const v = sortKey === "volume" ? parseFloat(x.volume_24h)
            : sortKey === "price"  ? parseFloat(x.price)
            : parseFloat(x.change_24h);
          return isNaN(v) ? 0 : v;
        };
        return sortDir === "desc" ? val(b) - val(a) : val(a) - val(b);
      });
    }
    return list;
  }, [enrichedCoins, activeTab, sortKey, sortDir, isFavorite]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const SortArrow = ({ col }: { col: SortKey }) =>
    sortKey === col ? <span className="ml-0.5 text-primary">{sortDir === "asc" ? "↑" : "↓"}</span> : null;

  return (
    <div className="screen">
      <div className="top-bar">
        <span className="font-syne font-bold text-base text-text-primary">Markets</span>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-border">
            {(["1h", "24h"] as const).map((t) => (
              <button key={t} onClick={() => setShowChange(t)}
                className={cn("px-2 py-1 font-outfit text-[10px] font-medium transition-colors",
                  showChange === t ? "bg-primary/10 text-primary" : "text-text-muted")}>
                {t}
              </button>
            ))}
          </div>
          <button onClick={() => setSearchVisible((v) => !v)}
            className="tap-target text-text-muted" aria-label="Search">
            <IconSearch size={20} />
          </button>
        </div>
      </div>

      {searchVisible && (
        <div className="px-4 py-2 border-b border-border bg-bg">
          <input type="text" value={search}
            onChange={(e) => setSearch(e.target.value.toUpperCase())}
            placeholder="Search coins" className="input-field text-sm" autoFocus />
        </div>
      )}

      <div className="flex border-b border-border overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("flex-shrink-0 px-4 py-3 font-outfit text-sm font-medium border-b-2 transition-all",
              activeTab === tab ? "text-text-primary border-primary" : "text-text-muted border-transparent")}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "All" && !search && (
        <div className="flex gap-1.5 px-4 py-2 overflow-x-auto no-scrollbar border-b border-border">
          {CHAIN_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setChainFilter(f.value)}
              className={cn(
                "flex-shrink-0 px-3 py-1 rounded-full font-outfit text-[11px] font-medium transition-all border",
                chainFilter === f.value ? "bg-primary/10 text-primary border-primary/30" : "text-text-muted border-border"
              )}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {(activeTab === "All" || activeTab === "Favourites") && (
        <div className="flex items-center px-4 py-2 border-b border-border">
          <button onClick={() => handleSort("volume")}
            className="flex-1 font-outfit text-[10px] text-text-muted uppercase tracking-wide text-left">
            Name / Vol <SortArrow col="volume" />
          </button>
          <button onClick={() => handleSort("price")}
            className="w-24 font-outfit text-[10px] text-text-muted uppercase tracking-wide text-right">
            Price <SortArrow col="price" />
          </button>
          <button onClick={() => handleSort("change")}
            className="w-20 font-outfit text-[10px] text-text-muted uppercase tracking-wide text-right">
            {showChange} % <SortArrow col="change" />
          </button>
          <div className="w-8" />
        </div>
      )}

      {loading ? (
        Array.from({ length: 12 }).map((_, i) => <SkeletonCoinRow key={i} />)
      ) : error ? (
        <div className="py-16 text-center px-6">
          <p className="text-text-muted font-outfit text-sm mb-3">Could not load market data.</p>
          <button onClick={() => fetchCoins(1, true)} className="text-primary font-outfit text-sm">Try again</button>
        </div>
      ) : displayCoins.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-text-muted font-outfit text-sm">
            {activeTab === "Favourites" ? "No favourites yet — star a coin to add it" :
             search ? `No results for "${search}"` : "No coins in this category yet"}
          </p>
        </div>
      ) : (
        <>
          {/* Show banner when prices are zero (cron not yet seeded) */}
          {displayCoins[0]?.price === "0" && displayCoins[0]?.volume_24h === "0" && (
            <div className="mx-4 my-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <p className="font-outfit text-[11px] text-primary text-center">
                Live prices updating — please wait a moment
              </p>
            </div>
          )}
          {displayCoins.map((coin) => (
            <CoinRow key={coin.symbol} {...coin}
              showChange={showChange}
              isFav={isFavorite(coin.symbol)}
              onToggleFav={toggleFavorite}
              onClick={() => router.push(`/markets/${coin.symbol}`)}
              observerRef={attachObserver}
            />
          ))}
          {activeTab !== "Favourites" && <div ref={sentinelRef} className="h-4" />}
          {loadingMore && (
            <div className="py-4 flex justify-center">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}
          {!hasMore && coins.length > 0 && (
            <p className="py-6 text-center font-outfit text-xs text-text-muted">
              All {coins.length} coins loaded
            </p>
          )}
        </>
      )}
    </div>
  );
}
