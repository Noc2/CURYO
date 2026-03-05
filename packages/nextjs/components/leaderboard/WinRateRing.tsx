"use client";

/**
 * Circular ring gauge showing win rate as a green arc (wins) and red arc (losses).
 * Centre displays the percentage and W/L record.
 */
export function WinRateRing({
  winRate,
  wins,
  losses,
  size = 120,
}: {
  winRate: number;
  wins: number;
  losses: number;
  size?: number;
}) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;

  // Win arc length (clockwise from top)
  const winLength = circumference * winRate;
  // Loss arc follows immediately after
  const lossLength = circumference * (1 - winRate);

  const pct = `${(winRate * 100).toFixed(1)}%`;
  const record = `${wins}W / ${losses}L`;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        {/* Background track */}
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-base-content/[0.06]"
          strokeWidth={strokeWidth}
        />

        {/* Loss arc (drawn first, full circle, will be covered by win arc) */}
        {losses > 0 && (
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            stroke="var(--color-error)"
            strokeOpacity={0.7}
            strokeWidth={strokeWidth}
            strokeDasharray={`${lossLength} ${circumference - lossLength}`}
            strokeDashoffset={-winLength}
            strokeLinecap="round"
          />
        )}

        {/* Win arc (from top, clockwise) */}
        {wins > 0 && (
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            stroke="var(--color-success)"
            strokeOpacity={0.9}
            strokeWidth={strokeWidth}
            strokeDasharray={`${winLength} ${circumference - winLength}`}
            strokeDashoffset={0}
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Centre text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
        <span className="text-xl font-semibold font-mono tabular-nums leading-tight">{pct}</span>
        <span className="text-sm text-base-content/50 font-mono tabular-nums">{record}</span>
      </div>
    </div>
  );
}
