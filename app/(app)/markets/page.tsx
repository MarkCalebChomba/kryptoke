"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MarketRow } from "@/components/markets/MarketRow";
import { SkeletonCoinRow } from "@/components/shared/Skeleton";
import { useBinanceWebSocket, useMarketOverview, TRACKED_SYMBOLS } from "@/lib/hooks/useMarketData";
import { usePrices, usePreferences, useAppStore } from "@/lib/store";
import { useWallet } from "@/lib/hooks/useWallet";
import { apiGet } from "@/lib/api/client";
import { IconSearch } from "@/components/icons";
import { cn } from "@/lib/utils/cn";

type MarketTab = "All" | "Favorites" | "New" | "Gainers" | "Losers";
type SortKey   = "volume" | "price" | "change";
type SortDir   = "asc"    | "desc";

const TABS: MarketTab[] = ["All", "Favorites", "New", "Gainers", "Losers"];
// First page shown immediately — these are all in WS stream so prices are live instantly
const INITIAL_VISIBLE = 60;

export default function MarketsPage() {
  const router = useRouter();
  useBinanceWebSocket();

  const [activeTab,     setActiveTab]     = useState<MarketTab>("All");
  const [search,        setSearch]        = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [sortKey,       setSortKey]       = useState<SortKey>("volume");
  const [sortDir,       setSortDir]       = useState<SortDir>("desc");
  const [showChange,    setShowChange]    = useState<"1h" | "24h">("24h");

  // Progressive loading state for tokens 61+
  const [extendedPrices, setExtendedPrices] = useState<Record<string, { price: string; change: string; volume: string }>>({});
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [allLoaded,      setAllLoaded]      = useState(false);

  const overview = useMarketOverview();
  const { prices, priceChanges, priceChanges1h, volumes } = usePrices();
  const { isFavorite } = usePreferences();
  const { rate } = useWallet();
  const kesPerUsd = rate?.kesPerUsd ?? "130";

  const allTokens = overview.data ?? [];

  // Tokens in WS stream = first 60 (TRACKED_SYMBOLS). Tokens beyond = need REST fetch.
  const wsSymbolSet = useMemo(() => new Set(TRACKED_SYMBOLS), []);

  // Enrich every token: WS data for first 60, extendedPrices for the rest
  const enriched = useMemo(() => {
    return allTokens.map((t) => {
      const ticker  = `${t.symbol}USDT`;
      const inWs    = wsSymbolSet.has(t.symbol);
      const ext     = extendedPrices[t.symbol];
      return {
        ...t,
        livePrice:    inWs ? (prices[ticker]       ?? t.price)   : (ext?.price   ?? t.price),
        liveChange:   inWs ? (priceChanges[ticker] ?? "0")       : (ext?.change  ?? "0"),
        liveChange1h: inWs ? (priceChanges1h[ticker] ?? "0")     : "0",
        liveVolume:   inWs ? (volumes[ticker]      ?? "0")       : (ext?.volume  ?? "0"),
        inWs,
      };
    });
  }, [allTokens, wsSymbolSet, prices, priceChanges, priceChanges1h, volumes, extendedPrices]);

  // Fetch prices for tokens beyond the first 60 (on demand)
  const loadMorePrices = useCallback(async () => {
    if (loadingMore || allLoaded) return;
    setLoadingMore(true);
    try {
      const toFetch = allTokens
        .filter(t => !wsSymbolSet.has(t.symbol) && !extendedPrices[t.symbol])
        .map(t => t.symbol);

      if (toFetch.length === 0) { setAllLoaded(true); return; }

      // Fetch in batches of 50 via our server proxy
      for (let i = 0; i < toFetch.length; i += 50) {
        const batch = toFetch.slice(i, i + 50);
        const data = await apiGet<Record<string, { price: string; change: string; volume: string }>>(
          `/market/prices?symbols=${batch.join(",")}`
        );
        setExtendedPrices(prev => ({ ...prev, ...data }));
        // Also push prices into global store so token detail pages get them
        const priceMap: Record<string, string> = {};
        Object.entries(data).forEach(([sym, d]) => { priceMap[`${sym}USDT`] = d.price; });
        useAppStore.getState().setPrices(priceMap);
      }
      setAllLoaded(true);
    } catch { /* non-fatal */ }
    finally { setLoadingMore(false); }
  }, [allTokens, wsSymbolSet, extendedPrices, loadingMore, allLoaded]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = [...enriched];
    switch (activeTab) {
      case "Favorites": list = list.filter(c => isFavorite(c.address)); break;
      case "New":       list = list.filter(c => c.isNew || parseFloat(c.liveChange) > 5); break;
      case "Gainers":
        list = list.filter(c => parseFloat(c.liveChange) > 0)
          .sort((a, b) => parseFloat(b.liveChange) - parseFloat(a.liveChange));
        break;
      case "Losers":
        list = list.filter(c => parseFloat(c.liveChange) < 0)
          .sort((a, b) => parseFloat(a.liveChange) - parseFloat(b.liveChange));
        break;
    }
    if (search) {
      const q = search.toUpperCase();
      list = list.filter(c => c.symbol.includes(q) || c.name.toUpperCase().includes(q));
    }
    if (activeTab === "All") {
      list.sort((a, b) => {
        const av = sortKey === "volume" ? parseFloat(a.liveVolume)
                 : sortKey === "price"  ? parseFloat(a.livePrice)
                 : parseFloat(a.liveChange);
        const bv = sortKey === "volume" ? parseFloat(b.liveVolume)
                 : sortKey === "price"  ? parseFloat(b.livePrice)
                 : parseFloat(b.liveChange);
        return sortDir === "desc" ? bv - av : av - bv;
      });
    }
    return list;
  }, [enriched, activeTab, search, sortKey, sortDir, isFavorite]);

  // First 60 always visible. Beyond 60 only after "Load more" is tapped.
  const hasMore   = filtered.length > INITIAL_VISIBLE && !allLoaded;
  const visible   = allLoaded || search ? filtered : filtered.slice(0, INITIAL_VISIBLE);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const SortArrow = ({ col }: { col: SortKey }) =>
    sortKey === col ? <span className="ml-0.5 text-primary">{sortDir === "asc" ? "↑" : "↓"}</span> : null;

  return (
    <div className="screen">
      {/* Top bar */}
      <div className="top-bar">
        <span className="font-syne font-bold text-base text-text-primary">
          Markets
          {allTokens.length > 0 && (
            <span className="ml-2 font-outfit text-[10px] text-text-muted font-normal">
              {allTokens.length} pairs
            </span>
          )}
        </span>
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
          <button onClick={() => setSearchVisible(v => !v)}
            className="tap-target text-text-muted" aria-label="Search">
            <IconSearch size={20} />
          </button>
        </div>
      </div>

      {/* Search */}
      {searchVisible && (
        <div className="px-4 py-2 border-b border-border bg-bg">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or symbol" className="input-field text-sm" autoFocus />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("flex-shrink-0 px-4 py-3 font-outfit text-sm font-medium border-b-2 transition-all",
              activeTab === tab ? "text-text-primary border-primary" : "text-text-muted border-transparent")}>
            {tab}
          </button>
        ))}
      </div>

      {/* Column headers */}
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

      {/* Coin list */}
      {overview.isLoading ? (
        Array.from({ length: 12 }).map((_, i) => <SkeletonCoinRow key={i} />)
      ) : overview.isError ? (
        <div className="py-16 text-center px-6">
          <p className="text-text-muted font-outfit text-sm mb-3">Could not load market data.</p>
          <button onClick={() => overview.refetch()} className="text-primary font-outfit text-sm">Try again</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-text-muted font-outfit text-sm">
            {search ? `No results for "${search}"` : "No coins in this category"}
          </p>
        </div>
      ) : (
        <>
          {visible.map((coin) => {
            const displayChange = showChange === "1h" ? coin.liveChange1h : coin.liveChange;
            return (
              <MarketRow
                key={coin.symbol}
                symbol={coin.symbol}
                name={coin.name}
                address={coin.address}
                basePrice={coin.livePrice}
                baseChange={displayChange}
                volume={coin.liveVolume}
                iconUrl={coin.iconUrl}
                isNew={coin.isNew}
                isSeed={coin.isSeed}
                kesPerUsd={kesPerUsd}
                onClick={() => router.push(`/markets/${coin.symbol}`)}
              />
            );
          })}

          {/* Load more — triggers REST fetch for tokens 61+ */}
          {hasMore && !search && (
            <button
              onClick={loadMorePrices}
              disabled={loadingMore}
              className="w-full py-4 font-outfit text-sm text-primary text-center border-t border-border active:bg-bg-surface2 disabled:opacity-60">
              {loadingMore
                ? "Loading prices..."
                : `Load ${filtered.length - INITIAL_VISIBLE} more tokens`
              }
            </button>
          )}

          {/* Live indicator for WS tokens */}
          {!search && visible.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 py-3">
              <div className="w-1.5 h-1.5 rounded-full bg-up animate-pulse" />
              <span className="font-outfit text-[10px] text-text-muted">
                {INITIAL_VISIBLE} live · {allLoaded ? `${allTokens.length} total` : `${allTokens.length - INITIAL_VISIBLE} more available`}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
