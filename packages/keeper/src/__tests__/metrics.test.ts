import { describe, it, expect } from "vitest";
import {
  getHealthSnapshot,
  incrementCounter,
  getMetricsText,
  setGauge,
  recordRun,
  recordError,
  getConsecutiveErrors,
} from "../metrics.js";
import type { KeeperResult } from "../keeper.js";

function makeResult(overrides: Partial<KeeperResult> = {}): KeeperResult {
  return {
    roundsSettled: 0,
    roundsCancelled: 0,
    votesRevealed: 0,
    contentMarkedDormant: 0,
    ...overrides,
  };
}

describe("metrics", () => {
  it("incrementCounter increments known counters", () => {
    // This just verifies no throw — counters are internal
    incrementCounter("keeper_runs_total");
    incrementCounter("keeper_runs_total", 5);
  });

  it("incrementCounter ignores unknown counters", () => {
    // Should not throw
    incrementCounter("unknown_counter");
  });

  it("setGauge sets known gauges", () => {
    setGauge("keeper_is_running", 1);
    setGauge("keeper_is_running", 0);
  });

  it("setGauge ignores unknown gauges", () => {
    setGauge("unknown_gauge", 42);
  });

  it("recordRun resets consecutive errors", () => {
    recordError();
    recordError();
    expect(getConsecutiveErrors()).toBe(2);

    recordRun(makeResult({ roundsSettled: 1 }), 100);
    expect(getConsecutiveErrors()).toBe(0);
  });

  it("recordError increments consecutive errors", () => {
    // Reset by doing a successful run first
    recordRun(makeResult(), 50);
    expect(getConsecutiveErrors()).toBe(0);

    recordError();
    expect(getConsecutiveErrors()).toBe(1);
    recordError();
    expect(getConsecutiveErrors()).toBe(2);
  });

  it("renders pool balance gauges in metrics and health responses", async () => {
    setGauge("keeper_consensus_reserve_wei", 4_000_000_000_000);
    setGauge("keeper_reward_pool_wei", 250_000_000_000);

    const metricsBody = getMetricsText();
    expect(metricsBody).toContain("keeper_consensus_reserve_wei 4000000000000");
    expect(metricsBody).toContain("keeper_reward_pool_wei 250000000000");

    const health = getHealthSnapshot();
    expect([200, 503]).toContain(health.status);
    expect(JSON.parse(health.body)).toMatchObject({
      consensusReserveWei: "4000000000000",
      keeperRewardPoolWei: "250000000000",
    });
  });
});
