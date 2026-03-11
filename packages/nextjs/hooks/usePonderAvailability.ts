"use client";

import { useQuery } from "@tanstack/react-query";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { isPonderAvailable } from "~~/services/ponder/client";

export function usePonderAvailability(enabled = true) {
  const isPageVisible = usePageVisibility();

  const { data } = useQuery({
    queryKey: ["ponderAvailability"],
    queryFn: isPonderAvailable,
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled && isPageVisible ? 30_000 : false,
  });

  return data;
}
