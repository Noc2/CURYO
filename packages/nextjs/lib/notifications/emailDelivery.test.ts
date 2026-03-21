import { resolveNotificationEmailDeliveryAttempt, resolveNotificationEmailDeliveryStatus } from "./emailDelivery";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveNotificationEmailDeliveryStatus distinguishes missing config from indexer outages", () => {
  assert.deepEqual(
    resolveNotificationEmailDeliveryStatus({
      resendConfigured: false,
      ponderConfigured: true,
      ponderAvailable: true,
      appUrlConfigured: true,
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
      appUrlConfigured: true,
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
      appUrlConfigured: true,
    }),
    {
      ok: true,
    },
  );
});

test("resolveNotificationEmailDeliveryStatus requires a public app URL", () => {
  assert.deepEqual(
    resolveNotificationEmailDeliveryStatus({
      resendConfigured: true,
      ponderConfigured: true,
      ponderAvailable: true,
      appUrlConfigured: false,
    }),
    {
      ok: false,
      error: "Notification delivery is not configured",
    },
  );
});

test("resolveNotificationEmailDeliveryAttempt retries stale sending rows once the lease is reacquired", () => {
  assert.equal(
    resolveNotificationEmailDeliveryAttempt({
      deliveryState: "sending",
      leaseAcquired: true,
    }),
    "send",
  );
  assert.equal(
    resolveNotificationEmailDeliveryAttempt({
      deliveryState: "sending",
      leaseAcquired: false,
    }),
    "skip-lease",
  );
  assert.equal(
    resolveNotificationEmailDeliveryAttempt({
      deliveryState: "sent",
      leaseAcquired: true,
    }),
    "skip-sent",
  );
});
