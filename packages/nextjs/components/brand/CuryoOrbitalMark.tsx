import { useId } from "react";

interface CuryoOrbitalMarkProps {
  className?: string;
  title?: string;
  animated?: boolean;
}

/**
 * Canonical Curyo brand mark derived from the orbital avatar system.
 * The website version stays transparent so it can sit on any surface.
 */
export function CuryoOrbitalMark({ className = "h-8 w-8", title, animated = false }: CuryoOrbitalMarkProps) {
  const id = useId().replace(/:/g, "");
  const haloId = `${id}-halo`;
  const planetId = `${id}-planet`;
  const glowId = `${id}-glow`;
  const highlightId = `${id}-highlight`;
  const ringId = `${id}-ring`;
  const backClipId = `${id}-ring-back`;
  const frontClipId = `${id}-ring-front`;

  return (
    <>
      <svg
        className={`${className} ${animated ? "curyo-orbital-mark--animated" : ""}`}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
      >
        {title ? <title>{title}</title> : null}

        <defs>
          <radialGradient id={haloId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF687A" stopOpacity="0.26" />
            <stop offset="62%" stopColor="#FF687A" stopOpacity="0.091" />
            <stop offset="100%" stopColor="#FF687A" stopOpacity="0" />
          </radialGradient>

          <linearGradient
            id={planetId}
            x1="0.15"
            y1="0.1"
            x2="0.85"
            y2="0.9"
            gradientUnits="objectBoundingBox"
            gradientTransform="rotate(42 0.5 0.5)"
          >
            <stop offset="0%" stopColor="#359EEE" />
            <stop offset="34%" stopColor="#EF476F" />
            <stop offset="68%" stopColor="#FFC43D" />
            <stop offset="100%" stopColor="#03CEA4" />
          </linearGradient>

          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#EF476F" stopOpacity="0.22" />
            <stop offset="56%" stopColor="#FFC43D" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#03CEA4" stopOpacity="0" />
          </radialGradient>

          <radialGradient
            id={highlightId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="objectBoundingBox"
            gradientTransform="translate(0.34 0.3) scale(0.44 0.34)"
          >
            <stop stopColor="#FFFFFF" stopOpacity="0.56" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>

          <linearGradient id={ringId} x1="0" y1="0.3" x2="1" y2="0.7" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#FFDCE7" />
            <stop offset="48%" stopColor="#FFF8FB" />
            <stop offset="100%" stopColor="#FFEFF5" />
          </linearGradient>

          <clipPath id={backClipId}>
            <rect x="0" y="0" width="512" height="256" />
          </clipPath>
          <clipPath id={frontClipId}>
            <rect x="0" y="256" width="512" height="256" />
          </clipPath>
        </defs>

        <g className={animated ? "curyo-orbital-mark__halo" : undefined}>
          <circle cx="256" cy="256" r="178" fill={`url(#${haloId})`} />
        </g>

        <g className={animated ? "curyo-orbital-mark__ring" : undefined}>
          <g transform="rotate(-18 256 256)">
            <ellipse
              cx="256"
              cy="256"
              rx="198"
              ry="54"
              fill="none"
              stroke={`url(#${ringId})`}
              strokeWidth="18"
              strokeOpacity="0.96"
              clipPath={`url(#${backClipId})`}
              strokeLinecap="round"
            />
          </g>
        </g>

        <g className={animated ? "curyo-orbital-mark__planet" : undefined}>
          <circle cx="256" cy="256" r="194" fill={`url(#${glowId})`} fillOpacity="0.82" />
          <circle
            className={animated ? "curyo-orbital-mark__body" : undefined}
            cx="256"
            cy="256"
            r="108"
            fill={`url(#${planetId})`}
          />
          <circle
            className={animated ? "curyo-orbital-mark__highlight" : undefined}
            cx="256"
            cy="256"
            r="86.4"
            fill={`url(#${highlightId})`}
          />
        </g>

        <g className={animated ? "curyo-orbital-mark__ring" : undefined}>
          <g transform="rotate(-18 256 256)">
            <ellipse
              cx="256"
              cy="256"
              rx="198"
              ry="54"
              fill="none"
              stroke={`url(#${ringId})`}
              strokeWidth="18"
              strokeOpacity="0.96"
              clipPath={`url(#${frontClipId})`}
              strokeLinecap="round"
            />
          </g>
        </g>
      </svg>

      <style jsx>{`
        .curyo-orbital-mark--animated .curyo-orbital-mark__halo {
          animation: halo-breathe 8s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-orbital-mark--animated .curyo-orbital-mark__planet {
          animation: planet-float 7.2s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-orbital-mark--animated .curyo-orbital-mark__body {
          animation: planet-breathe 6.4s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-orbital-mark--animated .curyo-orbital-mark__highlight {
          animation: highlight-drift 5.6s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        .curyo-orbital-mark--animated .curyo-orbital-mark__ring {
          animation: ring-sway 10s ease-in-out infinite;
          transform-origin: 256px 256px;
        }

        @keyframes halo-breathe {
          0%,
          100% {
            opacity: 0.88;
            transform: scale(0.98);
          }
          50% {
            opacity: 1;
            transform: scale(1.03);
          }
        }

        @keyframes planet-float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-4px);
          }
        }

        @keyframes planet-breathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.018);
          }
        }

        @keyframes highlight-drift {
          0%,
          100% {
            opacity: 0.9;
            transform: translate(-2px, 0px);
          }
          50% {
            opacity: 1;
            transform: translate(5px, -4px);
          }
        }

        @keyframes ring-sway {
          0%,
          100% {
            transform: rotate(0deg) scale(1);
          }
          50% {
            transform: rotate(1.8deg) scale(1.01);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .curyo-orbital-mark--animated .curyo-orbital-mark__halo,
          .curyo-orbital-mark--animated .curyo-orbital-mark__planet,
          .curyo-orbital-mark--animated .curyo-orbital-mark__body,
          .curyo-orbital-mark--animated .curyo-orbital-mark__highlight,
          .curyo-orbital-mark--animated .curyo-orbital-mark__ring {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
