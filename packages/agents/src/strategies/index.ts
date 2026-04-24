import { youtubeStrategy } from "./youtube.js";
import type { RatingStrategy } from "./types.js";
import { getVoteStrategyCatalog } from "../sourceCatalog.js";

const strategyImplementations = {
  youtube: youtubeStrategy,
} satisfies Record<string, RatingStrategy>;

const strategies: RatingStrategy[] = getVoteStrategyCatalog().map(entry => {
  const strategy = strategyImplementations[entry.strategyName as keyof typeof strategyImplementations];
  if (!strategy) {
    throw new Error(`Missing rating strategy implementation for ${entry.strategyName}`);
  }

  return strategy;
});

export function getStrategy(url: string): RatingStrategy | null {
  return strategies.find(s => s.canRate(url)) ?? null;
}
