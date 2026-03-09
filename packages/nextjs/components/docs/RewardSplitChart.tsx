"use client";

import { useState } from "react";

const SLICES = [
  { label: "Revealed loser rebate", value: 5, color: "#8B5E34" },
  { label: "Voter pool (content-specific)", value: 77.9, color: "#359EEE" },
  { label: "Consensus subsidy reserve", value: 4.75, color: "#F97316" },
  { label: "Content submitter", value: 9.5, color: "#FFC43D" },
  { label: "Frontend operators", value: 0.95, color: "#EF476F" },
  { label: "Category submitters", value: 0.95, color: "#2B7FCC" },
  { label: "Treasury", value: 0.95, color: "#029B7B" },
];

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 80;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

/**
 * Static SVG pie chart showing the effective split of the raw losing pool.
 */
export function RewardSplitChart() {
  const [hovered, setHovered] = useState<number | null>(null);

  let currentAngle = 0;
  const arcs = SLICES.map((slice, i) => {
    const angle = (slice.value / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;
    return { ...slice, startAngle, endAngle, index: i };
  });

  const formatValue = (value: number) => {
    if (Number.isInteger(value)) return `${value}%`;
    return `${value.toFixed(2).replace(/\.?0+$/, "")}%`;
  };

  return (
    <div className="flex items-center gap-6 my-4">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-[160px] h-[160px] shrink-0">
        {arcs.map(arc => (
          <path
            key={arc.index}
            d={describeArc(CENTER, CENTER, RADIUS, arc.startAngle, arc.endAngle)}
            fill={arc.color}
            fillOpacity={hovered === null || hovered === arc.index ? 0.8 : 0.3}
            stroke="var(--color-base-100)"
            strokeWidth={1.5}
            onMouseEnter={() => setHovered(arc.index)}
            onMouseLeave={() => setHovered(null)}
            className="transition-[fill-opacity] duration-150 cursor-default"
          />
        ))}
      </svg>
      <div className="flex flex-col gap-1.5">
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
              <span className="font-mono font-medium text-base-content/90">{formatValue(slice.value)}</span>{" "}
              {slice.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
