import { useId } from "react";

interface CuryoLighthouseMarkProps {
  className?: string;
  title?: string;
  animated?: boolean;
}

/**
 * Canonical Curyo Lighthouse brand mark.
 * This is a fixed logo primitive, separate from the data-driven avatar system.
 */
export function CuryoLighthouseMark({ className = "h-8 w-8", title, animated = false }: CuryoLighthouseMarkProps) {
  const id = useId().replace(/:/g, "");
  const ambientId = `${id}-ambient`;
  const orbGlowId = `${id}-orb-glow`;
  const orbId = `${id}-orb`;
  const glossId = `${id}-gloss`;
  const innerRingId = `${id}-inner-ring`;
  const middleRingId = `${id}-middle-ring`;
  const outerRingId = `${id}-outer-ring`;

  return (
    <>
      <svg
        className={`${className} ${animated ? "curyo-lighthouse-mark--animated" : ""}`}
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

        <g className={animated ? "curyo-lighthouse-mark__ambient" : undefined}>
          <circle cx="256" cy="256" r="176" fill={`url(#${ambientId})`} />
        </g>

        <g className={animated ? "curyo-lighthouse-mark__rings" : undefined}>
          <circle
            cx="256"
            cy="256"
            r="114"
            fill="none"
            stroke={`url(#${innerRingId})`}
            strokeWidth="11"
            strokeOpacity="0.98"
          />
          <circle
            cx="256"
            cy="256"
            r="144"
            fill="none"
            stroke={`url(#${middleRingId})`}
            strokeWidth="9"
            strokeOpacity="0.9"
          />
          <circle
            cx="256"
            cy="256"
            r="174"
            fill="none"
            stroke={`url(#${outerRingId})`}
            strokeWidth="8"
            strokeOpacity="0.8"
          />
          <circle
            className={animated ? "curyo-lighthouse-mark__dot" : undefined}
            cx="371"
            cy="334"
            r="4.2"
            fill="#F8FAFF"
            fillOpacity="0.94"
          />
        </g>

        <g className={animated ? "curyo-lighthouse-mark__core" : undefined}>
          <circle cx="256" cy="256" r="118" fill={`url(#${orbGlowId})`} />
          <circle
            className={animated ? "curyo-lighthouse-mark__body" : undefined}
            cx="256"
            cy="256"
            r="64"
            fill={`url(#${orbId})`}
          />
          <circle
            className={animated ? "curyo-lighthouse-mark__gloss" : undefined}
            cx="256"
            cy="256"
            r="52"
            fill={`url(#${glossId})`}
          />
        </g>
      </svg>

      <style jsx>{`
        .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__ambient {
          animation: lighthouse-ambient-breathe 8s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__rings {
          animation: lighthouse-rings-breathe 10s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__core {
          animation: lighthouse-core-float 7s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__body {
          animation: lighthouse-core-breathe 6.2s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__gloss {
          animation: lighthouse-gloss-shift 5.8s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__dot {
          animation: lighthouse-dot-pulse 4.8s ease-in-out infinite;
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

        @media (prefers-reduced-motion: reduce) {
          .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__ambient,
          .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__rings,
          .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__core,
          .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__body,
          .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__gloss,
          .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__dot {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
