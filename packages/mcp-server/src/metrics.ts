const counters = {
  mcp_http_requests_total: 0,
  mcp_http_auth_failures_total: 0,
  mcp_http_rate_limited_total: 0,
  mcp_http_request_errors_total: 0,
  mcp_readiness_checks_total: 0,
  mcp_readiness_failures_total: 0,
  mcp_write_tool_invocations_total: 0,
  mcp_write_tool_failures_total: 0,
  mcp_write_tool_dry_runs_total: 0,
};

const gauges = {
  mcp_last_http_request_timestamp: 0,
  mcp_last_successful_readiness_timestamp: 0,
  mcp_last_write_tool_timestamp: 0,
};

export function recordHttpRequest(statusCode: number): void {
  counters.mcp_http_requests_total += 1;
  gauges.mcp_last_http_request_timestamp = Math.floor(Date.now() / 1000);
  if (statusCode >= 500) {
    counters.mcp_http_request_errors_total += 1;
  }
}

export function recordHttpAuthFailure(): void {
  counters.mcp_http_auth_failures_total += 1;
}

export function recordHttpRateLimit(): void {
  counters.mcp_http_rate_limited_total += 1;
}

export function recordReadinessCheck(success: boolean): void {
  counters.mcp_readiness_checks_total += 1;
  if (success) {
    gauges.mcp_last_successful_readiness_timestamp = Math.floor(Date.now() / 1000);
    return;
  }

  counters.mcp_readiness_failures_total += 1;
}

export function recordWriteToolInvocation(mode: "transaction" | "simulation"): void {
  counters.mcp_write_tool_invocations_total += 1;
  gauges.mcp_last_write_tool_timestamp = Math.floor(Date.now() / 1000);
  if (mode === "simulation") {
    counters.mcp_write_tool_dry_runs_total += 1;
  }
}

export function recordWriteToolFailure(): void {
  counters.mcp_write_tool_failures_total += 1;
}

export function getMetricsText(): string {
  const counterHelp: Record<string, string> = {
    mcp_http_requests_total: "Total HTTP requests handled by the MCP HTTP server",
    mcp_http_auth_failures_total: "Total HTTP auth failures for MCP HTTP endpoints",
    mcp_http_rate_limited_total: "Total HTTP requests rejected due to MCP rate limiting",
    mcp_http_request_errors_total: "Total MCP HTTP requests that ended with a 5xx response",
    mcp_readiness_checks_total: "Total readiness checks served by the MCP HTTP server",
    mcp_readiness_failures_total: "Total readiness checks that reported degraded status",
    mcp_write_tool_invocations_total: "Total hosted MCP write tool invocations",
    mcp_write_tool_failures_total: "Total hosted MCP write tool failures",
    mcp_write_tool_dry_runs_total: "Total hosted MCP write tool dry-run invocations",
  };

  const gaugeHelp: Record<string, string> = {
    mcp_last_http_request_timestamp: "Unix timestamp of the last HTTP request handled by the MCP server",
    mcp_last_successful_readiness_timestamp: "Unix timestamp of the last successful readiness check",
    mcp_last_write_tool_timestamp: "Unix timestamp of the last hosted write tool invocation",
  };

  const lines: string[] = [];
  for (const [name, value] of Object.entries(counters)) {
    lines.push(`# HELP ${name} ${counterHelp[name] || name}`);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${value}`);
  }

  for (const [name, value] of Object.entries(gauges)) {
    lines.push(`# HELP ${name} ${gaugeHelp[name] || name}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${value}`);
  }

  return `${lines.join("\n")}\n`;
}

export function __resetMcpMetricsForTests(): void {
  for (const key of Object.keys(counters) as Array<keyof typeof counters>) {
    counters[key] = 0;
  }

  for (const key of Object.keys(gauges) as Array<keyof typeof gauges>) {
    gauges[key] = 0;
  }
}
