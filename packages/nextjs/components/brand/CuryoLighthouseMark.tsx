import { useId } from "react";

interface CuryoLighthouseMarkProps {
  className?: string;
  title?: string;
  animated?: boolean;
  animationPreset?: "breathe" | "sequence";
  showBeaconDot?: boolean;
  coreTone?: "gradient" | "white";
}

/**
 * Canonical Curyo Lighthouse brand mark.
 * This is a fixed logo primitive, separate from the data-driven avatar system.
 */
export function CuryoLighthouseMark({
  className = "h-8 w-8",
  title,
  animated = false,
  animationPreset,
  showBeaconDot = true,
  coreTone = "gradient",
}: CuryoLighthouseMarkProps) {
  const id = useId().replace(/:/g, "");
  const ambientId = `${id}-ambient`;
  const orbGlowId = `${id}-orb-glow`;
  const orbId = `${id}-orb`;
  const glossId = `${id}-gloss`;
  const innerRingId = `${id}-inner-ring`;
  const middleRingId = `${id}-middle-ring`;
  const outerRingId = `${id}-outer-ring`;
  const resolvedPreset = animationPreset ?? (animated ? "breathe" : undefined);
  const animationClass = resolvedPreset ? `curyo-lighthouse-mark--${resolvedPreset}` : "";
  const usesWhiteCore = coreTone === "white";

  return (
    <>
      <svg
        className={[className, animationClass].filter(Boolean).join(" ")}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
      >
        {title ? <title>{title}</title> : null}

        <defs>
          <radialGradient id={ambientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7E6D89" stopOpacity="0.18" />
            <stop offset="56%" stopColor="#7E6D89" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#7E6D89" stopOpacity="0" />
          </radialGradient>

          <radialGradient id={orbGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#EF476F" stopOpacity="0.22" />
            <stop offset="44%" stopColor="#359EEE" stopOpacity="0.12" />
            <stop offset="76%" stopColor="#03CEA4" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#03CEA4" stopOpacity="0" />
          </radialGradient>

          <linearGradient id={orbId} x1="0.22" y1="0.14" x2="0.78" y2="0.88" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#359EEE" />
            <stop offset="34%" stopColor="#EF476F" />
            <stop offset="66%" stopColor="#FFC43D" />
            <stop offset="100%" stopColor="#03CEA4" />
          </linearGradient>

          <radialGradient
            id={glossId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="objectBoundingBox"
            gradientTransform="translate(0.34 0.28) scale(0.42 0.32)"
          >
            <stop stopColor="#FFFFFF" stopOpacity="0.6" />
            <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.22" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>

          <linearGradient id={innerRingId} x1="146" y1="108" x2="366" y2="404" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFEAF4" />
            <stop offset="100%" stopColor="#EFF4FF" />
          </linearGradient>

          <linearGradient id={middleRingId} x1="126" y1="90" x2="386" y2="422" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#D8D5E2" />
            <stop offset="100%" stopColor="#E7EAF3" />
          </linearGradient>

          <linearGradient id={outerRingId} x1="106" y1="72" x2="406" y2="440" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#737182" />
            <stop offset="100%" stopColor="#8B8A99" />
          </linearGradient>
        </defs>

        <g className={resolvedPreset ? "curyo-lighthouse-mark__ambient" : undefined}>
          <circle cx="256" cy="256" r="176" fill={`url(#${ambientId})`} />
        </g>

        <g className={resolvedPreset ? "curyo-lighthouse-mark__rings" : undefined}>
          <circle
            className={resolvedPreset ? "curyo-lighthouse-mark__ring curyo-lighthouse-mark__ring--inner" : undefined}
            cx="256"
            cy="256"
            r="114"
            fill="none"
            stroke={`url(#${innerRingId})`}
            strokeWidth="11"
            strokeOpacity="0.98"
          />
          <circle
            className={resolvedPreset ? "curyo-lighthouse-mark__ring curyo-lighthouse-mark__ring--middle" : undefined}
            cx="256"
            cy="256"
            r="144"
            fill="none"
            stroke={`url(#${middleRingId})`}
            strokeWidth="9"
            strokeOpacity="0.9"
          />
          <circle
            className={resolvedPreset ? "curyo-lighthouse-mark__ring curyo-lighthouse-mark__ring--outer" : undefined}
            cx="256"
            cy="256"
            r="174"
            fill="none"
            stroke={`url(#${outerRingId})`}
            strokeWidth="8"
            strokeOpacity="0.8"
          />
          {showBeaconDot ? (
            <circle
              className={resolvedPreset ? "curyo-lighthouse-mark__dot" : undefined}
              cx="371"
              cy="334"
              r="4.2"
              fill="#F8FAFF"
              fillOpacity="0.94"
            />
          ) : null}
        </g>

        <g className={resolvedPreset ? "curyo-lighthouse-mark__core" : undefined}>
          <circle cx="256" cy="256" r="118" fill={`url(#${orbGlowId})`} />
          <circle
            className={resolvedPreset ? "curyo-lighthouse-mark__body" : undefined}
            cx="256"
            cy="256"
            r="64"
            fill={usesWhiteCore ? "#F8FAFF" : `url(#${orbId})`}
          />
          {usesWhiteCore ? null : (
            <circle
              className={resolvedPreset ? "curyo-lighthouse-mark__gloss" : undefined}
              cx="256"
              cy="256"
              r="52"
              fill={`url(#${glossId})`}
            />
          )}
        </g>
      </svg>

      <style jsx>{`
        .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__ambient {
          animation: lighthouse-ambient-breathe 8s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__rings {
          animation: lighthouse-rings-breathe 10s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__core {
          animation: lighthouse-core-float 7s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__body {
          animation: lighthouse-core-breathe 6.2s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__gloss {
          animation: lighthouse-gloss-shift 5.8s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__dot {
          animation: lighthouse-dot-pulse 4.8s ease-in-out infinite;
          transform-origin: 371px 334px;
        }

        .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__ambient {
          animation: lighthouse-sequence-ambient 5.2s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__core {
          animation: lighthouse-sequence-core 5.2s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__gloss {
          animation: lighthouse-sequence-gloss 5.2s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__ring {
          transform-origin: 256px 256px;
          animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
        }

        .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__ring--inner {
          animation: lighthouse-sequence-inner 5.2s ease-in-out infinite;
        }

        .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__ring--middle {
          animation: lighthouse-sequence-middle 5.2s ease-in-out infinite;
        }

        .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__ring--outer {
          animation: lighthouse-sequence-outer 5.2s ease-in-out infinite;
        }

        .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__dot {
          animation: lighthouse-sequence-dot 5.2s ease-in-out infinite;
          transform-origin: 371px 334px;
        }

        @keyframes lighthouse-ambient-breathe {
          0%,
          100% {
            opacity: 0.88;
            transform: scale(0.99);
          }
          50% {
            opacity: 1;
            transform: scale(1.018);
          }
        }

        @keyframes lighthouse-rings-breathe {
          0%,
          100% {
            opacity: 0.96;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.012);
          }
        }

        @keyframes lighthouse-core-float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-3px);
          }
        }

        @keyframes lighthouse-core-breathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.016);
          }
        }

        @keyframes lighthouse-gloss-shift {
          0%,
          100% {
            opacity: 0.86;
            transform: translate(-1px, 0px);
          }
          50% {
            opacity: 1;
            transform: translate(3px, -2px);
          }
        }

        @keyframes lighthouse-dot-pulse {
          0%,
          100% {
            opacity: 0.74;
            transform: scale(0.92);
          }
          50% {
            opacity: 1;
            transform: scale(1.16);
          }
        }

        @keyframes lighthouse-sequence-ambient {
          0%,
          100% {
            opacity: 0.54;
            transform: scale(0.97);
          }
          48% {
            opacity: 1;
            transform: scale(1.02);
          }
        }

        @keyframes lighthouse-sequence-core {
          0%,
          100% {
            transform: scale(1);
          }
          48% {
            transform: scale(1.024);
          }
        }

        @keyframes lighthouse-sequence-gloss {
          0%,
          100% {
            opacity: 0.82;
            transform: translate(-1px, 0px);
          }
          48% {
            opacity: 1;
            transform: translate(4px, -2px);
          }
        }

        @keyframes lighthouse-sequence-inner {
          0%,
          10%,
          92%,
          100% {
            opacity: 0;
            transform: scale(0.94);
          }
          14% {
            opacity: 0.04;
            transform: scale(0.952);
          }
          18% {
            opacity: 0.14;
            transform: scale(0.966);
          }
          23% {
            opacity: 0.38;
            transform: scale(0.982);
          }
          29%,
          54% {
            opacity: 0.94;
            transform: scale(1);
          }
          66% {
            opacity: 0.08;
            transform: scale(1.024);
          }
        }

        @keyframes lighthouse-sequence-middle {
          0%,
          20%,
          100% {
            opacity: 0;
            transform: scale(0.945);
          }
          25% {
            opacity: 0.04;
            transform: scale(0.956);
          }
          30% {
            opacity: 0.14;
            transform: scale(0.97);
          }
          36% {
            opacity: 0.36;
            transform: scale(0.984);
          }
          42%,
          64% {
            opacity: 0.89;
            transform: scale(1);
          }
          76% {
            opacity: 0.08;
            transform: scale(1.02);
          }
        }

        @keyframes lighthouse-sequence-outer {
          0%,
          30%,
          100% {
            opacity: 0;
            transform: scale(0.95);
          }
          36% {
            opacity: 0.035;
            transform: scale(0.96);
          }
          42% {
            opacity: 0.13;
            transform: scale(0.972);
          }
          48% {
            opacity: 0.34;
            transform: scale(0.986);
          }
          54%,
          76% {
            opacity: 0.8;
            transform: scale(1);
          }
          88% {
            opacity: 0.06;
            transform: scale(1.016);
          }
        }

        @keyframes lighthouse-sequence-dot {
          0%,
          22% {
            opacity: 0.15;
            transform: scale(0.72);
          }
          42%,
          70% {
            opacity: 1;
            transform: scale(1.2);
          }
          100% {
            opacity: 0.2;
            transform: scale(0.8);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__ambient,
          .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__rings,
          .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__core,
          .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__body,
          .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__gloss,
          .curyo-lighthouse-mark--breathe .curyo-lighthouse-mark__dot,
          .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__ambient,
          .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__core,
          .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__gloss,
          .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__ring,
          .curyo-lighthouse-mark--sequence .curyo-lighthouse-mark__dot {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
