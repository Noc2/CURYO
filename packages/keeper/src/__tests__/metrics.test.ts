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
    roundsRevealFailedFinalized: 0,
    votesRevealed: 0,
    cleanupBatchesProcessed: 0,
    submitterStakesResolved: 0,
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

  it("renders operational gauges in metrics and health responses", async () => {
    recordRun(
      makeResult({
        roundsRevealFailedFinalized: 2,
        cleanupBatchesProcessed: 3,
        submitterStakesResolved: 4,
      }),
      75,
    );
    setGauge("keeper_consensus_reserve_wei", 4_000_000_000_000);

    const metricsBody = getMetricsText();
    expect(metricsBody).toContain("keeper_rounds_reveal_failed_finalized_total 2");
    expect(metricsBody).toContain("keeper_unrevealed_cleanup_batches_total 3");
    expect(metricsBody).toContain("keeper_submitter_stakes_resolved_total 4");
    expect(metricsBody).toContain("keeper_consensus_reserve_wei 4000000000000");

    const health = getHealthSnapshot();
    expect([200, 503]).toContain(health.status);
    expect(JSON.parse(health.body)).toMatchObject({
      roundsRevealFailedFinalized: 2,
      cleanupBatchesProcessed: 3,
      submitterStakesResolved: 4,
      consensusReserveWei: "4000000000000",
    });
  });
});
