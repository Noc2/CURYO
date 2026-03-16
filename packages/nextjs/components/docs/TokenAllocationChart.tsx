"use client";

import { useState } from "react";

const SLICES = [
  { label: "Faucet Pool", amount: "51,899,900 cREP", value: 51.8999, percentLabel: "51.8999%", color: "#7E8996" },
  { label: "Participation Pool", amount: "34,000,000 cREP", value: 34, percentLabel: "34.0%", color: "#F26426" },
  { label: "Treasury", amount: "10,000,000 cREP", value: 10, percentLabel: "10.0%", color: "#F5F0EB" },
  {
    label: "Consensus Subsidy Reserve",
    amount: "4,000,000 cREP",
    value: 4,
    percentLabel: "4.0%",
    color: "#B3341B",
  },
  {
    label: "Keeper Reward Pool",
    amount: "100,000 cREP",
    value: 0.1,
    percentLabel: "0.1%",
    color: "rgba(242, 100, 38, 0.55)",
  },
  {
    label: "Category Registry",
    amount: "100 cREP",
    value: 0.0001,
    percentLabel: "0.0001%",
    color: "rgba(126, 137, 150, 0.55)",
  },
];

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
  const arcs = SLICES.map((slice, i) => {
    const angle = (slice.value / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;
    return { ...slice, startAngle, endAngle, index: i };
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
          100M
        </text>
        <text
          x={CENTER}
          y={CENTER + 10}
          textAnchor="middle"
          fill="var(--color-base-content)"
          fillOpacity={0.3}
          fontSize={9}
        >
          cREP
        </text>
      </svg>
      <div className="flex flex-col gap-2">
        {SLICES.map((slice, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 text-sm transition-opacity duration-150 ${
              hovered !== null && hovered !== i ? "opacity-40" : ""
            }`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
            <span className="text-base-content/70">
              <span className="font-mono font-medium text-base-content/90">{slice.percentLabel}</span> {slice.label}{" "}
              <span className="text-base-content/40">({slice.amount})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
