export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function formatTime(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function formatData(data?: Record<string, unknown>): string {
  if (!data) return "";
  return Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(" ");
}

export function createLogger(format: "json" | "text", minLevel: LogLevel = "info"): Logger {
  const minPriority = LEVEL_PRIORITY[minLevel];

  function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
    if (LEVEL_PRIORITY[level] < minPriority) return;

    if (format === "json") {
      const entry: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level,
        msg,
        ...data,
      };
      const stream = level === "error" ? process.stderr : process.stdout;
      stream.write(JSON.stringify(entry) + "\n");
    } else {
      const extra = formatData(data);
      const prefix = `[Keeper] ${formatTime()} ${level.toUpperCase()}`;
      const line = extra ? `${prefix} ${msg} ${extra}` : `${prefix} ${msg}`;
      const stream = level === "error" ? console.error : console.log;
      stream(line);
    }
  }

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
  };
}
