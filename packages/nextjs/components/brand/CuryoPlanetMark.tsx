import { useId } from "react";

interface CuryoPlanetMarkProps {
  className?: string;
  title?: string;
  animated?: boolean;
  animationPreset?: "orbit";
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
}: CuryoPlanetMarkProps) {
  const id = useId().replace(/:/g, "");
  const planetBaseId = `${id}-planet-base`;
  const planetShadowId = `${id}-planet-shadow`;
  const planetHighlightId = `${id}-planet-highlight`;
  const flareGradientId = `${id}-flare-gradient`;
  const flareCoreId = `${id}-flare-core`;
  const softBlur20Id = `${id}-soft-blur-20`;
  const softBlur28Id = `${id}-soft-blur-28`;
  const planetClipId = `${id}-planet-clip`;
  const resolvedPreset = animationPreset ?? (animated ? "orbit" : undefined);
  const animationClass = resolvedPreset ? `curyo-planet-mark--${resolvedPreset}` : "";

  return (
    <>
      <svg
        className={[className, animationClass].filter(Boolean).join(" ")}
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
          <clipPath id={planetClipId}>
            <circle cx="512" cy="512" r="344" />
          </clipPath>
        </defs>

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

        <g className={resolvedPreset ? "curyo-planet-mark__flare" : undefined}>
          <g filter={`url(#${softBlur28Id})`}>
            <circle
              cx="512"
              cy="512"
              r="406"
              stroke="#F45C4D"
              strokeOpacity="0.54"
              strokeWidth="28"
              strokeLinecap="round"
              strokeDasharray="666 1885"
              transform="rotate(-66 512 512)"
            />
          </g>
          <circle
            cx="512"
            cy="512"
            r="406"
            stroke="#6D352A"
            strokeOpacity="0.42"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray="666 1885"
            transform="rotate(-66 512 512)"
          />
          <circle
            cx="512"
            cy="512"
            r="406"
            stroke={`url(#${flareGradientId})`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="666 1885"
            transform="rotate(-66 512 512)"
          />
          <circle
            cx="512"
            cy="512"
            r="406"
            stroke={`url(#${flareCoreId})`}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="666 1885"
            transform="rotate(-66 512 512)"
          />
          <circle
            className={resolvedPreset ? "curyo-planet-mark__node-halo" : undefined}
            cx="871"
            cy="703"
            r="23"
            fill="#FF8D65"
            fillOpacity="0.18"
          />
          <circle
            className={resolvedPreset ? "curyo-planet-mark__node" : undefined}
            cx="871"
            cy="703"
            r="9"
            fill="#FFF3DF"
          />
        </g>

        <circle cx="512" cy="512" r="344" fill={`url(#${planetBaseId})`} />
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

        <circle cx="512" cy="512" r="344" fill={`url(#${planetShadowId})`} />
        <g
          className={resolvedPreset ? "curyo-planet-mark__planet-highlight" : undefined}
          filter={`url(#${softBlur28Id})`}
        >
          <ellipse cx="644" cy="340" rx="154" ry="106" fill="#FFF4E2" fillOpacity="0.22" />
        </g>
        <circle cx="512" cy="512" r="344" fill={`url(#${planetHighlightId})`} />
        <circle cx="512" cy="512" r="344" fill="none" stroke="#FFFFFF" strokeOpacity="0.15" strokeWidth="1.4" />
      </svg>

      <style jsx>{`
        .curyo-planet-mark__flare,
        .curyo-planet-mark__planet-highlight {
          transform-origin: 512px 512px;
          transform-box: fill-box;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__flare {
          animation: curyo-planet-mark-orbit 14s linear infinite;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__planet-highlight {
          animation: curyo-planet-mark-highlight 7.2s ease-in-out infinite;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__node-halo {
          animation: curyo-planet-mark-node-halo 2.8s ease-in-out infinite;
          transform-origin: 871px 703px;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__node {
          animation: curyo-planet-mark-node 2.8s ease-in-out infinite;
          transform-origin: 871px 703px;
        }

        @keyframes curyo-planet-mark-orbit {
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

        @media (prefers-reduced-motion: reduce) {
          .curyo-planet-mark--orbit .curyo-planet-mark__flare,
          .curyo-planet-mark--orbit .curyo-planet-mark__planet-highlight,
          .curyo-planet-mark--orbit .curyo-planet-mark__node-halo,
          .curyo-planet-mark--orbit .curyo-planet-mark__node {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
