#!/usr/bin/env node
import { chromium } from "@playwright/test";
import process from "node:process";

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_ROUTES = ["/", "/docs", "/ask", "/rate", "/governance", "/settings", "/vote/reveal"];
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SETTLE_MS = 1_500;
const DEFAULT_RUNS = 1;
const DEFAULT_VIEWPORT = { width: 1440, height: 1000 };
const MAX_EVENT_DETAILS = 20;

function printHelp() {
  console.log(`Usage: yarn perf:pages [options]

Measures local production Next.js page performance with Playwright.

Options:
  --base-url <url>        Base URL to measure (default: ${DEFAULT_BASE_URL})
  --routes <paths>        Comma-separated routes (default: ${DEFAULT_ROUTES.join(",")})
  --runs <count>          Number of measurements per route (default: ${DEFAULT_RUNS})
  --timeout <ms>          Navigation timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --settle <ms>           Post-load observer settle time in milliseconds (default: ${DEFAULT_SETTLE_MS})
  --format <json|table>   Output format (default: json)
  --table                 Alias for --format table
  --headful               Run Chromium headed
  --help                  Show this help

Environment:
  NEXT_PERF_BASE_URL      Base URL fallback when --base-url is not set
`);
}

function parsePositiveInt(rawValue, optionName) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return value;
}

function parseNonNegativeInt(rawValue, optionName) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${optionName} must be a non-negative integer.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.NEXT_PERF_BASE_URL || DEFAULT_BASE_URL,
    routes: DEFAULT_ROUTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    settleMs: DEFAULT_SETTLE_MS,
    runs: DEFAULT_RUNS,
    format: "json",
    headless: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      index += 1;
      return value;
    };

    if (arg === "--base-url") {
      options.baseUrl = nextValue();
    } else if (arg === "--routes") {
      const routes = nextValue()
        .split(",")
        .map(route => route.trim())
        .filter(Boolean);
      if (routes.length === 0) throw new Error("--routes must include at least one route.");
      options.routes = routes.map(route => (route.startsWith("/") ? route : `/${route}`));
    } else if (arg === "--runs") {
      options.runs = parsePositiveInt(nextValue(), "--runs");
    } else if (arg === "--timeout") {
      options.timeoutMs = parsePositiveInt(nextValue(), "--timeout");
    } else if (arg === "--settle") {
      options.settleMs = parseNonNegativeInt(nextValue(), "--settle");
    } else if (arg === "--format") {
      options.format = nextValue();
    } else if (arg === "--table") {
      options.format = "table";
    } else if (arg === "--headful") {
      options.headless = false;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!["json", "table"].includes(options.format)) {
    throw new Error("--format must be json or table.");
  }

  options.baseUrl = normalizeBaseUrl(options.baseUrl);
  return options;
}

function normalizeBaseUrl(rawBaseUrl) {
  try {
    const url = new URL(rawBaseUrl);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid base URL: ${rawBaseUrl}`);
  }
}

function buildRouteUrl(baseUrl, route) {
  return new URL(route, `${baseUrl}/`).toString();
}

function round(value, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function bytesToKb(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return round(value / 1024, 1);
}

function summarizeRuns(runs) {
  const valuesFor = selector =>
    runs
      .map(selector)
      .filter(value => typeof value === "number" && Number.isFinite(value))
      .sort((left, right) => left - right);

  const median = (values, digits = 1) => {
    if (values.length === 0) return null;
    const middle = Math.floor(values.length / 2);
    if (values.length % 2 === 1) return round(values[middle], digits);
    return round((values[middle - 1] + values[middle]) / 2, digits);
  };

  return {
    status: runs.some(run => run.status === "failed") ? "failed" : "ok",
    durationMs: median(valuesFor(run => run.navigation.durationMs)),
    domContentLoadedMs: median(valuesFor(run => run.navigation.domContentLoadedMs)),
    loadMs: median(valuesFor(run => run.navigation.loadMs)),
    ttfbMs: median(valuesFor(run => run.navigation.ttfbMs)),
    lcpMs: median(valuesFor(run => run.webVitals.lcpMs)),
    cls: median(
      valuesFor(run => run.webVitals.cls),
      4,
    ),
    longTaskCount: median(valuesFor(run => run.longTasks.count)),
    longTaskTotalMs: median(valuesFor(run => run.longTasks.totalDurationMs)),
    jsKb: median(valuesFor(run => run.resources.transfer.jsKb)),
    staticKb: median(valuesFor(run => run.resources.transfer.staticKb)),
    totalKb: median(valuesFor(run => run.resources.transfer.totalKb)),
    consoleErrorCount: runs.reduce((total, run) => total + run.consoleErrors.length, 0),
    pageErrorCount: runs.reduce((total, run) => total + run.pageErrors.length, 0),
    requestFailureCount: runs.reduce((total, run) => total + run.requestFailures.length, 0),
  };
}

function compactError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    message: String(error),
  };
}

async function installPerformanceObservers(page) {
  await page.addInitScript(() => {
    window.__curyoPagePerformance = {
      cumulativeLayoutShift: 0,
      largestContentfulPaint: null,
      layoutShifts: [],
      longTasks: [],
      observerErrors: [],
    };

    const recordObserverError = error => {
      window.__curyoPagePerformance.observerErrors.push(String(error?.message || error));
    };

    try {
      new PerformanceObserver(entryList => {
        for (const entry of entryList.getEntries()) {
          window.__curyoPagePerformance.largestContentfulPaint = {
            startTime: entry.startTime,
            renderTime: entry.renderTime,
            loadTime: entry.loadTime,
            size: entry.size,
            element: entry.element?.tagName || null,
            url: entry.url || null,
          };
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch (error) {
      recordObserverError(error);
    }

    try {
      new PerformanceObserver(entryList => {
        for (const entry of entryList.getEntries()) {
          if (entry.hadRecentInput) continue;
          window.__curyoPagePerformance.cumulativeLayoutShift += entry.value;
          window.__curyoPagePerformance.layoutShifts.push({
            startTime: entry.startTime,
            value: entry.value,
          });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch (error) {
      recordObserverError(error);
    }

    try {
      new PerformanceObserver(entryList => {
        for (const entry of entryList.getEntries()) {
          window.__curyoPagePerformance.longTasks.push({
            startTime: entry.startTime,
            duration: entry.duration,
            name: entry.name,
          });
        }
      }).observe({ type: "longtask", buffered: true });
    } catch (error) {
      recordObserverError(error);
    }
  });
}

async function collectBrowserMetrics(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] || null;
    const resources = performance.getEntriesByType("resource");
    const observed = window.__curyoPagePerformance || {};

    const sizeFor = entry => {
      if (entry.transferSize && entry.transferSize > 0) return entry.transferSize;
      if (entry.encodedBodySize && entry.encodedBodySize > 0) return entry.encodedBodySize;
      if (entry.decodedBodySize && entry.decodedBodySize > 0) return entry.decodedBodySize;
      return 0;
    };

    const resourceSummaries = resources.map(entry => {
      const url = new URL(entry.name, window.location.href);
      return {
        name: entry.name,
        pathname: url.pathname,
        initiatorType: entry.initiatorType || "other",
        duration: entry.duration,
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
        measuredSize: sizeFor(entry),
      };
    });

    const totals = resourceSummaries.reduce(
      (summary, resource) => {
        const isScript =
          resource.initiatorType === "script" ||
          resource.pathname.endsWith(".js") ||
          resource.pathname.endsWith(".mjs");
        const isStatic = resource.pathname.startsWith("/_next/static/");
        const measuredSize = resource.measuredSize;

        summary.totalBytes += measuredSize;
        if (isScript) summary.jsBytes += measuredSize;
        if (isStatic) summary.staticBytes += measuredSize;

        summary.byInitiator[resource.initiatorType] ??= {
          count: 0,
          bytes: 0,
        };
        summary.byInitiator[resource.initiatorType].count += 1;
        summary.byInitiator[resource.initiatorType].bytes += measuredSize;
        return summary;
      },
      {
        totalBytes: 0,
        jsBytes: 0,
        staticBytes: 0,
        byInitiator: {},
      },
    );

    return {
      navigation: navigation
        ? {
            startTime: navigation.startTime,
            duration: navigation.duration,
            domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
            loadEventEnd: navigation.loadEventEnd,
            requestStart: navigation.requestStart,
            responseStart: navigation.responseStart,
            responseEnd: navigation.responseEnd,
            transferSize: navigation.transferSize || 0,
            encodedBodySize: navigation.encodedBodySize || 0,
            decodedBodySize: navigation.decodedBodySize || 0,
          }
        : null,
      observed,
      resources: {
        count: resourceSummaries.length,
        totals,
        entries: resourceSummaries,
      },
    };
  });
}

function normalizeBrowserMetrics(metrics) {
  const navigation = metrics.navigation;
  const longTasks = metrics.observed.longTasks || [];
  const byInitiator = Object.fromEntries(
    Object.entries(metrics.resources.totals.byInitiator).map(([initiatorType, value]) => [
      initiatorType,
      {
        count: value.count,
        kb: bytesToKb(value.bytes),
      },
    ]),
  );

  return {
    navigation: {
      durationMs: round(navigation?.duration),
      domContentLoadedMs: round(navigation?.domContentLoadedEventEnd),
      loadMs: round(navigation?.loadEventEnd),
      ttfbMs: round(navigation ? navigation.responseStart - navigation.requestStart : null),
      responseEndMs: round(navigation?.responseEnd),
      documentTransferKb: bytesToKb(navigation?.transferSize || navigation?.encodedBodySize || 0),
    },
    webVitals: {
      lcpMs: round(metrics.observed.largestContentfulPaint?.startTime),
      lcp: metrics.observed.largestContentfulPaint
        ? {
            startTimeMs: round(metrics.observed.largestContentfulPaint.startTime),
            size: metrics.observed.largestContentfulPaint.size || 0,
            element: metrics.observed.largestContentfulPaint.element || null,
            url: metrics.observed.largestContentfulPaint.url || null,
          }
        : null,
      cls: round(metrics.observed.cumulativeLayoutShift || 0, 4),
      layoutShiftCount: metrics.observed.layoutShifts?.length || 0,
    },
    longTasks: {
      count: longTasks.length,
      totalDurationMs: round(longTasks.reduce((total, task) => total + task.duration, 0)),
      maxDurationMs: round(Math.max(0, ...longTasks.map(task => task.duration))),
      entries: longTasks.map(task => ({
        startTimeMs: round(task.startTime),
        durationMs: round(task.duration),
        name: task.name,
      })),
    },
    resources: {
      count: metrics.resources.count,
      transfer: {
        totalKb: bytesToKb(metrics.resources.totals.totalBytes),
        jsKb: bytesToKb(metrics.resources.totals.jsBytes),
        staticKb: bytesToKb(metrics.resources.totals.staticBytes),
      },
      byInitiator,
    },
    observerErrors: metrics.observed.observerErrors || [],
  };
}

async function measureRoute(browser, route, runIndex, options) {
  const context = await browser.newContext({
    viewport: DEFAULT_VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    ignoreHTTPSErrors: true,
  });
  context.setDefaultTimeout(options.timeoutMs);
  context.setDefaultNavigationTimeout(options.timeoutMs);

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on("console", message => {
    if (message.type() !== "error" || consoleErrors.length >= MAX_EVENT_DETAILS) return;
    consoleErrors.push({
      text: message.text(),
      location: message.location(),
    });
  });

  page.on("pageerror", error => {
    if (pageErrors.length >= MAX_EVENT_DETAILS) return;
    pageErrors.push(compactError(error));
  });

  page.on("requestfailed", request => {
    if (requestFailures.length >= MAX_EVENT_DETAILS) return;
    requestFailures.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText || "unknown",
    });
  });

  await installPerformanceObservers(page);

  const url = buildRouteUrl(options.baseUrl, route);
  const startedAt = Date.now();
  let response = null;

  try {
    response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    await page.waitForLoadState("load", { timeout: options.timeoutMs }).catch(() => {});
    await page.waitForTimeout(options.settleMs);

    const rawMetrics = await collectBrowserMetrics(page);
    const metrics = normalizeBrowserMetrics(rawMetrics);
    const httpStatus = response?.status() || null;

    return {
      route,
      url,
      finalUrl: page.url(),
      run: runIndex,
      status: httpStatus && httpStatus >= 400 ? "failed" : "ok",
      httpStatus,
      measuredAt: new Date(startedAt).toISOString(),
      elapsedMs: Date.now() - startedAt,
      ...metrics,
      consoleErrors,
      pageErrors,
      requestFailures,
    };
  } catch (error) {
    return {
      route,
      url,
      finalUrl: page.url(),
      run: runIndex,
      status: "failed",
      httpStatus: response?.status() || null,
      measuredAt: new Date(startedAt).toISOString(),
      elapsedMs: Date.now() - startedAt,
      error: compactError(error),
      navigation: {
        durationMs: null,
        domContentLoadedMs: null,
        loadMs: null,
        ttfbMs: null,
        responseEndMs: null,
        documentTransferKb: 0,
      },
      webVitals: {
        lcpMs: null,
        lcp: null,
        cls: null,
        layoutShiftCount: 0,
      },
      longTasks: {
        count: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
        entries: [],
      },
      resources: {
        count: 0,
        transfer: {
          totalKb: 0,
          jsKb: 0,
          staticKb: 0,
        },
        byInitiator: {},
      },
      observerErrors: [],
      consoleErrors,
      pageErrors,
      requestFailures,
    };
  } finally {
    await context.close();
  }
}

function formatTable(result) {
  const headers = [
    "route",
    "status",
    "http",
    "nav ms",
    "lcp ms",
    "cls",
    "long",
    "js KB",
    "static KB",
    "total KB",
    "errors",
  ];

  const rows = result.routes.map(routeResult => {
    const summary = routeResult.summary;
    return [
      routeResult.route,
      summary.status,
      routeResult.runs.map(run => run.httpStatus ?? "-").join(","),
      summary.durationMs ?? "-",
      summary.lcpMs ?? "-",
      summary.cls ?? "-",
      summary.longTaskCount ?? "-",
      summary.jsKb ?? "-",
      summary.staticKb ?? "-",
      summary.totalKb ?? "-",
      summary.consoleErrorCount + summary.pageErrorCount + summary.requestFailureCount,
    ].map(value => String(value));
  });

  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map(row => row[index].length)));
  const formatRow = row => row.map((cell, index) => cell.padEnd(widths[index])).join("  ");

  return [formatRow(headers), formatRow(widths.map(width => "-".repeat(width))), ...rows.map(formatRow)].join("\n");
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Run with --help for usage.");
    process.exit(2);
  }

  if (options.help) {
    printHelp();
    return;
  }

  const browser = await chromium.launch({
    headless: options.headless,
  });

  const routeResults = [];
  try {
    for (const route of options.routes) {
      const runs = [];
      for (let runIndex = 1; runIndex <= options.runs; runIndex += 1) {
        runs.push(await measureRoute(browser, route, runIndex, options));
      }
      routeResults.push({
        route,
        summary: summarizeRuns(runs),
        runs,
      });
    }
  } finally {
    await browser.close();
  }

  const result = {
    metadata: {
      baseUrl: options.baseUrl,
      routes: options.routes,
      runs: options.runs,
      timeoutMs: options.timeoutMs,
      settleMs: options.settleMs,
      viewport: DEFAULT_VIEWPORT,
      measuredAt: new Date().toISOString(),
      userAgent: "playwright-chromium",
    },
    routes: routeResults,
  };

  if (options.format === "table") {
    console.log(formatTable(result));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  if (routeResults.some(routeResult => routeResult.summary.status === "failed")) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
