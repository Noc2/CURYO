import { resolveNotificationEmailDeliveryStatus } from "./emailDelivery";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveNotificationEmailDeliveryStatus distinguishes missing config from indexer outages", () => {
  assert.deepEqual(
    resolveNotificationEmailDeliveryStatus({
      resendConfigured: false,
      ponderConfigured: true,
      ponderAvailable: true,
    }),
    {
      ok: false,
      error: "Notification delivery is not configured",
    },
  );

  assert.deepEqual(
    resolveNotificationEmailDeliveryStatus({
      resendConfigured: true,
      ponderConfigured: true,
      ponderAvailable: false,
    }),
    {
      ok: false,
      error: "Notification delivery is unavailable while the indexer is offline",
    },
  );
});

test("resolveNotificationEmailDeliveryStatus returns ok when all dependencies are ready", () => {
  assert.deepEqual(
    resolveNotificationEmailDeliveryStatus({
      resendConfigured: true,
      ponderConfigured: true,
      ponderAvailable: true,
    }),
    {
      ok: true,
    },
  );
});
