import { useId } from "react";

interface CuryoPlanetMarkProps {
  className?: string;
  title?: string;
  animated?: boolean;
  animationPreset?: "orbit";
  variant?: "default" | "compact" | "hero";
}

const CENTER = 700;
const DEFAULT_FLARE_RADIUS = 626;
const COMPACT_FLARE_RADIUS = 652;
const HERO_FLARE_RADIUS = 630;
const DEFAULT_ARC_DEGREES = 94;
const COMPACT_ARC_DEGREES = 122;
const COMPACT_FLARE_START_DEGREES = -94;

function polarPoint(radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;

  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
}

function circleDashArray(radius: number, arcDegrees: number) {
  const circumference = 2 * Math.PI * radius;
  const dashLength = (circumference * arcDegrees) / 360;

  return `${dashLength.toFixed(1)} ${(circumference - dashLength).toFixed(1)}`;
}

function describeArcPath(radius: number, startDegrees: number, sweepDegrees: number) {
  const clampedSweep = Math.max(0, Math.min(sweepDegrees, 359.9));
  const startPoint = polarPoint(radius, startDegrees);
  const endPoint = polarPoint(radius, startDegrees + clampedSweep);
  const largeArcFlag = clampedSweep > 180 ? 1 : 0;

  return [
    `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)}`,
    `A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArcFlag} 1 ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`,
  ].join(" ");
}

function scaleAroundCenter(scale: number) {
  if (scale === 1) return undefined;
  return `translate(${CENTER} ${CENTER}) scale(${scale}) translate(${-CENTER} ${-CENTER})`;
}

/**
 * Canonical Curyo AI-sphere brand mark.
 * Uses the warm fold-with-flare art direction, with a stronger compact
 * treatment for header-sized logos and favicons.
 */
export function CuryoPlanetMark({
  className = "h-8 w-8",
  title,
  animated = false,
  animationPreset,
  variant = "default",
}: CuryoPlanetMarkProps) {
  const id = useId().replace(/:/g, "");
  const orbBaseId = `${id}-orb-base`;
  const orbRimId = `${id}-orb-rim`;
  const softWhiteId = `${id}-soft-white`;
  const coralBloomId = `${id}-coral-bloom`;
  const violetPocketId = `${id}-violet-pocket`;
  const bluePocketId = `${id}-blue-pocket`;
  const foldSheenId = `${id}-fold-sheen`;
  const flareGradientId = `${id}-flare-gradient`;
  const flareCoreId = `${id}-flare-core`;
  const blur24Id = `${id}-blur-24`;
  const blur40Id = `${id}-blur-40`;
  const blur52Id = `${id}-blur-52`;
  const orbClipId = `${id}-orb-clip`;

  const resolvedPreset = animationPreset ?? (animated ? "orbit" : undefined);
  const animationClass = resolvedPreset ? `curyo-planet-mark--${resolvedPreset}` : "";
  const variantClass = `curyo-planet-mark--${variant}`;
  const usesCompactVariant = variant === "compact";
  const usesHeroVariant = variant === "hero";
  const flareRadius = usesCompactVariant
    ? COMPACT_FLARE_RADIUS
    : usesHeroVariant
      ? HERO_FLARE_RADIUS
      : DEFAULT_FLARE_RADIUS;
  const flareRotation = usesCompactVariant ? COMPACT_FLARE_START_DEGREES : -66;
  const flareArcDegrees = usesCompactVariant ? COMPACT_ARC_DEGREES : DEFAULT_ARC_DEGREES;
  const flareDashArray = usesCompactVariant ? null : circleDashArray(flareRadius, flareArcDegrees);
  const flarePath = usesCompactVariant ? describeArcPath(flareRadius, flareRotation, flareArcDegrees) : null;
  const nodePoint = polarPoint(flareRadius, flareRotation + flareArcDegrees);
  const planetScale = usesCompactVariant ? 1.24 : usesHeroVariant ? 1.46 : 1.42;
  const flareGlowStrokeWidth = usesCompactVariant ? 0 : usesHeroVariant ? 32 : 28;
  const flareGlowOpacity = usesCompactVariant ? 0.68 : usesHeroVariant ? 0.58 : 0.54;
  const flareBodyStrokeWidth = usesCompactVariant ? 34 : usesHeroVariant ? 11 : 10;
  const flareMainStrokeWidth = usesCompactVariant ? 28 : usesHeroVariant ? 8.4 : 8;
  const flareCoreStrokeWidth = usesCompactVariant ? 10.5 : usesHeroVariant ? 2.8 : 2.4;
  const nodeHaloRadius = usesCompactVariant ? 0 : usesHeroVariant ? 25 : 23;
  const nodeRadius = usesCompactVariant ? 0 : usesHeroVariant ? 9.5 : 9;
  const flareGlowFilterId = usesHeroVariant ? blur52Id : blur40Id;
  const planetTransform = scaleAroundCenter(planetScale);
  const outerOrbitRadius = 680;
  const orbitAccentRadius = 654;
  const orbitTrackRadius = 640;
  const orbitArcRadius = DEFAULT_FLARE_RADIUS;
  const orbitInnerRadius = 612;
  const orbitAccentDashArray = circleDashArray(orbitAccentRadius, 76);
  const orbitHighlightDashArray = circleDashArray(orbitTrackRadius, 68);

  return (
    <>
      <svg
        className={[className, variantClass, animationClass].filter(Boolean).join(" ")}
        viewBox="0 0 1400 1400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
      >
        {title ? <title>{title}</title> : null}

        <defs>
          <radialGradient
            id={orbBaseId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(856 450) rotate(136) scale(720 702)"
          >
            <stop stopColor="#FFF8F2" />
            <stop offset="0.18" stopColor="#F8E1D0" />
            <stop offset="0.34" stopColor="#F7B070" />
            <stop offset="0.56" stopColor="#F26426" />
            <stop offset="0.78" stopColor="#B23C3B" />
            <stop offset="1" stopColor="#6A345F" />
          </radialGradient>
          <radialGradient
            id={orbRimId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(438 516) rotate(30) scale(240 540)"
          >
            <stop stopColor="#AFC5D7" stopOpacity="0.82" />
            <stop offset="0.22" stopColor="#7E8996" stopOpacity="0.34" />
            <stop offset="1" stopColor="#7E8996" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={softWhiteId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(710 520) rotate(128) scale(330 260)"
          >
            <stop stopColor="#FFF8F3" stopOpacity="0.74" />
            <stop offset="0.52" stopColor="#FFF8F3" stopOpacity="0.2" />
            <stop offset="1" stopColor="#FFF8F3" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={coralBloomId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(930 612) rotate(166) scale(270 220)"
          >
            <stop stopColor="#FFD77E" stopOpacity="0.82" />
            <stop offset="1" stopColor="#FFD77E" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={violetPocketId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(500 866) rotate(-26) scale(334 244)"
          >
            <stop stopColor="#6B37A5" stopOpacity="0.54" />
            <stop offset="1" stopColor="#6B37A5" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={bluePocketId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(620 760) rotate(8) scale(320 180)"
          >
            <stop stopColor="#8C4A53" stopOpacity="0.36" />
            <stop offset="0.58" stopColor="#C46A4A" stopOpacity="0.22" />
            <stop offset="1" stopColor="#C46A4A" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={foldSheenId} x1="290" y1="820" x2="1036" y2="650" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFF7F0" stopOpacity="0" />
            <stop offset="0.3" stopColor="#FFF7F0" stopOpacity="0.08" />
            <stop offset="0.56" stopColor="#FFF7F0" stopOpacity="0.34" />
            <stop offset="0.82" stopColor="#FFD7B2" stopOpacity="0.18" />
            <stop offset="1" stopColor="#FFD7B2" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={flareGradientId} x1="860" y1="260" x2="1050" y2="736" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F45C4D" />
            <stop offset="0.24" stopColor="#FF8A5D" />
            <stop offset="0.56" stopColor="#FFC37A" />
            <stop offset="0.82" stopColor="#FFE1A7" />
            <stop offset="1" stopColor="#FFF4DB" />
          </linearGradient>
          <linearGradient id={flareCoreId} x1="870" y1="280" x2="1036" y2="716" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF9E78" />
            <stop offset="0.48" stopColor="#FFF0CF" />
            <stop offset="1" stopColor="#FFF8ED" />
          </linearGradient>
          <filter id={blur24Id} x="0" y="0" width="1400" height="1400" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="24" />
          </filter>
          <filter id={blur40Id} x="0" y="0" width="1400" height="1400" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="40" />
          </filter>
          <filter id={blur52Id} x="0" y="0" width="1400" height="1400" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="52" />
          </filter>
          <clipPath id={orbClipId}>
            <circle cx="700" cy="700" r="360" />
          </clipPath>
        </defs>

        {usesCompactVariant ? (
          <circle cx="700" cy="700" r={flareRadius} stroke="#FFFFFF" strokeOpacity="0.06" strokeWidth="2.2" />
        ) : (
          <>
            <circle cx="700" cy="700" r={outerOrbitRadius} stroke="#FFFFFF" strokeOpacity="0.03" strokeWidth="2" />
            <circle cx="700" cy="700" r={orbitAccentRadius} stroke="#342129" strokeOpacity="0.66" strokeWidth="12" />
            <circle cx="700" cy="700" r={orbitTrackRadius} stroke="#1A1E28" strokeOpacity="0.96" strokeWidth="20" />
            <circle cx="700" cy="700" r={orbitArcRadius} stroke="#FFFFFF" strokeOpacity="0.055" strokeWidth="2" />
            <circle cx="700" cy="700" r={orbitInnerRadius} stroke="#FFFFFF" strokeOpacity="0.038" strokeWidth="1.4" />
            <circle
              cx="700"
              cy="700"
              r={orbitAccentRadius}
              stroke="#F3A16E"
              strokeOpacity="0.08"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={orbitAccentDashArray}
              transform="rotate(-136 700 700)"
            />
            <circle
              cx="700"
              cy="700"
              r={orbitTrackRadius}
              stroke="#FFFFFF"
              strokeOpacity="0.04"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray={orbitHighlightDashArray}
              transform="rotate(-136 700 700)"
            />
          </>
        )}

        <g className="curyo-planet-mark__flare-scale">
          <g className={resolvedPreset ? "curyo-planet-mark__flare-orbit" : undefined}>
            {usesCompactVariant ? (
              <>
                <path
                  d={flarePath ?? undefined}
                  fill="none"
                  stroke="#6D352A"
                  strokeOpacity="0.2"
                  strokeWidth={flareBodyStrokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  shapeRendering="geometricPrecision"
                />
                <path
                  d={flarePath ?? undefined}
                  fill="none"
                  stroke={`url(#${flareGradientId})`}
                  strokeWidth={flareMainStrokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  shapeRendering="geometricPrecision"
                />
                <path
                  d={flarePath ?? undefined}
                  fill="none"
                  stroke={`url(#${flareCoreId})`}
                  strokeOpacity="0.96"
                  strokeWidth={flareCoreStrokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  shapeRendering="geometricPrecision"
                />
              </>
            ) : (
              <>
                <g filter={`url(#${flareGlowFilterId})`}>
                  <circle
                    cx="700"
                    cy="700"
                    r={flareRadius}
                    stroke="#F45C4D"
                    strokeOpacity={flareGlowOpacity}
                    strokeWidth={flareGlowStrokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={flareDashArray ?? undefined}
                    transform={`rotate(${flareRotation} 700 700)`}
                  />
                </g>
                <circle
                  cx="700"
                  cy="700"
                  r={flareRadius}
                  stroke="#6D352A"
                  strokeOpacity="0.42"
                  strokeWidth={flareBodyStrokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={flareDashArray ?? undefined}
                  transform={`rotate(${flareRotation} 700 700)`}
                />
                <circle
                  cx="700"
                  cy="700"
                  r={flareRadius}
                  stroke={`url(#${flareGradientId})`}
                  strokeWidth={flareMainStrokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={flareDashArray ?? undefined}
                  transform={`rotate(${flareRotation} 700 700)`}
                />
                <circle
                  cx="700"
                  cy="700"
                  r={flareRadius}
                  stroke={`url(#${flareCoreId})`}
                  strokeWidth={flareCoreStrokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={flareDashArray ?? undefined}
                  transform={`rotate(${flareRotation} 700 700)`}
                />
                <circle
                  className={resolvedPreset ? "curyo-planet-mark__node-halo" : undefined}
                  cx={nodePoint.x}
                  cy={nodePoint.y}
                  r={nodeHaloRadius}
                  fill="#FF8D65"
                  fillOpacity={0.18}
                />
                <circle
                  className={resolvedPreset ? "curyo-planet-mark__node" : undefined}
                  cx={nodePoint.x}
                  cy={nodePoint.y}
                  r={nodeRadius}
                  fill="#FFF3DF"
                />
              </>
            )}
          </g>
        </g>

        <g transform={planetTransform}>
          <circle cx="700" cy="700" r="360" fill={`url(#${orbBaseId})`} />
          <circle cx="700" cy="700" r="360" fill={`url(#${orbRimId})`} />
          <g clipPath={`url(#${orbClipId})`}>
            <g filter={`url(#${blur40Id})`}>
              <ellipse cx="672" cy="538" rx="280" ry="184" fill={`url(#${softWhiteId})`} />
              <ellipse cx="930" cy="640" rx="246" ry="214" fill={`url(#${coralBloomId})`} />
              <ellipse cx="508" cy="904" rx="286" ry="218" fill={`url(#${violetPocketId})`} />
              <ellipse cx="662" cy="774" rx="316" ry="176" fill={`url(#${bluePocketId})`} />
            </g>

            <path
              d="M330 822C464 734 582 684 704 670C810 658 902 686 1018 760C944 812 868 844 788 858C680 876 560 868 442 840C404 832 368 826 330 822Z"
              fill={`url(#${foldSheenId})`}
            />
            <path
              d="M350 838C466 760 574 724 694 714C808 704 906 726 1012 776C932 814 852 838 766 848C642 864 520 858 402 840C384 838 366 838 350 838Z"
              fill="#F5E3D2"
              fillOpacity="0.11"
            />
            <path
              d="M404 542C518 494 634 492 752 530C842 560 938 626 1038 724"
              stroke="#FFF7F1"
              strokeOpacity="0.16"
              strokeWidth="22"
              strokeLinecap="round"
            />
            <path
              d="M344 930C456 908 574 916 706 956C820 990 910 1040 988 1110"
              stroke="#E2B2A0"
              strokeOpacity="0.1"
              strokeWidth="24"
              strokeLinecap="round"
            />
            <g className={resolvedPreset ? "curyo-planet-mark__planet-highlight" : undefined}>
              <circle cx="1118" cy="490" r="50" fill="#FFF9F2" fillOpacity="0.9" />
              <circle cx="664" cy="556" r="190" fill={`url(#${softWhiteId})`} />
            </g>
          </g>

          <circle cx="700" cy="700" r="360" fill="none" stroke="#FFF8F2" strokeOpacity="0.14" strokeWidth="2" />
        </g>
      </svg>

      <style jsx>{`
        .curyo-planet-mark__flare-scale,
        .curyo-planet-mark__flare-orbit,
        .curyo-planet-mark__planet-highlight {
          transform-origin: 50% 50%;
          transform-box: view-box;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__flare-orbit {
          animation: curyo-planet-mark-orbit 14s linear infinite;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__planet-highlight {
          animation: curyo-planet-mark-highlight 7.2s ease-in-out infinite;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__node-halo {
          animation: curyo-planet-mark-node-halo 2.8s ease-in-out infinite;
          transform-origin: ${nodePoint.x}px ${nodePoint.y}px;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__node {
          animation: curyo-planet-mark-node 2.8s ease-in-out infinite;
          transform-origin: ${nodePoint.x}px ${nodePoint.y}px;
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
            opacity: 0.82;
            transform: scale(1);
          }

          50% {
            opacity: 1;
            transform: scale(1.02);
          }
        }

        @keyframes curyo-planet-mark-node-halo {
          0%,
          100% {
            opacity: 0.56;
            transform: scale(0.92);
          }

          50% {
            opacity: 0.96;
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
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-orbit,
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
