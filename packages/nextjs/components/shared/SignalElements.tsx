"use client";

import type { ReactNode } from "react";

export type SignalTone = "primary" | "success" | "warning" | "danger" | "neutral";
type SignalAccent = "primary" | "success" | "warning";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const panelAccentClasses: Record<SignalAccent, string> = {
  primary:
    "bg-[radial-gradient(circle_at_18%_20%,rgba(53,158,238,0.22),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(3,206,164,0.1),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_48%)]",
  success:
    "bg-[radial-gradient(circle_at_16%_22%,rgba(3,206,164,0.2),transparent_30%),radial-gradient(circle_at_82%_14%,rgba(53,158,238,0.08),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_48%)]",
  warning:
    "bg-[radial-gradient(circle_at_16%_20%,rgba(255,196,61,0.2),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(239,71,111,0.08),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_48%)]",
};

const pillToneClasses: Record<SignalTone, string> = {
  primary: "border-primary/30 bg-primary/[0.12] text-primary",
  success: "border-success/30 bg-success/[0.12] text-success",
  warning: "border-warning/30 bg-warning/[0.12] text-warning",
  danger: "border-error/30 bg-error/[0.12] text-error",
  neutral: "border-white/[0.12] bg-white/[0.06] text-white/[0.78]",
};

const pillDotClasses: Record<SignalTone, string> = {
  primary: "bg-primary shadow-[0_0_14px_rgba(53,158,238,0.5)]",
  success: "bg-success shadow-[0_0_14px_rgba(3,206,164,0.5)]",
  warning: "bg-warning shadow-[0_0_14px_rgba(255,196,61,0.48)]",
  danger: "bg-error shadow-[0_0_14px_rgba(239,71,111,0.5)]",
  neutral: "bg-white/[0.55] shadow-[0_0_10px_rgba(255,255,255,0.22)]",
};

const metricToneClasses: Record<SignalTone, string> = {
  primary:
    "bg-[radial-gradient(circle_at_top_right,rgba(53,158,238,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]",
  success:
    "bg-[radial-gradient(circle_at_top_right,rgba(3,206,164,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]",
  warning:
    "bg-[radial-gradient(circle_at_top_right,rgba(255,196,61,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]",
  danger:
    "bg-[radial-gradient(circle_at_top_right,rgba(239,71,111,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]",
  neutral:
    "bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]",
};

interface SignalPanelProps {
  children: ReactNode;
  className?: string;
  accent?: SignalAccent;
  intensity?: "normal" | "strong";
}

export function SignalPanel({ children, className, accent = "primary", intensity = "normal" }: SignalPanelProps) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(16,22,35,0.96),rgba(5,8,14,0.98))] backdrop-blur",
        intensity === "strong" ? "shadow-[0_28px_80px_rgba(0,0,0,0.36)]" : "shadow-[0_22px_56px_rgba(0,0,0,0.28)]",
        className,
      )}
    >
      <div aria-hidden className={cx("pointer-events-none absolute inset-0", panelAccentClasses[accent])} />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 top-1/2 h-52 w-52 -translate-y-1/2 rounded-full border border-white/10 opacity-[0.45]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-2 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full border border-white/[0.08] opacity-[0.35]"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

interface SignalPillProps {
  children: ReactNode;
  className?: string;
  tone?: SignalTone;
  showDot?: boolean;
}

export function SignalPill({ children, className, tone = "neutral", showDot = true }: SignalPillProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em]",
        pillToneClasses[tone],
        className,
      )}
    >
      {showDot ? <span className={cx("h-1.5 w-1.5 rounded-full", pillDotClasses[tone])} /> : null}
      {children}
    </span>
  );
}

interface SignalDividerProps {
  label?: string;
  className?: string;
}

export function SignalDivider({ label, className }: SignalDividerProps) {
  return (
    <div className={cx("flex items-center gap-3", className)}>
      {label ? (
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white/[0.45]">{label}</span>
      ) : null}
      <div className="relative h-px flex-1 overflow-visible bg-gradient-to-r from-primary/50 via-white/[0.12] to-transparent">
        <span className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_16px_rgba(53,158,238,0.55)]" />
      </div>
    </div>
  );
}

interface SignalMetricBadgeProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  className?: string;
  tone?: SignalTone;
}

export function SignalMetricBadge({ label, value, detail, icon, className, tone = "primary" }: SignalMetricBadgeProps) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm",
        metricToneClasses[tone],
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-y-3 left-3 w-px bg-white/10" />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white/[0.46]">{label}</p>
          <div className="mt-2 flex flex-wrap items-end gap-x-2 gap-y-1">
            <span className="text-3xl font-semibold leading-none text-white">{value}</span>
            {detail ? <span className="text-sm text-white/[0.58]">{detail}</span> : null}
          </div>
        </div>
        {icon ? (
          <div className="mt-0.5 rounded-full border border-white/10 bg-white/5 p-2 text-white/[0.72]">{icon}</div>
        ) : null}
      </div>
    </div>
  );
}
