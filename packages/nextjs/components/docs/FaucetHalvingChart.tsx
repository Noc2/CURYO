"use client";

import { useMemo, useState } from "react";

const CHART_W = 640;
const CHART_H = 220;
const PADDING_X = 8;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28;
const LABEL_AREA = 54;

// ParticipationPool contract constants (distribution-based halving)
const INITIAL_RATE_BPS = 9000; // 90%
const INITIAL_TIER_AMOUNT = 2_000_000; // 2M cREP
const MIN_RATE_BPS = 100; // 1% floor
const NUM_TIERS = 4; // tiers 0-3 (30M distributed across tiers; 4M remains at floor rate)

type TierData = {
  tier: number;
  rateBps: number;
  ratePercent: number;
  tierAmount: number;
  cumulativeDistributed: number;
};

function buildTiers(): TierData[] {
  const tiers: TierData[] = [];
  let cumulative = 0;
  for (let t = 0; t < NUM_TIERS; t++) {
    const rawRate = Math.floor(INITIAL_RATE_BPS / Math.pow(2, t));
    const rateBps = Math.max(rawRate, MIN_RATE_BPS);
    const ratePercent = rateBps / 100;
    const tierAmount = t === 0 ? INITIAL_TIER_AMOUNT : INITIAL_TIER_AMOUNT * Math.pow(2, t);
    cumulative += tierAmount;
    tiers.push({ tier: t, rateBps, ratePercent, tierAmount, cumulativeDistributed: cumulative });
  }
  return tiers;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

/**
 * SVG bar chart showing the participation pool halving schedule — reward rate per distribution tier.
 */
export function FaucetHalvingChart() {
  const [hoveredTier, setHoveredTier] = useState<number | null>(null);

  const tiers = useMemo(() => buildTiers(), []);

  const chartWidth = CHART_W - LABEL_AREA;
  const chartHeight = CHART_H - PADDING_TOP - PADDING_BOTTOM;

  // Linear scale for Y axis (rate 0% to 100%)
  const maxRate = 100;
  const yForRate = (rate: number) => {
    return PADDING_TOP + (1 - rate / maxRate) * chartHeight;
  };

  // Bar geometry
  const barGap = 4;
  const totalBarSpace = chartWidth - 2 * PADDING_X;
  const groupWidth = (totalBarSpace - barGap * (NUM_TIERS - 1)) / NUM_TIERS;
  const barWidth = groupWidth - 4;
  const xForTier = (tier: number) => PADDING_X + tier * (groupWidth + barGap);

  // Y-axis labels
  const yLabels = [1, 10, 25, 50, 90];

  return (
    <div className="relative my-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-base font-medium text-base-content/60">Participation Pool Rate Halving</span>
        <span className="text-base tabular-nums text-base-content/40">Rate % by cumulative cREP distributed</span>
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
            y1={yForRate(val)}
            x2={chartWidth - PADDING_X}
            y2={yForRate(val)}
            stroke="var(--color-base-content)"
            strokeOpacity={0.06}
            strokeDasharray="4 3"
          />
        ))}

        {/* Bars — single bar per tier showing rate */}
        {tiers.map(t => {
          const x = xForTier(t.tier) + 2;
          const yBottom = yForRate(0);
          const yTop = yForRate(t.ratePercent);
          const isHovered = hoveredTier === t.tier;
          return (
            <rect
              key={t.tier}
              x={x}
              y={yTop}
              width={barWidth}
              height={Math.max(yBottom - yTop, 1)}
              rx={1.5}
              fill="#FFC43D"
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
            y={yForRate(val) + 3}
            fill="var(--color-base-content)"
            fillOpacity={0.3}
            fontSize={10}
          >
            {val}%
          </text>
        ))}

        {/* X-axis tier labels */}
        {tiers.map(t => (
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
        {tiers.map(t => (
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
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: "#FFC43D", opacity: 0.6 }} />
          Reward rate (% of stake)
        </span>
        <span className="ml-auto">X-axis: Tier | Y-axis: Rate %</span>
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
          <div className="font-medium text-base-content/80">Tier {tiers[hoveredTier].tier}</div>
          <div className="text-base-content/50 text-xs mt-0.5">
            Rate: {tiers[hoveredTier].ratePercent}% | Stake 100 &rarr;{" "}
            {((100 * tiers[hoveredTier].rateBps) / 10000).toFixed(1)} cREP
          </div>
          <div className="text-base-content/50 text-xs">
            Distributed in tier: {formatAmount(tiers[hoveredTier].tierAmount)} cREP
          </div>
          <div className="text-base-content/40 text-xs">
            Cumulative: {formatAmount(tiers[hoveredTier].cumulativeDistributed)} cREP
          </div>
        </div>
      )}
    </div>
  );
}
