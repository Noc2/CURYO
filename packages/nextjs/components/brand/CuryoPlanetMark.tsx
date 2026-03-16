import { useId } from "react";

interface CuryoPlanetMarkProps {
  className?: string;
  title?: string;
  animated?: boolean;
  animationPreset?: "orbit";
  variant?: "default" | "compact" | "hero";
}

/**
 * Canonical Curyo planet-and-flare brand mark.
 * This stays close to the SVG reference design and reuses the same orbit geometry
 * for the flare so static and animated versions stay aligned.
 */
export function CuryoPlanetMark({
  className = "h-8 w-8",
  title,
  animated = false,
  animationPreset,
  variant = "default",
}: CuryoPlanetMarkProps) {
  const id = useId().replace(/:/g, "");
  const planetBaseId = `${id}-planet-base`;
  const planetShadowId = `${id}-planet-shadow`;
  const planetHighlightId = `${id}-planet-highlight`;
  const flareGradientId = `${id}-flare-gradient`;
  const flareCoreId = `${id}-flare-core`;
  const softBlur20Id = `${id}-soft-blur-20`;
  const softBlur28Id = `${id}-soft-blur-28`;
  const softBlur42Id = `${id}-soft-blur-42`;
  const planetClipId = `${id}-planet-clip`;
  const resolvedPreset = animationPreset ?? (animated ? "orbit" : undefined);
  const animationClass = resolvedPreset ? `curyo-planet-mark--${resolvedPreset}` : "";
  const variantClass = `curyo-planet-mark--${variant}`;
  const usesHeroVariant = variant === "hero";
  const usesCompactVariant = variant === "compact";
  const planetRadius = usesCompactVariant ? 360 : 344;
  const flareRadius = usesCompactVariant ? 394 : 406;
  const flareRotation = usesCompactVariant ? -70 : -66;
  const flareDashArray = usesCompactVariant ? "734 1741" : "666 1885";
  const flareGlowStrokeWidth = usesCompactVariant ? 20 : 28;
  const flareGlowOpacity = usesCompactVariant ? 0.4 : 0.54;
  const flareBodyStrokeWidth = usesCompactVariant ? 12 : 10;
  const flareMainStrokeWidth = usesCompactVariant ? 10.5 : 8;
  const flareCoreStrokeWidth = usesCompactVariant ? 3 : 2.4;
  const flareGlowFilterId = usesCompactVariant ? softBlur20Id : softBlur28Id;

  return (
    <>
      <svg
        className={[className, variantClass, animationClass].filter(Boolean).join(" ")}
        viewBox="0 0 1024 1024"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
      >
        {title ? <title>{title}</title> : null}

        <defs>
          <radialGradient
            id={planetBaseId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(636 360) rotate(130) scale(514 494)"
          >
            <stop stopColor="#FFE1B5" />
            <stop offset="0.16" stopColor="#FFBA84" />
            <stop offset="0.34" stopColor="#F57E8A" />
            <stop offset="0.56" stopColor="#8A82F2" />
            <stop offset="0.76" stopColor="#41A0F1" />
            <stop offset="1" stopColor="#112C41" />
          </radialGradient>
          <radialGradient
            id={planetShadowId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(382 664) rotate(-28) scale(248 162)"
          >
            <stop stopColor="#0B1322" stopOpacity="0.74" />
            <stop offset="1" stopColor="#0B1322" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={planetHighlightId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(670 338) rotate(138) scale(192 126)"
          >
            <stop stopColor="#FFF4E2" stopOpacity="0.64" />
            <stop offset="0.48" stopColor="#FFF4E2" stopOpacity="0.22" />
            <stop offset="1" stopColor="#FFF4E2" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={flareGradientId} x1="674" y1="146" x2="906" y2="704" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F45C4D" />
            <stop offset="0.24" stopColor="#FF8A5D" />
            <stop offset="0.56" stopColor="#FFC37A" />
            <stop offset="0.82" stopColor="#FFE1A7" />
            <stop offset="1" stopColor="#FFF4DB" />
          </linearGradient>
          <linearGradient id={flareCoreId} x1="684" y1="160" x2="892" y2="690" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF9E78" />
            <stop offset="0.48" stopColor="#FFF0CF" />
            <stop offset="1" stopColor="#FFF8ED" />
          </linearGradient>
          <filter id={softBlur20Id} x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="20" />
          </filter>
          <filter id={softBlur28Id} x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="28" />
          </filter>
          <filter id={softBlur42Id} x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="42" />
          </filter>
          <clipPath id={planetClipId}>
            <circle cx="512" cy="512" r={planetRadius} />
          </clipPath>
        </defs>

        {usesCompactVariant ? null : (
          <>
            <circle cx="512" cy="512" r="458" stroke="#FFFFFF" strokeOpacity="0.03" strokeWidth="2" />
            <circle cx="512" cy="512" r="434" stroke="#342129" strokeOpacity="0.66" strokeWidth="12" />
            <circle cx="512" cy="512" r="420" stroke="#1A1E28" strokeOpacity="0.96" strokeWidth="20" />
            <circle cx="512" cy="512" r="406" stroke="#FFFFFF" strokeOpacity="0.055" strokeWidth="2" />
            <circle cx="512" cy="512" r="394" stroke="#FFFFFF" strokeOpacity="0.038" strokeWidth="1.4" />
            <circle
              cx="512"
              cy="512"
              r="434"
              stroke="#F3A16E"
              strokeOpacity="0.08"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="580 2147"
              transform="rotate(-136 512 512)"
            />
            <circle
              cx="512"
              cy="512"
              r="420"
              stroke="#FFFFFF"
              strokeOpacity="0.04"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray="520 2119"
              transform="rotate(-136 512 512)"
            />
          </>
        )}

        <g>
          {usesHeroVariant ? (
            <>
              <g filter={`url(#${softBlur42Id})`}>
                <circle
                  className={
                    resolvedPreset ? "curyo-planet-mark__flare-smoke curyo-planet-mark__flare-smoke--far" : undefined
                  }
                  cx="512"
                  cy="512"
                  r="406"
                  stroke="#FF764F"
                  strokeOpacity="0.2"
                  strokeWidth="50"
                  strokeLinecap="round"
                  strokeDasharray="812 1739"
                  transform="rotate(-70 512 512)"
                />
              </g>
              <g filter={`url(#${softBlur28Id})`}>
                <circle
                  className={
                    resolvedPreset ? "curyo-planet-mark__flare-smoke curyo-planet-mark__flare-smoke--near" : undefined
                  }
                  cx="512"
                  cy="512"
                  r="406"
                  stroke="#FFB07B"
                  strokeOpacity="0.18"
                  strokeWidth="30"
                  strokeLinecap="round"
                  strokeDasharray="726 1825"
                  transform="rotate(-68 512 512)"
                />
              </g>
            </>
          ) : null}

          <g filter={`url(#${flareGlowFilterId})`}>
            <circle
              className={resolvedPreset ? "curyo-planet-mark__flare-glow" : undefined}
              cx="512"
              cy="512"
              r={flareRadius}
              stroke="#F45C4D"
              strokeOpacity={flareGlowOpacity}
              strokeWidth={flareGlowStrokeWidth}
              strokeLinecap="round"
              strokeDasharray={flareDashArray}
              transform={`rotate(${flareRotation} 512 512)`}
            />
          </g>
          <circle
            className={resolvedPreset ? "curyo-planet-mark__flare-body" : undefined}
            cx="512"
            cy="512"
            r={flareRadius}
            stroke="#6D352A"
            strokeOpacity="0.42"
            strokeWidth={flareBodyStrokeWidth}
            strokeLinecap="round"
            strokeDasharray={flareDashArray}
            transform={`rotate(${flareRotation} 512 512)`}
          />
          <circle
            className={resolvedPreset ? "curyo-planet-mark__flare-main" : undefined}
            cx="512"
            cy="512"
            r={flareRadius}
            stroke={`url(#${flareGradientId})`}
            strokeWidth={flareMainStrokeWidth}
            strokeLinecap="round"
            strokeDasharray={flareDashArray}
            transform={`rotate(${flareRotation} 512 512)`}
          />
          <circle
            className={resolvedPreset ? "curyo-planet-mark__flare-core" : undefined}
            cx="512"
            cy="512"
            r={flareRadius}
            stroke={`url(#${flareCoreId})`}
            strokeWidth={flareCoreStrokeWidth}
            strokeLinecap="round"
            strokeDasharray={flareDashArray}
            transform={`rotate(${flareRotation} 512 512)`}
          />
        </g>

        {usesCompactVariant ? null : (
          <g className={resolvedPreset ? "curyo-planet-mark__node-orbit" : undefined}>
            {usesHeroVariant ? (
              <>
                <ellipse
                  className={
                    resolvedPreset ? "curyo-planet-mark__smoke-tail curyo-planet-mark__smoke-tail--primary" : undefined
                  }
                  cx="842"
                  cy="686"
                  rx="36"
                  ry="20"
                  fill="#FF835A"
                  fillOpacity="0.12"
                />
                <ellipse
                  className={
                    resolvedPreset
                      ? "curyo-planet-mark__smoke-tail curyo-planet-mark__smoke-tail--secondary"
                      : undefined
                  }
                  cx="824"
                  cy="662"
                  rx="28"
                  ry="15"
                  fill="#FFB88B"
                  fillOpacity="0.1"
                />
              </>
            ) : null}
            <circle
              className={resolvedPreset ? "curyo-planet-mark__node-halo" : undefined}
              cx="871"
              cy="703"
              r="23"
              fill="#FF8D65"
              fillOpacity="0.18"
            />
            {usesHeroVariant ? (
              <>
                <circle
                  className={resolvedPreset ? "curyo-planet-mark__ember curyo-planet-mark__ember--primary" : undefined}
                  cx="858"
                  cy="686"
                  r="4.6"
                  fill="#FFE4BC"
                  fillOpacity="0.9"
                />
                <circle
                  className={
                    resolvedPreset ? "curyo-planet-mark__ember curyo-planet-mark__ember--secondary" : undefined
                  }
                  cx="884"
                  cy="691"
                  r="3.6"
                  fill="#FFD39D"
                  fillOpacity="0.76"
                />
              </>
            ) : null}
            <circle
              className={resolvedPreset ? "curyo-planet-mark__node" : undefined}
              cx="871"
              cy="703"
              r="9"
              fill="#FFF3DF"
            />
          </g>
        )}

        <circle cx="512" cy="512" r={planetRadius} fill={`url(#${planetBaseId})`} />
        <g clipPath={`url(#${planetClipId})`}>
          <g filter={`url(#${softBlur20Id})`}>
            <ellipse cx="338" cy="386" rx="214" ry="164" fill="#3E9FF0" fillOpacity="0.42" />
            <ellipse cx="602" cy="312" rx="248" ry="174" fill="#F28593" fillOpacity="0.34" />
            <ellipse cx="698" cy="438" rx="244" ry="160" fill="#FFD79A" fillOpacity="0.24" />
            <ellipse cx="606" cy="648" rx="270" ry="150" fill="#11C6A4" fillOpacity="0.2" />
            <ellipse cx="346" cy="694" rx="286" ry="174" fill="#13263D" fillOpacity="0.62" />
            <ellipse cx="700" cy="760" rx="150" ry="110" fill="#35A5F6" fillOpacity="0.18" />
          </g>

          <path
            d="M132 312C242 264 356 264 476 290C578 312 678 322 814 316"
            stroke="#FFFFFF"
            strokeOpacity="0.11"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <path
            d="M120 418C236 372 354 378 474 406C578 430 676 440 810 434"
            stroke="#FFFFFF"
            strokeOpacity="0.1"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <path
            d="M118 522C236 478 356 486 478 516C582 542 676 552 806 546"
            stroke="#FFFFFF"
            strokeOpacity="0.08"
            strokeWidth="11"
            strokeLinecap="round"
          />
          <path
            d="M132 648C236 612 356 614 478 642C584 668 680 678 810 668"
            stroke="#FFFFFF"
            strokeOpacity="0.075"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M110 760C224 724 350 724 482 748C590 768 684 778 816 770"
            stroke="#2C4E72"
            strokeOpacity="0.28"
            strokeWidth="24"
            strokeLinecap="round"
          />
          <path
            d="M94 578C206 536 320 538 438 564C540 586 638 604 768 594C828 590 874 578 910 554"
            stroke="#F6A17C"
            strokeOpacity="0.12"
            strokeWidth="24"
            strokeLinecap="round"
          />

          <circle cx="640" cy="430" r="18" fill="#FFF2E2" fillOpacity="0.14" />
          <circle cx="332" cy="414" r="14" fill="#FFF2E2" fillOpacity="0.08" />
          <circle cx="596" cy="570" r="20" fill="#FFF2E2" fillOpacity="0.1" />
          <circle cx="370" cy="804" r="16" fill="#FFF2E2" fillOpacity="0.05" />
        </g>

        <circle cx="512" cy="512" r={planetRadius} fill={`url(#${planetShadowId})`} />
        <g
          className={resolvedPreset ? "curyo-planet-mark__planet-highlight" : undefined}
          filter={`url(#${softBlur28Id})`}
        >
          <ellipse cx="644" cy="340" rx="154" ry="106" fill="#FFF4E2" fillOpacity="0.22" />
        </g>
        <circle cx="512" cy="512" r={planetRadius} fill={`url(#${planetHighlightId})`} />
        <circle
          cx="512"
          cy="512"
          r={planetRadius}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.15"
          strokeWidth="1.4"
        />
      </svg>

      <style jsx>{`
        .curyo-planet-mark__node-orbit,
        .curyo-planet-mark__planet-highlight {
          transform-origin: 50% 50%;
          transform-box: view-box;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__flare-glow,
        .curyo-planet-mark--orbit .curyo-planet-mark__flare-body,
        .curyo-planet-mark--orbit .curyo-planet-mark__flare-main,
        .curyo-planet-mark--orbit .curyo-planet-mark__flare-core {
          animation: curyo-planet-mark-orbit-dash 14s linear infinite;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__flare-smoke--far {
          animation:
            curyo-planet-mark-orbit-dash-far 14s linear infinite,
            curyo-planet-mark-smoke-breathe 5.4s ease-in-out infinite;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__flare-smoke--near {
          animation:
            curyo-planet-mark-orbit-dash-near 14s linear infinite,
            curyo-planet-mark-smoke-breathe-alt 4.7s ease-in-out infinite;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__planet-highlight {
          animation: curyo-planet-mark-highlight 7.2s ease-in-out infinite;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__node-orbit {
          animation: curyo-planet-mark-node-orbit 14s linear infinite;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__node-halo {
          animation: curyo-planet-mark-node-halo 2.8s ease-in-out infinite;
          transform-origin: 871px 703px;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__node {
          animation: curyo-planet-mark-node 2.8s ease-in-out infinite;
          transform-origin: 871px 703px;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__smoke-tail--primary {
          animation: curyo-planet-mark-smoke-tail 4.8s ease-in-out infinite;
          transform-origin: 842px 686px;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__smoke-tail--secondary {
          animation: curyo-planet-mark-smoke-tail-alt 5.4s ease-in-out infinite;
          transform-origin: 824px 662px;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__ember--primary {
          animation: curyo-planet-mark-ember-primary 3.6s ease-in-out infinite;
          transform-origin: 858px 686px;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__ember--secondary {
          animation: curyo-planet-mark-ember-secondary 3.2s ease-in-out infinite;
          transform-origin: 884px 691px;
        }

        @keyframes curyo-planet-mark-orbit-dash {
          from {
            stroke-dashoffset: 0;
          }

          to {
            stroke-dashoffset: 2551px;
          }
        }

        @keyframes curyo-planet-mark-orbit-dash-far {
          from {
            stroke-dashoffset: 34px;
          }

          to {
            stroke-dashoffset: 2585px;
          }
        }

        @keyframes curyo-planet-mark-orbit-dash-near {
          from {
            stroke-dashoffset: -22px;
          }

          to {
            stroke-dashoffset: 2529px;
          }
        }

        @keyframes curyo-planet-mark-node-orbit {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        @keyframes curyo-planet-mark-highlight {
          0%,
          100% {
            opacity: 0.76;
            transform: scale(1);
          }

          50% {
            opacity: 1;
            transform: scale(1.025);
          }
        }

        @keyframes curyo-planet-mark-smoke-breathe {
          0%,
          100% {
            opacity: 0.42;
          }

          50% {
            opacity: 0.8;
          }
        }

        @keyframes curyo-planet-mark-smoke-breathe-alt {
          0%,
          100% {
            opacity: 0.34;
          }

          50% {
            opacity: 0.72;
          }
        }

        @keyframes curyo-planet-mark-node-halo {
          0%,
          100% {
            opacity: 0.55;
            transform: scale(0.92);
          }

          50% {
            opacity: 0.95;
            transform: scale(1.12);
          }
        }

        @keyframes curyo-planet-mark-node {
          0%,
          100% {
            opacity: 0.96;
            transform: scale(0.96);
          }

          50% {
            opacity: 1;
            transform: scale(1.08);
          }
        }

        @keyframes curyo-planet-mark-smoke-tail {
          0%,
          100% {
            opacity: 0.34;
            transform: scale(0.92) translate(-3px, 4px);
          }

          50% {
            opacity: 0.62;
            transform: scale(1.06) translate(6px, -6px);
          }
        }

        @keyframes curyo-planet-mark-smoke-tail-alt {
          0%,
          100% {
            opacity: 0.26;
            transform: scale(0.9) translate(-4px, 3px);
          }

          50% {
            opacity: 0.5;
            transform: scale(1.02) translate(7px, -8px);
          }
        }

        @keyframes curyo-planet-mark-ember-primary {
          0%,
          100% {
            opacity: 0.34;
            transform: scale(0.78) translate(0, 0);
          }

          50% {
            opacity: 1;
            transform: scale(1.14) translate(-8px, -14px);
          }
        }

        @keyframes curyo-planet-mark-ember-secondary {
          0%,
          100% {
            opacity: 0.26;
            transform: scale(0.74) translate(0, 0);
          }

          50% {
            opacity: 0.92;
            transform: scale(1.08) translate(10px, -12px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-smoke--far,
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-smoke--near,
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-glow,
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-body,
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-main,
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-core,
          .curyo-planet-mark--orbit .curyo-planet-mark__node-orbit,
          .curyo-planet-mark--orbit .curyo-planet-mark__planet-highlight,
          .curyo-planet-mark--orbit .curyo-planet-mark__smoke-tail--primary,
          .curyo-planet-mark--orbit .curyo-planet-mark__smoke-tail--secondary,
          .curyo-planet-mark--orbit .curyo-planet-mark__ember--primary,
          .curyo-planet-mark--orbit .curyo-planet-mark__ember--secondary,
          .curyo-planet-mark--orbit .curyo-planet-mark__node-halo,
          .curyo-planet-mark--orbit .curyo-planet-mark__node {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
