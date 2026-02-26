"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type OptimisticVote = {
  voteCount: number;
  stake: bigint;
  timestamp: number;
};

type OptimisticVoteContextType = {
  getOptimisticDelta: (contentId: bigint) => OptimisticVote | undefined;
  addOptimisticVote: (contentId: bigint, stakeAmount: bigint) => void;
};

const OptimisticVoteContext = createContext<OptimisticVoteContextType | null>(null);

export function OptimisticVoteProvider({ children }: { children: React.ReactNode }) {
  const [optimisticVotes, setOptimisticVotes] = useState<Map<string, OptimisticVote>>(new Map());
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const addOptimisticVote = useCallback((contentId: bigint, stakeAmount: bigint) => {
    const key = contentId.toString();
    setOptimisticVotes(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(key);
      newMap.set(key, {
        voteCount: (existing?.voteCount ?? 0) + 1,
        stake: (existing?.stake ?? 0n) + stakeAmount,
        timestamp: Date.now(),
      });
      return newMap;
    });

    // Clear existing timeout for this key to prevent duplicates
    const existingTimeout = timeoutRefs.current.get(key);
    if (existingTimeout) clearTimeout(existingTimeout);

    // Clear after 15 seconds (transaction should confirm by then)
    const timeout = setTimeout(() => {
      setOptimisticVotes(prev => {
        const newMap = new Map(prev);
        newMap.delete(key);
        return newMap;
      });
      timeoutRefs.current.delete(key);
    }, 15000);
    timeoutRefs.current.set(key, timeout);
  }, []);

  const getOptimisticDelta = useCallback(
    (contentId: bigint) => {
      return optimisticVotes.get(contentId.toString());
    },
    [optimisticVotes],
  );

  return (
    <OptimisticVoteContext.Provider value={{ getOptimisticDelta, addOptimisticVote }}>
      {children}
    </OptimisticVoteContext.Provider>
  );
}

export function useOptimisticVote() {
  const context = useContext(OptimisticVoteContext);
  if (!context) {
    throw new Error("useOptimisticVote must be used within OptimisticVoteProvider");
  }
  return context;
}
