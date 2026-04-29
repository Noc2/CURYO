"use client";

import { useState } from "react";
import { HREP_INITIAL_MINTED_SUPPLY_COMPACT_LABEL, tokenAllocationChartSlices } from "~~/lib/docs/tokenomics";

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 80;
const INNER_RADIUS = 48;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeDonut(cx: number, cy: number, outer: number, inner: number, startAngle: number, endAngle: number) {
  const outerStart = polarToCartesian(cx, cy, outer, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outer, startAngle);
  const innerStart = polarToCartesian(cx, cy, inner, startAngle);
  const innerEnd = polarToCartesian(cx, cy, inner, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${inner} ${inner} 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

/**
 * SVG donut chart showing the token allocation across all system-controlled pools.
 */
export function TokenAllocationChart() {
  const [hovered, setHovered] = useState<number | null>(null);

  let currentAngle = 0;
  const arcs = tokenAllocationChartSlices
    .filter(slice => slice.value > 0)
    .map(slice => {
      const angle = (slice.value / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;
      return { ...slice, startAngle, endAngle };
    });

  return (
    <div className="flex items-center gap-6 my-4">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-[160px] h-[160px] shrink-0">
        {arcs.map(arc => (
          <path
            key={arc.index}
            d={describeDonut(CENTER, CENTER, RADIUS, INNER_RADIUS, arc.startAngle, arc.endAngle)}
            fill={arc.color}
            fillOpacity={hovered === null || hovered === arc.index ? 0.8 : 0.3}
            stroke="var(--color-base-100)"
            strokeWidth={1.5}
            onMouseEnter={() => setHovered(arc.index)}
            onMouseLeave={() => setHovered(null)}
            className="transition-[fill-opacity] duration-150 cursor-default"
          />
        ))}
        {/* Center label */}
        <text
          x={CENTER}
          y={CENTER - 4}
          textAnchor="middle"
          fill="var(--color-base-content)"
          fillOpacity={0.5}
          fontSize={11}
          fontWeight={500}
        >
          {HREP_INITIAL_MINTED_SUPPLY_COMPACT_LABEL}
        </text>
        <text
          x={CENTER}
          y={CENTER + 10}
          textAnchor="middle"
          fill="var(--color-base-content)"
          fillOpacity={0.3}
          fontSize={9}
        >
          HREP
        </text>
      </svg>
      <div className="flex flex-col gap-2">
        {tokenAllocationChartSlices.map(slice => (
          <div
            key={slice.index}
            className={`flex items-center gap-2 text-sm transition-opacity duration-150 ${
              hovered !== null && hovered !== slice.index ? "opacity-40" : ""
            }`}
            onMouseEnter={() => setHovered(slice.index)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
            <span className="text-base-content/70">
              <span className="font-mono font-medium text-base-content/90">{slice.percentLabel}</span> {slice.label}{" "}
              <span className="text-base-content/60">({slice.amountLabel})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
