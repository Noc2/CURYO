"use client";

import { useCallback, useEffect, useState } from "react";
import { useVoteHistoryQuery } from "~~/hooks/useVoteHistoryQuery";

interface UsePaginatedVoteHistoryOptions {
  pageSize?: number;
}

export function usePaginatedVoteHistory(voter?: string, options: UsePaginatedVoteHistoryOptions = {}) {
  const pageSize = options.pageSize ?? 50;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const { votes, totalVotes, settledVoteCount, isLoading } = useVoteHistoryQuery(voter, { limit: visibleCount });

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [pageSize, voter]);

  const loadMore = useCallback(() => {
    setVisibleCount(prev => prev + pageSize);
  }, [pageSize]);

  return {
    votes,
    totalVotes,
    settledVoteCount,
    hasMore: totalVotes > votes.length,
    loadMore,
    isLoading,
  };
}
