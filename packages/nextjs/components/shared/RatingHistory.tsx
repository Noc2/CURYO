"use client";

import { useMemo } from "react";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderAvailability } from "~~/hooks/usePonderAvailability";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { formatRatingScoreOutOfTen } from "~~/lib/ui/ratingDisplay";
import { ponderApi } from "~~/services/ponder/client";
import { publicEnv } from "~~/utils/env/public";

interface RatingHistoryProps {
  contentId: bigint;
  variant?: "default" | "dark";
  showHeader?: boolean;
}

/**
 * SVG sparkline chart showing the content's rating over time.
 * Plots data from RatingUpdated events + current on-chain rating.
 */
export function RatingHistory({ contentId, variant = "default", showHeader = true }: RatingHistoryProps) {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;
  const ponderAvailable = usePonderAvailability(rpcFallbackEnabled);
  const rpcFallbackActive = rpcFallbackEnabled && ponderAvailable === false;
  const isPageVisible = usePageVisibility();
  const {
    data: events,
    isLoading: eventsLoading,
    error: eventsError,
  } = useScaffoldEventHistory({
    contractName: "ContentRegistry",
    eventName: "RatingUpdated",
    filters: { contentId },
    watch: rpcFallbackActive && isPageVisible,
    enabled: rpcFallbackActive && isPageVisible,
  });

  const { data: currentRating } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "getRating",
    args: [contentId],
    query: { refetchInterval: isPageVisible ? 15_000 : false },
  });

  const rpcDataPoints = useMemo(() => {
    // Start with the initial rating (50)
    const points: number[] = [50];

    if (events && events.length > 0) {
      // Events are ordered oldest-first from getLogs
      for (const event of events) {
        const args = event.args as { newRating?: bigint };
        if (args.newRating !== undefined) {
          points.push(Number(args.newRating));
        }
      }
    } else if (currentRating !== undefined) {
      // No events yet, just show initial -> current
      points.push(Number(currentRating));
    }

    return points;
  }, [events, currentRating]);

  const {
    data: result,
    isLoading,
    error,
  } = usePonderQuery({
    queryKey: ["ratingHistory", contentId.toString()],
    ponderFn: async () => {
      const response = await ponderApi.getContentById(contentId.toString());
      const ratings =
        response.ratings
          ?.slice()
          .reverse()
          .map(rating => rating.newRating) ?? [];

      if (ratings.length > 0) {
        return [50, ...ratings];
      }

      return [50, response.content?.rating ?? 50];
    },
    rpcFn: async () => rpcDataPoints,
    rpcEnabled: rpcFallbackEnabled,
    staleTime: 15_000,
    refetchInterval: isPageVisible ? 30_000 : false,
  });

  const dataPoints = result?.data ?? rpcDataPoints;

  if (isLoading || (rpcFallbackActive && eventsLoading)) {
    return (
      <div className="h-16 flex items-center justify-center">
        <span className="loading loading-spinner loading-xs text-base-content/20"></span>
      </div>
    );
  }

  if (error || (rpcFallbackActive && eventsError)) {
    const textColor = variant === "dark" ? "text-base-content/40" : "text-base-content/25";
    return (
      <div className={`h-16 flex items-center justify-center text-base ${textColor}`}>
        Unable to load rating history
      </div>
    );
  }

  // Need at least 2 points to draw a line
  if (dataPoints.length < 2) {
    const textColor = variant === "dark" ? "text-base-content/40" : "text-base-content/25";
    return <div className={`h-16 flex items-center justify-center text-base ${textColor}`}>No rating history yet</div>;
  }

  const currentRatingValue = dataPoints[dataPoints.length - 1];
  const textColor = variant === "dark" ? "text-base-content/60" : "text-base-content/40";
  const currentRatingScore = formatRatingScoreOutOfTen(currentRatingValue);

  return (
    <div className="w-full">
      {showHeader ? (
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-base font-medium ${textColor}`}>Rating history</span>
          <span className="inline-flex items-baseline gap-0.5 text-base tabular-nums">
            <span className="font-semibold text-base-content/72">{currentRatingScore}</span>
            <span className="font-medium text-base-content/38">/10</span>
          </span>
        </div>
      ) : null}
      <Sparkline data={dataPoints} />
    </div>
  );
}

// --- SVG Sparkline ---

const CHART_W = 320;
const CHART_H = 64;
const PADDING_X = 2;
const PADDING_Y = 4;

function Sparkline({ data }: { data: number[] }) {
  const n = data.length;
  const minVal = 0;
  const maxVal = 100;
  const range = maxVal - minVal || 1;

  // Map data points to SVG coordinates
  const points = data.map((val, i) => {
    const x = PADDING_X + (i / (n - 1)) * (CHART_W - 2 * PADDING_X);
    const y = PADDING_Y + (1 - (val - minVal) / range) * (CHART_H - 2 * PADDING_Y);
    return { x, y, val };
  });

  // Build the line path
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Build the area path (filled below the line)
  const areaPath = `${linePath} L ${points[n - 1].x} ${CHART_H} L ${points[0].x} ${CHART_H} Z`;

  // 50% baseline
  const baselineY = PADDING_Y + (1 - (50 - minVal) / range) * (CHART_H - 2 * PADDING_Y);

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full h-16 rounded-lg bg-base-content/[0.02]"
      preserveAspectRatio="none"
    >
      {/* 50% baseline */}
      <line
        x1={PADDING_X}
        y1={baselineY}
        x2={CHART_W - PADDING_X}
        y2={baselineY}
        stroke="var(--color-base-content)"
        strokeOpacity={0.08}
        strokeDasharray="4 3"
      />

      {/* Area fill */}
      <path d={areaPath} fill="#F26426" fillOpacity={0.12} />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke="#F26426"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.8}
      />

      {/* End dot */}
      <circle cx={points[n - 1].x} cy={points[n - 1].y} r={3} fill="#F5F0EB" />
    </svg>
  );
}
