"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { PonderTokenTransfer, ponderApi } from "~~/services/ponder/client";

const CHART_W = 640;
const CHART_H = 120;
const PADDING_X = 4;
const PADDING_Y = 12;
const LABEL_AREA = 48; // right side reserved for y-axis labels

/**
 * SVG chart showing the connected user's cREP balance over time,
 * reconstructed from Transfer events indexed by Ponder.
 */
export function BalanceHistory() {
  const { address } = useAccount();
  const [transfers, setTransfers] = useState<PonderTokenTransfer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!address) {
      setTransfers([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setFetchError(false);

    ponderApi
      .getBalanceHistory(address)
      .then(data => {
        if (!cancelled) setTransfers(data.transfers);
      })
      .catch(() => {
        if (!cancelled) {
          setTransfers([]);
          setFetchError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  // Reconstruct balance timeline from Transfer events
  const dataPoints = useMemo(() => {
    if (!address || transfers.length === 0) return [];

    const addrLower = address.toLowerCase();

    let balance = 0n;
    const points: Array<{ timestamp: number; balance: number }> = [];

    for (const t of transfers) {
      const amount = BigInt(t.amount);
      if (t.to.toLowerCase() === addrLower) {
        balance += amount;
      }
      if (t.from.toLowerCase() === addrLower) {
        balance -= amount;
      }
      const balanceNum = Number(balance) / 1e6;
      const ts = Number(t.timestamp);
      // Collapse events at the same timestamp into one point (keep latest balance)
      if (points.length > 0 && points[points.length - 1].timestamp === ts) {
        points[points.length - 1].balance = balanceNum;
      } else {
        points.push({ timestamp: ts, balance: balanceNum });
      }
    }

    return points;
  }, [transfers, address]);

  if (!address) return null;

  if (isLoading) {
    return (
      <div className="h-[160px] flex items-center justify-center">
        <span className="loading loading-spinner loading-sm text-base-content/20"></span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="h-[100px] flex items-center justify-center text-base text-error/60">
        Failed to load balance history
      </div>
    );
  }

  if (dataPoints.length < 2) {
    return (
      <div className="h-[100px] flex items-center justify-center text-base text-base-content/40">
        No balance history yet
      </div>
    );
  }

  const currentBalance = dataPoints[dataPoints.length - 1].balance;
  const currentFormatted = currentBalance.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="surface-card rounded-2xl p-6 w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-base font-medium text-base-content/60">Your cREP balance</span>
        <span className="text-base tabular-nums text-base-content/60">{currentFormatted} cREP</span>
      </div>
      <BalanceChart data={dataPoints} />
    </div>
  );
}

// --- SVG Chart ---

interface ChartPoint {
  timestamp: number;
  balance: number;
}

function BalanceChart({ data }: { data: ChartPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const n = data.length;
  const maxBalance = Math.max(...data.map(d => d.balance));
  const minBalance = 0;
  const range = maxBalance - minBalance || 1;

  const minTime = data[0].timestamp;
  const maxTime = data[n - 1].timestamp;
  const timeRange = maxTime - minTime || 1;

  const chartWidth = CHART_W - LABEL_AREA;

  // Map data points to SVG coordinates
  const points = data.map(d => {
    const x = PADDING_X + ((d.timestamp - minTime) / timeRange) * (chartWidth - 2 * PADDING_X);
    const y = PADDING_Y + (1 - (d.balance - minBalance) / range) * (CHART_H - 2 * PADDING_Y);
    return { x, y, ...d };
  });

  // Build step-line path (balance is constant between events)
  const pathParts: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < n; i++) {
    // Horizontal line to the new x, then vertical to the new y
    pathParts.push(`L ${points[i].x} ${points[i - 1].y}`);
    pathParts.push(`L ${points[i].x} ${points[i].y}`);
  }
  const linePath = pathParts.join(" ");

  // Area path
  const areaPath = `${linePath} L ${points[n - 1].x} ${CHART_H} L ${points[0].x} ${CHART_H} Z`;

  // Y-axis labels
  const topLabel = maxBalance.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const midLabel = (maxBalance / 2).toLocaleString(undefined, { maximumFractionDigits: 0 });

  // Format timestamp for tooltip
  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // Hit areas for hover detection
  const hitWidth = chartWidth / n;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full h-[120px] rounded-lg bg-base-content/[0.02]"
        preserveAspectRatio="none"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* Grid lines */}
        <line
          x1={PADDING_X}
          y1={PADDING_Y}
          x2={chartWidth - PADDING_X}
          y2={PADDING_Y}
          stroke="var(--color-base-content)"
          strokeOpacity={0.06}
          strokeDasharray="4 3"
        />
        <line
          x1={PADDING_X}
          y1={CHART_H / 2}
          x2={chartWidth - PADDING_X}
          y2={CHART_H / 2}
          stroke="var(--color-base-content)"
          strokeOpacity={0.06}
          strokeDasharray="4 3"
        />

        {/* Area fill */}
        <path d={areaPath} fill="#fff" fillOpacity={0.06} />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#fff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.6}
        />

        {/* End dot */}
        <circle cx={points[n - 1].x} cy={points[n - 1].y} r={3} fill="#fff" fillOpacity={0.8} />

        {/* Hover dot */}
        {hoveredIndex !== null && (
          <>
            <line
              x1={points[hoveredIndex].x}
              y1={PADDING_Y}
              x2={points[hoveredIndex].x}
              y2={CHART_H}
              stroke="#fff"
              strokeOpacity={0.15}
              strokeWidth={1}
            />
            <circle cx={points[hoveredIndex].x} cy={points[hoveredIndex].y} r={4} fill="#fff" fillOpacity={0.9} />
          </>
        )}

        {/* Y-axis labels */}
        <text x={chartWidth + 4} y={PADDING_Y + 4} fill="var(--color-base-content)" fillOpacity={0.3} fontSize={10}>
          {topLabel}
        </text>
        <text x={chartWidth + 4} y={CHART_H / 2 + 3} fill="var(--color-base-content)" fillOpacity={0.3} fontSize={10}>
          {midLabel}
        </text>
        <text x={chartWidth + 4} y={CHART_H - 2} fill="var(--color-base-content)" fillOpacity={0.3} fontSize={10}>
          0
        </text>

        {/* Invisible hit areas for hover */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x - hitWidth / 2}
            y={0}
            width={hitWidth}
            height={CHART_H}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(i)}
          />
        ))}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && (
        <div
          className="absolute pointer-events-none bg-base-300 text-base-content text-sm px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap"
          style={{
            left: `${(points[hoveredIndex].x / CHART_W) * 100}%`,
            top: "-8px",
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-medium">
            {points[hoveredIndex].balance.toLocaleString(undefined, { maximumFractionDigits: 0 })} cREP
          </div>
          <div className="text-base-content/50 text-xs">{formatDate(points[hoveredIndex].timestamp)}</div>
        </div>
      )}
    </div>
  );
}
