"use client";

import { useEffect, useState } from "react";
import { useRoundInfo } from "~~/hooks/useRoundInfo";
import { useVotingConfig } from "~~/hooks/useVotingConfig";

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
  const { round } = useRoundInfo(contentId);
  const { maxDuration } = useVotingConfig();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const startTime = round?.startTime ?? 0;
  const isOpen = round?.state === 0 && startTime > 0;
  const endTime = startTime + maxDuration;
  const timeLeft = isOpen ? Math.max(0, endTime - now) : 0;

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  return {
    timeLeft,
    urgency: getUrgency(timeLeft),
    label: formatCountdown(timeLeft),
    isActive: isOpen && timeLeft > 0,
  };
}
