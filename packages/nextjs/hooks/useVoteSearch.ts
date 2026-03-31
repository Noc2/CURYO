"use client";

import { startTransition, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isContentSearchQueryTooShort } from "~~/hooks/contentFeed/shared";

type CommitVoteSearchOptions = {
  skipIfUnchanged?: boolean;
};

function buildVoteSearchTarget(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `/vote?q=${encodeURIComponent(trimmed)}` : "/vote";
}

function shouldSkipVoteSearchCommit(value: string, activeQuery: string): boolean {
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
      if (options.skipIfUnchanged && pathname === "/vote" && target === buildVoteSearchTarget(activeQuery)) {
        return;
      }

      startTransition(() => {
        if (pathname === "/vote") {
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
