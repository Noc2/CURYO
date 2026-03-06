"use client";

import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";

type Urgency = "normal" | "warning" | "critical";

interface RoundCountdown {
  timeLeft: number; // seconds remaining
  urgency: Urgency;
  label: string;
  isActive: boolean;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function getUrgency(seconds: number): Urgency {
  if (seconds <= 3600) return "critical"; // <1h
  if (seconds <= 21600) return "warning"; // <6h
  return "normal";
}

export function useRoundCountdown(contentId?: bigint): RoundCountdown {
  const { phase, roundTimeRemaining } = useRoundSnapshot(contentId);
  const isOpen = phase === "voting" && roundTimeRemaining > 0;
  const timeLeft = isOpen ? roundTimeRemaining : 0;

  return {
    timeLeft,
    urgency: getUrgency(timeLeft),
    label: formatCountdown(timeLeft),
    isActive: isOpen && timeLeft > 0,
  };
}
