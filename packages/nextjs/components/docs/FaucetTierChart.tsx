"use client";

import { useState } from "react";

const CHART_W = 640;
const CHART_H = 220;
const PADDING_X = 8;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28;
const LABEL_AREA = 54;

const TIER_DATA = [
  { tier: 0, label: "Genesis", amount: 10000, threshold: 0, maxClaimants: 10 },
  { tier: 1, label: "Early Adopter", amount: 1000, threshold: 10, maxClaimants: 990 },
  { tier: 2, label: "Pioneer", amount: 100, threshold: 1_000, maxClaimants: 9_000 },
  { tier: 3, label: "Explorer", amount: 10, threshold: 10_000, maxClaimants: 990_000 },
  { tier: 4, label: "Settler", amount: 1, threshold: 1_000_000, maxClaimants: Infinity },
];

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

/**
 * SVG bar chart showing faucet claim amount per tier (log scale).
 */
export function FaucetTierChart() {
  const [hoveredTier, setHoveredTier] = useState<number | null>(null);

  const chartWidth = CHART_W - LABEL_AREA;
  const chartHeight = CHART_H - PADDING_TOP - PADDING_BOTTOM;

  // Log scale for Y axis (1 to 10000 cREP)
  const maxLog = Math.log10(10000);
  const minLog = Math.log10(1);
  const yForAmount = (amount: number) => {
    const logVal = Math.log10(Math.max(amount, 1));
    return PADDING_TOP + (1 - (logVal - minLog) / (maxLog - minLog)) * chartHeight;
  };

  // Bar geometry
  const barGap = 4;
  const numTiers = TIER_DATA.length;
  const totalBarSpace = chartWidth - 2 * PADDING_X;
  const groupWidth = (totalBarSpace - barGap * (numTiers - 1)) / numTiers;
  const barWidth = groupWidth - 4;
  const xForTier = (tier: number) => PADDING_X + tier * (groupWidth + barGap);

  // Y-axis labels
  const yLabels = [1, 10, 100, 1000, 10000];

  return (
    <div className="relative my-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-base font-medium text-base-content/60">Faucet Claim Amount by Tier</span>
        <span className="text-base tabular-nums text-base-content/40">cREP per claim (log scale)</span>
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full h-[220px] rounded-lg bg-base-content/[0.02]"
        preserveAspectRatio="none"
        onMouseLeave={() => setHoveredTier(null)}
      >
        {/* Horizontal grid lines */}
        {yLabels.map(val => (
          <line
            key={val}
            x1={PADDING_X}
            y1={yForAmount(val)}
            x2={chartWidth - PADDING_X}
            y2={yForAmount(val)}
            stroke="var(--color-base-content)"
            strokeOpacity={0.06}
            strokeDasharray="4 3"
          />
        ))}

        {/* Bars */}
        {TIER_DATA.map(t => {
          const x = xForTier(t.tier) + 2;
          const yBottom = yForAmount(1);
          const yTop = yForAmount(t.amount);
          const isHovered = hoveredTier === t.tier;
          return (
            <rect
              key={t.tier}
              x={x}
              y={yTop}
              width={barWidth}
              height={Math.max(yBottom - yTop, 1)}
              rx={1.5}
              fill="#7E8996"
              fillOpacity={hoveredTier === null ? 0.6 : isHovered ? 0.8 : 0.2}
              className="transition-[fill-opacity] duration-100"
              onMouseEnter={() => setHoveredTier(t.tier)}
            />
          );
        })}

        {/* Y-axis labels (right side) */}
        {yLabels.map(val => (
          <text
            key={val}
            x={chartWidth + 4}
            y={yForAmount(val) + 3}
            fill="var(--color-base-content)"
            fillOpacity={0.3}
            fontSize={10}
          >
            {formatAmount(val)}
          </text>
        ))}

        {/* X-axis tier labels */}
        {TIER_DATA.map(t => (
          <text
            key={t.tier}
            x={xForTier(t.tier) + groupWidth / 2}
            y={CHART_H - 6}
            fill="var(--color-base-content)"
            fillOpacity={0.3}
            fontSize={10}
            textAnchor="middle"
          >
            {t.tier}
          </text>
        ))}

        {/* Invisible hit areas per tier */}
        {TIER_DATA.map(t => (
          <rect
            key={`hit-${t.tier}`}
            x={xForTier(t.tier) - barGap / 2}
            y={0}
            width={groupWidth + barGap}
            height={CHART_H}
            fill="transparent"
            onMouseEnter={() => setHoveredTier(t.tier)}
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1.5 text-xs text-base-content/40">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: "#7E8996", opacity: 0.6 }} />
          Claim amount (cREP)
        </span>
        <span className="ml-auto">X-axis: Tier | Y-axis: cREP (log scale)</span>
      </div>

      {/* Tooltip */}
      {hoveredTier !== null && (
        <div
          className="absolute pointer-events-none bg-base-300 text-base-content text-sm px-3 py-2 rounded-lg shadow-lg whitespace-nowrap"
          style={{
            left: `${((xForTier(hoveredTier) + groupWidth / 2) / CHART_W) * 100}%`,
            top: "24px",
            transform: "translate(-50%, 0)",
          }}
        >
          <div className="font-medium text-base-content/80">
            Tier {TIER_DATA[hoveredTier].tier}: {TIER_DATA[hoveredTier].label}
          </div>
          <div className="text-base-content/50 text-xs mt-0.5">
            Claim: {formatAmount(TIER_DATA[hoveredTier].amount)} cREP | Referral bonus:{" "}
            {formatAmount(TIER_DATA[hoveredTier].amount / 2)} cREP
          </div>
          <div className="text-base-content/50 text-xs">
            Claimants: {formatAmount(TIER_DATA[hoveredTier].threshold)} &ndash;{" "}
            {TIER_DATA[hoveredTier].maxClaimants === Infinity
              ? "unlimited"
              : formatAmount(TIER_DATA[hoveredTier].threshold + TIER_DATA[hoveredTier].maxClaimants - 1)}
          </div>
          <div className="text-base-content/40 text-xs">
            Base tokens in tier:{" "}
            {TIER_DATA[hoveredTier].maxClaimants === Infinity
              ? "remaining pool"
              : formatAmount(TIER_DATA[hoveredTier].maxClaimants * TIER_DATA[hoveredTier].amount)}
          </div>
        </div>
      )}
    </div>
  );
}
