"use client";

import { useEffect, useId, useRef, useState } from "react";
import { clampContentRating, formatCommunityRatingAriaLabel, formatRatingScoreOutOfTen } from "~~/lib/ui/ratingDisplay";

const START_ANGLE = 0;
const MIN_ANIMATION_MS = 500;
const MAX_ANIMATION_MS = 1200;

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
  showGlow?: boolean;
}

export function RatingOrb({ rating, size = 196, className = "", showGlow = true }: RatingOrbProps) {
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
  const flareStroke = `url(#${orbId}-flare)`;
  const coreStroke = `url(#${orbId}-core)`;
  const endPoint = polarToCartesian(center, trackRadius, START_ANGLE + progress * 360);
  const isTinyOrb = size <= 64;
  const isSmallOrb = size <= 100;
  const trackWidth = isTinyOrb ? Math.max(3, size * 0.065) : Math.max(8, size * 0.034);
  const ratingFontSize = isTinyOrb
    ? Math.max(13, size * 0.3)
    : isSmallOrb
      ? Math.max(30, size * 0.32)
      : Math.max(36, size * 0.25);
  const scaleFontSize = isTinyOrb
    ? Math.max(6, ratingFontSize * 0.38)
    : isSmallOrb
      ? Math.max(12, ratingFontSize * 0.36)
      : Math.max(16, ratingFontSize * 0.4);
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
          <linearGradient id={`${orbId}-flare`} x1="0%" y1="10%" x2="100%" y2="90%">
            <stop offset="0%" stopColor="#B3341B" />
            <stop offset="58%" stopColor="#F26426" />
            <stop offset="100%" stopColor="#F5F0EB" />
          </linearGradient>
          <linearGradient id={`${orbId}-core`} x1="10%" y1="8%" x2="94%" y2="92%">
            <stop offset="0%" stopColor="#F26426" />
            <stop offset="100%" stopColor="#F5F0EB" />
          </linearGradient>
          <radialGradient id={`${orbId}-fill`} cx="50%" cy="42%" r="66%">
            <stop offset="0%" stopColor="rgba(245,240,235,0.07)" />
            <stop offset="72%" stopColor="rgba(245,240,235,0.02)" />
            <stop offset="100%" stopColor="rgba(245,240,235,0)" />
          </radialGradient>
          <filter id={`${orbId}-glow`} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>

        <circle
          cx={center}
          cy={center}
          r={trackRadius + trackWidth * 0.95}
          fill={showGlow ? "rgba(245,240,235,0.03)" : "transparent"}
        />
        <circle
          cx={center}
          cy={center}
          r={trackRadius + trackWidth * 0.62}
          fill="none"
          stroke="rgba(245,240,235,0.04)"
          strokeWidth="2"
        />
        <circle
          cx={center}
          cy={center}
          r={trackRadius}
          fill="none"
          stroke="rgba(245,240,235,0.06)"
          strokeWidth={trackWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={trackRadius}
          fill="none"
          stroke="rgba(179,52,27,0.2)"
          strokeWidth={Math.max(3, trackWidth * 0.42)}
        />

        {progress >= 1 ? (
          <>
            {showGlow ? (
              <circle
                cx={center}
                cy={center}
                r={trackRadius}
                fill="none"
                stroke={flareStroke}
                strokeWidth={trackWidth}
                strokeLinecap="round"
                filter={`url(#${orbId}-glow)`}
                opacity="0.56"
              />
            ) : null}
            <circle
              cx={center}
              cy={center}
              r={trackRadius}
              fill="none"
              stroke={flareStroke}
              strokeWidth={trackWidth * 0.6}
              strokeLinecap="round"
            />
            <circle
              cx={center}
              cy={center}
              r={trackRadius}
              fill="none"
              stroke={coreStroke}
              strokeWidth={Math.max(2, trackWidth * 0.22)}
              strokeLinecap="round"
            />
          </>
        ) : progress > 0 ? (
          <>
            {showGlow ? (
              <circle
                cx={center}
                cy={center}
                r={trackRadius}
                fill="none"
                stroke={flareStroke}
                strokeWidth={trackWidth}
                strokeLinecap="round"
                filter={`url(#${orbId}-glow)`}
                opacity="0.56"
                strokeDasharray={`${progressLength} ${circumference}`}
                transform={`rotate(-90 ${center} ${center})`}
              />
            ) : null}
            <circle
              cx={center}
              cy={center}
              r={trackRadius}
              fill="none"
              stroke={flareStroke}
              strokeWidth={trackWidth * 0.6}
              strokeLinecap="round"
              strokeDasharray={`${progressLength} ${circumference}`}
              transform={`rotate(-90 ${center} ${center})`}
            />
            <circle
              cx={center}
              cy={center}
              r={trackRadius}
              fill="none"
              stroke={coreStroke}
              strokeWidth={Math.max(2, trackWidth * 0.22)}
              strokeLinecap="round"
              strokeDasharray={`${progressLength} ${circumference}`}
              transform={`rotate(-90 ${center} ${center})`}
            />
            <circle cx={endPoint.x} cy={endPoint.y} r={trackWidth * 0.3} fill="#F5F0EB" />
            <circle cx={endPoint.x} cy={endPoint.y} r={trackWidth * 0.62} fill="rgba(242,100,38,0.22)" />
          </>
        ) : null}

        <circle
          cx={center}
          cy={center}
          r={trackRadius - trackWidth * 0.92}
          fill="rgba(9,10,12,0.96)"
          stroke="rgba(245,240,235,0.05)"
          strokeWidth="1.8"
        />
        <circle cx={center} cy={center} r={trackRadius - trackWidth * 1.55} fill={`url(#${orbId}-fill)`} />
      </svg>

      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <span
          className="display-metric inline-flex items-end justify-center text-base-content tabular-nums"
          style={{ maxWidth: scoreMaxWidth }}
        >
          <span className="font-semibold tracking-normal" style={{ fontSize: ratingFontSize }}>
            {displayedScore}
          </span>
          <span
            className={`${scoreGapClassName} mb-[0.12em] shrink-0 font-medium leading-[0.92] text-base-content/60`}
            style={{ fontSize: scaleFontSize }}
          >
            /10
          </span>
        </span>
      </div>
    </div>
  );
}
