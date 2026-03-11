export type LogLevel = "info" | "warn" | "error";

interface LogFields {
  [key: string]: unknown;
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (process.env.NODE_ENV === "test" || process.env.CURYO_MCP_LOG_ENABLED === "0") {
    return;
  }

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...serializeFields(fields),
    }),
  );
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  return {
    errorMessage: String(error),
  };
}

function serializeFields(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      if (value instanceof Error) {
        return [key, serializeError(value)];
      }

      return [key, value];
    }),
  );
}
