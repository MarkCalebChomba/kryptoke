"use client";

import { useState } from "react";
import { useFearGreed } from "@/lib/hooks/useMarketData";

const LEVELS = [
  { label: "Extreme Fear",  range: "0–20",   color: "#FF4560", bg: "rgba(255,69,96,0.12)" },
  { label: "Fear",          range: "21–40",  color: "#FF8C42", bg: "rgba(255,140,66,0.12)" },
  { label: "Neutral",       range: "41–60",  color: "#F0B429", bg: "rgba(240,180,41,0.12)" },
  { label: "Greed",         range: "61–80",  color: "#7EC850", bg: "rgba(126,200,80,0.12)" },
  { label: "Extreme Greed", range: "81–100", color: "#00D68F", bg: "rgba(0,214,143,0.12)" },
];

function getLevel(value: number) {
  if (value <= 20) return LEVELS[0]!;
  if (value <= 40) return LEVELS[1]!;
  if (value <= 60) return LEVELS[2]!;
  if (value <= 80) return LEVELS[3]!;
  return LEVELS[4]!;
}

function gaugePoint(value: number, r: number, cx: number, cy: number) {
  const angle = Math.PI - (value / 100) * Math.PI;
  return {
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  };
}

function ArcGauge({ value, color }: { value: number; color: string }) {
  const W = 240, H = 130;
  const cx = W / 2, cy = H - 10;
  const R = 100, r = 72;
  const strokeW = R - r;

  const needle = gaugePoint(value, (R + r) / 2, cx, cy);
  const end = gaugePoint(value, R, cx, cy);
  const endInner = gaugePoint(value, r, cx, cy);
  const largeArc = value > 50 ? 1 : 0;

  const filledArc = value <= 0
    ? ""
    : value >= 100
    ? `M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R} ${cy} L ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
    : `M ${cx - R} ${cy} A ${R} ${R} 0 ${largeArc} 1 ${end.x} ${end.y} L ${endInner.x} ${endInner.y} A ${r} ${r} 0 ${largeArc} 0 ${cx - r} ${cy} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible">
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#FF4560" />
          <stop offset="25%"  stopColor="#FF8C42" />
          <stop offset="50%"  stopColor="#F0B429" />
          <stop offset="75%"  stopColor="#7EC850" />
          <stop offset="100%" stopColor="#00D68F" />
        </linearGradient>
      </defs>
      {/* Track */}
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
        fill="none" stroke="#1C2840" strokeWidth={strokeW} strokeLinecap="butt" />
      {/* Faint full gradient */}
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
        fill="none" stroke="url(#gaugeGrad)" strokeWidth={strokeW} strokeLinecap="butt" opacity="0.2" />
      {/* Filled arc */}
      {filledArc && <path d={filledArc} fill={color} opacity="0.9" />}
      {/* Needle dot */}
      <circle cx={needle.x} cy={needle.y} r="6" fill={color}
        stroke="#080C14" strokeWidth="2.5"
        style={{ filter: `drop-shadow(0 0 6px ${color}80)` }} />
      {/* Value */}
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color}
        fontSize="28" fontFamily="var(--font-dm-mono), monospace" fontWeight="600">
        {value}
      </text>
      {/* Labels */}
      <text x={cx - R + 4} y={cy + 14} fill="#4A5B7A" fontSize="9" fontFamily="var(--font-outfit), sans-serif">Fear</text>
      <text x={cx + R - 4} y={cy + 14} fill="#4A5B7A" fontSize="9" fontFamily="var(--font-outfit), sans-serif" textAnchor="end">Greed</text>
    </svg>
  );
}

export function FearGreedGauge({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useFearGreed();
  const [showLegend, setShowLegend] = useState(false);
  const value = data?.value ?? 50;
  const level = getLevel(value);

  // Compact inline version for home page
  if (compact) {
    return (
      <div className="card flex items-center gap-4 py-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border"
          style={{ background: level.bg, borderColor: level.color + "40" }}>
          <span className="font-price text-lg font-bold" style={{ color: level.color }}>{value}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-outfit text-xs text-text-muted mb-1">Fear &amp; Greed Index</p>
          <div className="relative h-2 rounded-full overflow-hidden mb-1" style={{
            background: "linear-gradient(to right, #FF4560 0%, #FF8C42 25%, #F0B429 50%, #7EC850 75%, #00D68F 100%)"
          }}>
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-bg shadow transition-all duration-700"
              style={{ left: `calc(${value}% - 6px)`, backgroundColor: level.color }} />
          </div>
          <span className="font-syne font-bold text-xs" style={{ color: level.color }}>{level.label}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-syne font-bold text-base text-text-primary">Fear &amp; Greed</h2>
        <div className="flex items-center gap-2">
          {data?.timestamp && (
            <span className="font-outfit text-xs text-text-muted">
              {new Date(parseInt(data.timestamp) * 1000).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
            </span>
          )}
          <button onClick={() => setShowLegend((v) => !v)}
            className="font-outfit text-xs text-text-muted border border-border rounded-lg px-2.5 py-1">
            {showLegend ? "Hide" : "Levels"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="skeleton h-32 rounded-2xl" />
      ) : (
        <div className="card flex flex-col items-center py-3" style={{ borderColor: level.color + "30" }}>
          <ArcGauge value={value} color={level.color} />
          <span className="font-syne font-bold text-base mt-1" style={{ color: level.color }}>{level.label}</span>
          <p className="font-outfit text-xs text-text-muted mt-0.5">Bitcoin fear &amp; greed index</p>
        </div>
      )}

      {showLegend && (
        <div className="grid grid-cols-5 gap-1 mt-2 p-2 rounded-xl bg-bg-surface2 border border-border">
          {LEVELS.map((l) => (
            <div key={l.label} className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg"
              style={level.label === l.label ? { background: l.bg } : {}}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="font-outfit text-[8px] text-text-muted text-center leading-tight">{l.label}</span>
              <span className="font-price text-[8px]" style={{ color: l.color }}>{l.range}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
