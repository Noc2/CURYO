"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { clampContentRating, formatCommunityRatingAriaLabel, formatRatingScoreOutOfTen } from "~~/lib/ui/ratingDisplay";

const START_ANGLE = 0;
const MIN_ANIMATION_MS = 500;
const MAX_ANIMATION_MS = 1200;
const PROGRESS_STROKE = "#ffffff";
const INNER_ORANGE = "var(--curyo-ember)";
const INNER_ORANGE_EDGE = "var(--curyo-ember-deep)";

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function polarToCartesian(center: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(angleInRadians),
    y: center + radius * Math.sin(angleInRadians),
  };
}

interface RatingOrbProps {
  rating: number;
  size?: number;
  className?: string;
}

export function RatingOrb({ rating, size = 196, className = "" }: RatingOrbProps) {
  const orbId = useId().replace(/:/g, "");
  const clampedRating = clampContentRating(rating);
  const [animatedRating, setAnimatedRating] = useState(0);
  const animatedRatingRef = useRef(0);
  const center = size / 2;
  const trackRadius = size * 0.41;
  const displayedRating = clampContentRating(animatedRating);
  const displayedScore = formatRatingScoreOutOfTen(displayedRating);
  const progress = displayedRating / 100;
  const circumference = 2 * Math.PI * trackRadius;
  const progressLength = circumference * progress;
  const endPoint = polarToCartesian(center, trackRadius, START_ANGLE + progress * 360);
  const isTinyOrb = size <= 64;
  const isCompactOrb = size <= 88;
  const isSmallOrb = size <= 100;
  const trackWidth = isTinyOrb ? Math.max(3, size * 0.065) : Math.max(8, size * 0.034);
  const progressStrokeWidth = trackWidth * 0.6;
  const progressHighlightStrokeWidth = Math.max(2, trackWidth * 0.22);
  const innerCircleGap = Math.max(2, trackWidth * 0.5);
  const innerCircleRadius = trackRadius - progressStrokeWidth / 2 - innerCircleGap;
  const ratingFontSize = isTinyOrb
    ? Math.max(12, size * 0.26)
    : isCompactOrb
      ? Math.max(21, size * 0.235)
      : isSmallOrb
        ? Math.max(24, size * 0.26)
        : Math.max(34, size * 0.23);
  const scaleFontSize = isTinyOrb
    ? Math.max(6, ratingFontSize * 0.36)
    : isCompactOrb
      ? Math.max(8, ratingFontSize * 0.32)
      : isSmallOrb
        ? Math.max(10, ratingFontSize * 0.34)
        : Math.max(15, ratingFontSize * 0.38);
  const scoreGapClassName = isTinyOrb ? "ml-0.5" : isSmallOrb ? "ml-1" : "ml-2";
  const scoreMaxWidth = isTinyOrb ? size * 0.84 : trackRadius * 1.7;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      animatedRatingRef.current = clampedRating;
      setAnimatedRating(clampedRating);
      return;
    }

    const startRating = animatedRatingRef.current;
    const delta = clampedRating - startRating;

    if (Math.abs(delta) < 0.01) {
      animatedRatingRef.current = clampedRating;
      setAnimatedRating(clampedRating);
      return;
    }

    const duration = Math.min(MAX_ANIMATION_MS, Math.max(MIN_ANIMATION_MS, Math.abs(delta) * 14));
    const startedAt = performance.now();
    let frameId = 0;

    const animate = (now: number) => {
      const rawProgress = Math.min(1, (now - startedAt) / duration);
      const nextRating = startRating + delta * easeOutCubic(rawProgress);

      animatedRatingRef.current = nextRating;
      setAnimatedRating(nextRating);

      if (rawProgress < 1) {
        frameId = window.requestAnimationFrame(animate);
      } else {
        animatedRatingRef.current = clampedRating;
        setAnimatedRating(clampedRating);
      }
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [clampedRating]);

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={formatCommunityRatingAriaLabel(clampedRating)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 overflow-visible">
        <defs>
          <radialGradient id={`${orbId}-inner-fill`} cx="46%" cy="38%" r="72%">
            <stop offset="0%" stopColor={INNER_ORANGE} stopOpacity="0.98" />
            <stop offset="68%" stopColor={INNER_ORANGE} stopOpacity="0.92" />
            <stop offset="100%" stopColor={INNER_ORANGE_EDGE} stopOpacity="0.95" />
          </radialGradient>
        </defs>

        {progress >= 1 ? (
          <>
            <circle
              cx={center}
              cy={center}
              r={trackRadius}
              fill="none"
              stroke={PROGRESS_STROKE}
              strokeWidth={progressStrokeWidth}
              strokeLinecap="round"
            />
            <circle
              cx={center}
              cy={center}
              r={trackRadius}
              fill="none"
              stroke={PROGRESS_STROKE}
              strokeWidth={progressHighlightStrokeWidth}
              strokeLinecap="round"
              opacity="0.82"
            />
          </>
        ) : progress > 0 ? (
          <>
            <circle
              cx={center}
              cy={center}
              r={trackRadius}
              fill="none"
              stroke={PROGRESS_STROKE}
              strokeWidth={progressStrokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${progressLength} ${circumference}`}
              transform={`rotate(-90 ${center} ${center})`}
            />
            <circle
              cx={center}
              cy={center}
              r={trackRadius}
              fill="none"
              stroke={PROGRESS_STROKE}
              strokeWidth={progressHighlightStrokeWidth}
              strokeLinecap="round"
              opacity="0.82"
              strokeDasharray={`${progressLength} ${circumference}`}
              transform={`rotate(-90 ${center} ${center})`}
            />
            <circle cx={endPoint.x} cy={endPoint.y} r={trackWidth * 0.3} fill={PROGRESS_STROKE} />
          </>
        ) : null}

        <circle
          cx={center}
          cy={center}
          r={innerCircleRadius}
          fill={`url(#${orbId}-inner-fill)`}
          stroke="rgba(245,240,235,0.1)"
          strokeWidth={Math.max(1, trackWidth * 0.12)}
        />
      </svg>

      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <span
          className="display-metric inline-flex items-end justify-center tabular-nums"
          style={{ color: "var(--curyo-action-content)", maxWidth: scoreMaxWidth }}
        >
          <span className="font-semibold tracking-normal" style={{ fontSize: ratingFontSize }}>
            {displayedScore}
          </span>
          <span
            className={`${scoreGapClassName} mb-[0.12em] shrink-0 font-medium leading-[0.92]`}
            style={{ color: "rgb(255 255 255 / 0.72)", fontSize: scaleFontSize }}
          >
            /10
          </span>
        </span>
      </div>
    </div>
  );
}
