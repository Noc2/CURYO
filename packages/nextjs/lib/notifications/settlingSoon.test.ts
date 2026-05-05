import { pickSettlingSoonNotification } from "./settlingSoon";
import assert from "node:assert/strict";
import test from "node:test";

test("pickSettlingSoonNotification groups multiple hour alerts into one summary", () => {
  const summary = pickSettlingSoonNotification({
    nowSeconds: 1_000,
    items: [
      {
        id: "1-1",
        contentId: "1",
        title: "The original cryptocurrency",
        estimatedSettlementTime: "1300",
      },
      {
        id: "2-1",
        contentId: "2",
        title: "The leading smart contract platform",
        estimatedSettlementTime: "1400",
      },
    ],
    seenHourIds: new Set(),
    seenDayIds: new Set(),
  });

  assert(summary);
  assert.equal(summary.kind, "hour");
  assert.equal(summary.title, "Rounds settling soon");
  assert.equal(summary.href, "/rate?content=1");
  assert.deepEqual(summary.itemIds, ["1-1", "2-1"]);
  assert.match(summary.body, /1 other tracked round/);
});

test("pickSettlingSoonNotification prefers hour alerts over day alerts", () => {
  const summary = pickSettlingSoonNotification({
    nowSeconds: 1_000,
    items: [
      {
        id: "day-1",
        contentId: "11",
        title: "A watched round later today",
        estimatedSettlementTime: String(1_000 + 3_600 * 5),
      },
      {
        id: "hour-1",
        contentId: "12",
        title: "A watched round this hour",
        estimatedSettlementTime: String(1_000 + 900),
      },
    ],
    seenHourIds: new Set(),
    seenDayIds: new Set(),
  });

  assert(summary);
  assert.equal(summary.kind, "hour");
  assert.equal(summary.href, "/rate?content=12");
});

test("pickSettlingSoonNotification returns null when all candidates were already seen", () => {
  const summary = pickSettlingSoonNotification({
    nowSeconds: 1_000,
    items: [
      {
        id: "1-1",
        contentId: "1",
        title: "Already seen",
        estimatedSettlementTime: "1200",
      },
    ],
    seenHourIds: new Set(["1-1"]),
    seenDayIds: new Set(),
  });

  assert.equal(summary, null);
});

test("pickSettlingSoonNotification can fall back to day alerts when hour alerts are disabled", () => {
  const summary = pickSettlingSoonNotification({
    nowSeconds: 1_000,
    items: [
      {
        id: "day-1",
        contentId: "7",
        title: "Later today",
        estimatedSettlementTime: String(1_000 + 7_200),
      },
      {
        id: "hour-1",
        contentId: "8",
        title: "Within the hour",
        estimatedSettlementTime: String(1_000 + 1_200),
      },
    ],
    seenHourIds: new Set(),
    seenDayIds: new Set(),
    allowHour: false,
    allowDay: true,
  });

  assert(summary);
  assert.equal(summary.kind, "day");
  assert.equal(summary.href, "/rate?content=7");
});
