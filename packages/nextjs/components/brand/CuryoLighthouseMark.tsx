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
  const haloId = `${id}-halo`;
  const glowId = `${id}-glow`;
  const coreId = `${id}-core`;
  const glossId = `${id}-gloss`;
  const shadowId = `${id}-shadow`;
  const rimId = `${id}-rim`;
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
          <radialGradient id={haloId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF6B7C" stopOpacity="0.18" />
            <stop offset="38%" stopColor="#FFB35A" stopOpacity="0.12" />
            <stop offset="72%" stopColor="#359EEE" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#03CEA4" stopOpacity="0" />
          </radialGradient>

          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.24" />
            <stop offset="58%" stopColor="#FFFFFF" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>

          <linearGradient id={coreId} x1="0.18" y1="0.12" x2="0.86" y2="0.92" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="16%" stopColor="#FFFFFF" />
            <stop offset="44%" stopColor="#EEF1F5" />
            <stop offset="72%" stopColor="#A6AFBA" />
            <stop offset="100%" stopColor="#323A45" />
          </linearGradient>

          <radialGradient
            id={glossId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="objectBoundingBox"
            gradientTransform="translate(0.28 0.22) scale(0.38 0.28)"
          >
            <stop stopColor="#FFFFFF" stopOpacity="0.66" />
            <stop offset="0.52" stopColor="#FFFFFF" stopOpacity="0.26" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>

          <radialGradient
            id={shadowId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="objectBoundingBox"
            gradientTransform="translate(0.7 0.82) scale(0.6 0.48)"
          >
            <stop stopColor="#11161E" stopOpacity="0.3" />
            <stop offset="1" stopColor="#11161E" stopOpacity="0" />
          </radialGradient>

          <radialGradient
            id={rimId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="objectBoundingBox"
            gradientTransform="translate(0.34 0.32) scale(0.86 0.78)"
          >
            <stop offset="72%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.28" />
          </radialGradient>

          <linearGradient id={innerRingId} x1="94" y1="120" x2="418" y2="392" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#359EEE" />
            <stop offset="30%" stopColor="#EF476F" />
            <stop offset="66%" stopColor="#FFC43D" />
            <stop offset="100%" stopColor="#03CEA4" />
          </linearGradient>

          <linearGradient id={middleRingId} x1="82" y1="104" x2="430" y2="404" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFDCE7" />
            <stop offset="34%" stopColor="#FFF8FB" />
            <stop offset="68%" stopColor="#EAF5FF" />
            <stop offset="100%" stopColor="#8AE7D2" />
          </linearGradient>

          <linearGradient id={outerRingId} x1="68" y1="86" x2="444" y2="426" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#359EEE" />
            <stop offset="34%" stopColor="#EF476F" />
            <stop offset="68%" stopColor="#FFC43D" />
            <stop offset="100%" stopColor="#03CEA4" />
          </linearGradient>
        </defs>

        <g className={animated ? "curyo-lighthouse-mark__halo" : undefined}>
          <circle cx="256" cy="256" r="182" fill={`url(#${haloId})`} />
        </g>

        <g className={animated ? "curyo-lighthouse-mark__rings" : undefined}>
          <circle
            cx="256"
            cy="256"
            r="132"
            fill="none"
            stroke={`url(#${innerRingId})`}
            strokeWidth="12"
            strokeOpacity="0.94"
          />
          <circle
            cx="256"
            cy="256"
            r="164"
            fill="none"
            stroke={`url(#${middleRingId})`}
            strokeWidth="10"
            strokeOpacity="0.68"
          />
          <circle
            cx="256"
            cy="256"
            r="196"
            fill="none"
            stroke={`url(#${outerRingId})`}
            strokeWidth="8"
            strokeOpacity="0.42"
          />
        </g>

        <g className={animated ? "curyo-lighthouse-mark__core" : undefined}>
          <circle cx="256" cy="256" r="148" fill={`url(#${glowId})`} />
          <circle
            className={animated ? "curyo-lighthouse-mark__body" : undefined}
            cx="256"
            cy="256"
            r="82"
            fill={`url(#${coreId})`}
          />
          <circle
            className={animated ? "curyo-lighthouse-mark__gloss" : undefined}
            cx="256"
            cy="256"
            r="76"
            fill={`url(#${glossId})`}
          />
          <circle cx="256" cy="256" r="80" fill={`url(#${shadowId})`} />
          <circle cx="256" cy="256" r="81" fill={`url(#${rimId})`} />
        </g>
      </svg>

      <style jsx>{`
        .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__halo {
          animation: lighthouse-halo-breathe 8s ease-in-out infinite;
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

        @keyframes lighthouse-halo-breathe {
          0%,
          100% {
            opacity: 0.9;
            transform: scale(0.985);
          }
          50% {
            opacity: 1;
            transform: scale(1.02);
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
            transform: translate(-2px, 0px);
          }
          50% {
            opacity: 1;
            transform: translate(4px, -3px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__halo,
          .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__rings,
          .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__core,
          .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__body,
          .curyo-lighthouse-mark--animated .curyo-lighthouse-mark__gloss {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
