"use client";

import { useEffect } from "react";

/**
 * Auto-starts the keeper by loading the /api/keeper route module.
 * In Next.js App Router, API route modules load lazily on first request,
 * so the keeper's setInterval never starts unless this endpoint is hit.
 */
export function KeeperInit() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      fetch("/api/keeper").catch(() => {});
    }
  }, []);
  return null;
}
