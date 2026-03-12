import { useId } from "react";

/**
 * Curyo logo — clean gradient ring derived from the landing-page palette.
 */
export function CuryoLogo({ className = "w-8 h-8" }: { className?: string }) {
  const id = useId();
  const gradientId = `${id}-curyo-ring-gradient`;
  const innerGradientId = `${id}-curyo-ring-inner-gradient`;
  const glowId = `${id}-curyo-ring-glow`;

  return (
    <svg
      className={className}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Curyo logo"
    >
      <defs>
        <linearGradient id={gradientId} x1="22" y1="108" x2="106" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#03CEA4" />
          <stop offset="0.28" stopColor="#359EEE" />
          <stop offset="0.62" stopColor="#EF476F" />
          <stop offset="1" stopColor="#FFC43D" />
        </linearGradient>
        <linearGradient id={innerGradientId} x1="32" y1="98" x2="96" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#03CEA4" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#359EEE" stopOpacity="0.2" />
          <stop offset="1" stopColor="#EF476F" stopOpacity="0.32" />
        </linearGradient>
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
      </defs>

      <g transform="rotate(-22 64 64)">
        <circle
          cx="64"
          cy="64"
          r="46"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="18"
          opacity="0.24"
          filter={`url(#${glowId})`}
        />
        <circle cx="64" cy="64" r="46" fill="none" stroke={`url(#${gradientId})`} strokeWidth="11" />
        <circle cx="64" cy="64" r="31.5" fill="none" stroke={`url(#${innerGradientId})`} strokeWidth="2" />
      </g>
    </svg>
  );
}
