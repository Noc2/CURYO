"use client";

import { startTransition, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RATE_ROUTE, buildRouteWithSearchParams } from "~~/constants/routes";
import { isContentSearchQueryTooShort } from "~~/hooks/contentFeed/shared";

type CommitVoteSearchOptions = {
  skipIfUnchanged?: boolean;
};

export function buildVoteSearchTarget(value: string): string {
  const trimmed = value.trim();
  return buildRouteWithSearchParams(RATE_ROUTE, trimmed ? { q: trimmed } : undefined);
}

export function shouldSkipVoteSearchCommit(value: string, activeQuery: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return isContentSearchQueryTooShort(trimmed) && activeQuery.trim().length === 0;
}

export function useVoteSearch() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const activeQuery = searchParams?.get("q") ?? "";

  const commitSearch = useCallback(
    (value: string, options: CommitVoteSearchOptions = {}) => {
      if (shouldSkipVoteSearchCommit(value, activeQuery)) {
        return;
      }

      const target = buildVoteSearchTarget(value);
      if (options.skipIfUnchanged && pathname === RATE_ROUTE && target === buildVoteSearchTarget(activeQuery)) {
        return;
      }

      startTransition(() => {
        if (pathname === RATE_ROUTE) {
          router.replace(target, { scroll: false });
        } else {
          router.push(target);
        }
      });
    },
    [activeQuery, pathname, router],
  );

  return {
    activeQuery,
    commitSearch,
  };
}
