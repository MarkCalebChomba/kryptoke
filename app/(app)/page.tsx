"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HomeTopBar } from "@/components/home/HomeTopBar";
import { PortfolioCard } from "@/components/home/PortfolioCard";
import { EventsCalendar } from "@/components/home/EventsCalendar";
import { NotificationsSheet } from "@/components/home/NotificationsSheet";
import { MenuSheet } from "@/components/home/MenuSheet";
import { DepositSheet } from "@/components/home/DepositSheet";
import { P2PSheet } from "@/components/home/P2PSheet";
import { useWallet } from "@/lib/hooks/useWallet";
import { useHomeData } from "@/lib/hooks/useMarketData";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { usePreferences } from "@/lib/store";
import { formatPrice, formatChange, priceDirection } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

// ── Hardcoded fallback coins shown until Redis is seeded ──────────────────────
const FALLBACK_SYMBOLS = ["BTC", "ETH", "BNB", "SOL", "XRP"];
const FALLBACK_META: Record<string, { name: string; logo: string }> = {
  BTC: { name: "Bitcoin",  logo: "https://assets.coingecko.com/coins/images/1/thumb/bitcoin.png" },
  ETH: { name: "Ethereum", logo: "https://assets.coingecko.com/coins/images/279/thumb/ethereum.png" },
  BNB: { name: "BNB",      logo: "https://assets.coingecko.com/coins/images/825/thumb/bnb-icon2_2x.png" },
  SOL: { name: "Solana",   logo: "https://assets.coingecko.com/coins/images/4128/thumb/solana.png" },
  XRP: { name: "XRP",      logo: "https://assets.coingecko.com/coins/images/44/thumb/xrp-symbol-white-128.png" },
};

// ── Mini sparkline for coin tiles ─────────────────────────────────────────────
function TileSparkline({ change }: { change: string }) {
  const pct = parseFloat(change) || 0;
  const color = pct >= 0 ? "#00D68F" : "#FF4560";
  const pts: number[] = [];
  let v = 50;
  const seed = Math.abs(pct * 137.5) % 100;
  for (let i = 0; i < 8; i++) {
    const noise = ((seed * (i + 1) * 6.7) % 18) - 9;
    v = Math.max(10, Math.min(90, v + noise));
    pts.push(v);
  }
  pts[7] = pct >= 0 ? Math.min(85, 50 + Math.abs(pct) * 2.5) : Math.max(15, 50 - Math.abs(pct) * 2.5);
  const W = 80, H = 28, xStep = W / (pts.length - 1);
  const toY = (v: number) => H - ((v - 10) / 80) * H;
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${(i * xStep).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <path d={d + ` L ${W} ${H} L 0 ${H} Z`} fill={color} fillOpacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Mini coin tile ─────────────────────────────────────────────────────────────
function CoinTile({ symbol, name, logo_url, price, change_24h, onClick }: {
  symbol: string; name: string; logo_url: string;
  price: string; change_24h: string; onClick: () => void;
}) {
  const dir = priceDirection(change_24h);
  const isPos = dir === "up";
  const isNeg = dir === "down";

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-[110px] rounded-2xl border border-border bg-bg-surface p-2.5 text-left active:scale-95 transition-transform overflow-hidden"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className="w-6 h-6 rounded-full bg-bg-surface2 overflow-hidden flex items-center justify-center flex-shrink-0 border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo_url} alt={symbol} className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
        <div className="min-w-0">
          <p className="font-outfit font-bold text-xs text-text-primary">{symbol}</p>
        </div>
      </div>
      <TileSparkline change={change_24h} />
      <p className="font-price text-sm font-semibold text-text-primary tabular-nums mt-1">
        {formatPrice(price)}
      </p>
      <span className={cn(
        "inline-block text-[10px] font-price font-semibold mt-0.5 px-1.5 py-0.5 rounded tabular-nums",
        isPos ? "bg-up/15 text-up" : isNeg ? "bg-down/15 text-down" : "bg-bg-surface2 text-text-muted"
      )}>
        {formatChange(change_24h)}
      </span>
    </button>
  );
}

// ── Inline semicircle Fear & Greed ────────────────────────────────────────────
function FearGreedSemi({ value, label, color }: { value: number; label: string; color: string }) {
  const W = 140, H = 80, cx = W / 2, cy = H - 4;
  const R = 58, r = 40;

  const toPoint = (v: number, radius: number) => {
    const angle = Math.PI - (v / 100) * Math.PI;
    return { x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle) };
  };

  const needle = toPoint(value, (R + r) / 2);
  const endOuter = toPoint(value, R);
  const endInner = toPoint(value, r);
  const largeArc = value > 50 ? 1 : 0;

  const filledPath = value <= 0
    ? ""
    : value >= 100
    ? `M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R} ${cy} L ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
    : `M ${cx - R} ${cy} A ${R} ${R} 0 ${largeArc} 1 ${endOuter.x.toFixed(2)} ${endOuter.y.toFixed(2)} L ${endInner.x.toFixed(2)} ${endInner.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${cx - r} ${cy} Z`;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible">
        <defs>
          <linearGradient id="sgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#FF4560" />
            <stop offset="25%"  stopColor="#FF8C42" />
            <stop offset="50%"  stopColor="#F0B429" />
            <stop offset="75%"  stopColor="#7EC850" />
            <stop offset="100%" stopColor="#00D68F" />
          </linearGradient>
        </defs>
        {/* Track bg */}
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none" stroke="#1C2840" strokeWidth={R - r} strokeLinecap="butt" />
        {/* Faint gradient */}
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none" stroke="url(#sgGrad)" strokeWidth={R - r} strokeLinecap="butt" opacity="0.25" />
        {/* Filled arc */}
        {filledPath && <path d={filledPath} fill={color} opacity="0.9" />}
        {/* Needle dot */}
        <circle cx={needle.x} cy={needle.y} r="5" fill={color} stroke="#0A0F1E" strokeWidth="2"
          style={{ filter: `drop-shadow(0 0 5px ${color}90)` }} />
        {/* Value number */}
        <text x={cx} y={cy - 6} textAnchor="middle" fill={color}
          fontSize="22" fontFamily="var(--font-dm-mono), monospace" fontWeight="700">
          {value}
        </text>
        {/* Labels */}
        <text x={cx - R + 2} y={cy + 12} fill="#4A5B7A" fontSize="8" fontFamily="var(--font-outfit), sans-serif">Fear</text>
        <text x={cx + R - 2} y={cy + 12} fill="#4A5B7A" fontSize="8" fontFamily="var(--font-outfit), sans-serif" textAnchor="end">Greed</text>
      </svg>
      <span className="font-outfit text-[11px] font-semibold -mt-1" style={{ color }}>{label}</span>
    </div>
  );
}

// ── Quick actions — icon-first compact design ─────────────────────────────────
function QuickAction({ icon, label, color, bg, onClick }: {
  icon: React.ReactNode; label: string; color: string; bg: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
      <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center", bg)}>
        {icon}
      </div>
      <span className={cn("font-outfit text-[11px] font-semibold", color)}>{label}</span>
    </button>
  );
}

// ── Home page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [sendOpen,    setSendOpen]    = useState(false);

  useNotifications();

  const { totalKes, totalUsd, isLoading: walletLoading } = useWallet();
  const { data: homeData, isLoading: homeLoading } = useHomeData();
  const { isFavorite } = usePreferences();

  const serverCoins = homeData?.homeCoins ?? [];
  const fearGreed   = homeData?.fearGreed ?? null;
  const fgHistory   = homeData?.fgHistory ?? [];
  const overview    = homeData?.overview  ?? null;

  // Live prices from Binance for fallback coins
  const [liveData, setLiveData] = useState<Record<string, { price: string; change: string }>>({});
  useEffect(() => {
    fetch("https://api.binance.com/api/v3/ticker/24hr")
      .then((r) => r.json())
      .then((data: Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>) => {
        const map: Record<string, { price: string; change: string }> = {};
        for (const t of data) {
          if (FALLBACK_SYMBOLS.map(s => `${s}USDT`).includes(t.symbol)) {
            map[t.symbol.replace("USDT", "")] = { price: t.lastPrice, change: t.priceChangePercent };
          }
        }
        setLiveData(map);
      })
      .catch(() => {});
  }, []);

  // Build display coins — server coins if available, otherwise Binance fallback
  const displayCoins = serverCoins.length > 0
    ? serverCoins
    : FALLBACK_SYMBOLS.map((sym) => ({
        symbol:     sym,
        name:       FALLBACK_META[sym]!.name,
        logo_url:   FALLBACK_META[sym]!.logo,
        price:      liveData[sym]?.price ?? "0",
        change_24h: liveData[sym]?.change ?? "0",
      }));

  // F&G color
  const fgColor = !fearGreed ? "#F0B429"
    : fearGreed.value <= 20 ? "#FF4560"
    : fearGreed.value <= 40 ? "#FF8C42"
    : fearGreed.value <= 60 ? "#F0B429"
    : fearGreed.value <= 80 ? "#7EC850"
    : "#00D68F";

  return (
    <div className="screen">
      <HomeTopBar onBellClick={() => setNotifOpen(true)} onMenuClick={() => setMenuOpen(true)} />

      {/* Portfolio card */}
      <PortfolioCard
        totalKes={totalKes}
        totalUsd={totalUsd}
        isLoading={walletLoading}

      />

      {/* Quick actions — 5 across */}
      <div className="mx-4 mt-4 flex items-center justify-between">
        <QuickAction
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 4v16M4 12h16" stroke="#00D68F" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          }
          label="Deposit" color="text-up" bg="bg-up/10"
          onClick={() => setDepositOpen(true)}
        />
        <QuickAction
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 20V4M4 12l8-8 8 8" stroke="#FF4560" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
          label="Withdraw" color="text-down" bg="bg-down/10"
          onClick={() => router.push("/withdraw")}
        />
        <QuickAction
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M7 12h10M13 8l4 4-4 4" stroke="#F0B429" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
          label="Trade" color="text-gold" bg="bg-gold/10"
          onClick={() => router.push("/trade")}
        />
        <QuickAction
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="#F0B429" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 2L15 22l-4-9-9-4 20-7z" stroke="#F0B429" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
          label="Send" color="text-gold" bg="bg-gold/10"
          onClick={() => setSendOpen(true)}
        />
        <QuickAction
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 17l4-4 4 4 8-8" stroke="#A855F7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
          label="Earn" color="text-purple-400" bg="bg-purple-500/10"
          onClick={() => router.push("/earn")}
        />
      </div>

      {/* Fear & Greed — full row below actions */}
      <div className="mx-4 mt-4 flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-bg-surface border border-border">
        <div className="flex-1">
          <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">Fear &amp; Greed Index</p>
          {fearGreed ? (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-price text-2xl font-bold" style={{ color: fgColor }}>{fearGreed.value}</span>
              <span className="font-outfit text-xs font-semibold" style={{ color: fgColor }}>{fearGreed.classification}</span>
            </div>
          ) : (
            <div className="skeleton h-7 w-24 rounded mt-1" />
          )}
        </div>
        {fearGreed ? (
          <FearGreedSemi value={fearGreed.value} label={fearGreed.classification} color={fgColor} />
        ) : (
          <div className="w-[140px] h-[80px] skeleton rounded-xl" />
        )}
      </div>

      {/* Market overview strip */}
      {overview && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-bg-surface2 border border-border flex items-center justify-between">
          <div>
            <p className="font-outfit text-[10px] text-text-muted">24h Market Volume</p>
            <p className="font-price text-sm font-semibold text-text-primary">
              ${(parseFloat(overview.totalVolume24h) / 1e9).toFixed(1)}B
            </p>
          </div>
          <div className="text-right">
            <p className="font-outfit text-[10px] text-text-muted">BTC Price</p>
            <p className="font-price text-sm font-semibold text-text-primary">
              {liveData["BTC"] ? formatPrice(liveData["BTC"].price) : "—"}
            </p>
          </div>
        </div>
      )}

      <div className="h-5" />

      {/* Markets strip */}
      <div className="mx-4 mb-2 flex items-center justify-between">
        <h2 className="font-syne font-bold text-sm text-text-primary">Markets</h2>
        <button onClick={() => router.push("/markets")}
          className="font-outfit text-xs text-primary font-medium">See all →</button>
      </div>

      {homeLoading && serverCoins.length === 0 ? (
        <div className="flex gap-2 px-4 overflow-x-auto no-scrollbar">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[120px] h-24 rounded-2xl skeleton" />
          ))}
        </div>
      ) : (
        <div className="flex gap-2 px-4 overflow-x-auto no-scrollbar pb-1">
          {displayCoins.map((coin) => (
            <CoinTile
              key={coin.symbol}
              symbol={coin.symbol}
              name={coin.name}
              logo_url={coin.logo_url}
              price={coin.price}
              change_24h={coin.change_24h}
              onClick={() => router.push(`/markets/${coin.symbol}`)}
            />
          ))}
          <button onClick={() => router.push("/markets")}
            className="flex-shrink-0 w-[52px] rounded-2xl border border-dashed border-border flex flex-col items-center justify-center gap-1 text-text-muted active:bg-bg-surface2 transition-colors">
            <span className="text-base leading-none">→</span>
            <span className="font-outfit text-[9px]">All</span>
          </button>
        </div>
      )}

      <div className="h-5" />

      {/* Events calendar */}
      <EventsCalendar />

      <div className="h-24" />

      {/* Sheets */}
      <NotificationsSheet isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
      <MenuSheet isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <DepositSheet isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
      <P2PSheet isOpen={sendOpen} onClose={() => setSendOpen(false)} />
    </div>
  );
}
