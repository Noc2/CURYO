"use client";

import { useEffect } from "react";

/**
 * Pings /api/keeper once on mount (dev only) to trigger the keeper's
 * module-level interval setup. Without this, the keeper never starts
 * because Next.js only loads route modules on first request.
 */
export function useKeeperInit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    fetch("/api/keeper").catch(() => {});
  }, []);
}
