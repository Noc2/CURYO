import { Hono } from "hono";
import { cors } from "hono/cors";
import { isLoopbackRateLimitIdentifier, resolveRateLimitIdentifier } from "./request-identity.js";
import { RateLimiter } from "./rate-limit.js";
import { registerContentRoutes } from "./routes/content-routes.js";
import { registerDataRoutes } from "./routes/data-routes.js";
import { registerDiscoveryRoutes } from "./routes/discovery-routes.js";
import { registerLeaderboardRoutes } from "./routes/leaderboard-routes.js";

const app = new Hono();

// ============================================================
// GLOBAL ERROR HANDLER — catch unhandled DB/runtime errors
// ============================================================

app.onError((err, c) => {
  console.error("[ponder-api] Unhandled error:", err.message);
  return c.json({ error: "Internal server error" }, 500);
});

// ============================================================
// RATE LIMITING — IP-based sliding window (in-memory, resets on restart)
// ============================================================

const rateLimiter = new RateLimiter(120, 60_000, 60_000);

app.use("/*", async (c, next) => {
  const identifier = resolveRateLimitIdentifier(name => c.req.header(name) ?? undefined, {
    requestUrl: c.req.url,
  });

  const isLoopbackRequest =
    process.env.NODE_ENV !== "production"
    && isLoopbackRateLimitIdentifier(identifier)
    && (() => {
      try {
        const hostname = new URL(c.req.url).hostname;
        return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
      } catch {
        return false;
      }
    })();

  if (isLoopbackRequest) {
    await next();
    return;
  }

  const { allowed, retryAfter } = rateLimiter.check(identifier);

  if (!allowed) {
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: "Too many requests" }, 429);
  }

  await next();
});

// Enable CORS for frontend access (restrict via CORS_ORIGIN in production, comma-separated)
const isProduction = process.env.NODE_ENV === "production";
const DEFAULT_CORS_ORIGINS = ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"];
const corsOrigin = process.env.CORS_ORIGIN;
const corsMisconfigured = isProduction && !corsOrigin;
if (corsMisconfigured) {
  console.error(
    "[ponder] FATAL: CORS_ORIGIN is required in production. " +
    "Set CORS_ORIGIN env var to your frontend domain(s). " +
    "All API routes will return 503 until this is fixed.",
  );
}

const allowedOrigins = corsOrigin ? corsOrigin.split(",").map((origin: string) => origin.trim()) : DEFAULT_CORS_ORIGINS;
if (!isProduction && !corsOrigin) {
  console.warn("[ponder] CORS_ORIGIN not set — allowing localhost only. Set CORS_ORIGIN for production domains.");
}

// Block all custom routes if CORS is misconfigured — Ponder's built-in /health still works
if (corsMisconfigured) {
  app.use("/*", async (c) => {
    return c.json({ error: "CORS_ORIGIN not configured. Set CORS_ORIGIN env var." }, 503);
  });
}

app.use(
  "/*",
  cors({
    origin: allowedOrigins,
  }),
);

// Ponder provides /health and /status natively — no custom health check needed.
registerContentRoutes(app);
registerDiscoveryRoutes(app);
registerLeaderboardRoutes(app);
registerDataRoutes(app);

export default app;
