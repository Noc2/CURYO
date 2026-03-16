import { useId } from "react";

interface CuryoPlanetMarkProps {
  className?: string;
  title?: string;
  animated?: boolean;
  animationPreset?: "orbit";
  variant?: "default" | "compact" | "hero";
}

/**
 * Canonical Curyo orb-and-flare brand mark.
 * The flare/orbit geometry stays aligned with the live website treatment while
 * the old planet surface is replaced with the softer AI-sphere orb.
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
  const orbSoftWhiteId = `${id}-orb-soft-white`;
  const orbGoldBloomId = `${id}-orb-gold-bloom`;
  const orbVioletPocketId = `${id}-orb-violet-pocket`;
  const orbEmberPocketId = `${id}-orb-ember-pocket`;
  const orbFoldSheenId = `${id}-orb-fold-sheen`;
  const softBlur20Id = `${id}-soft-blur-20`;
  const softBlur28Id = `${id}-soft-blur-28`;
  const softBlur42Id = `${id}-soft-blur-42`;
  const planetClipId = `${id}-planet-clip`;
  const resolvedPreset = animationPreset ?? (animated ? "orbit" : undefined);
  const animationClass = resolvedPreset ? `curyo-planet-mark--${resolvedPreset}` : "";
  const variantClass = `curyo-planet-mark--${variant}`;
  const usesHeroVariant = variant === "hero";
  const usesCompactVariant = variant === "compact";
  const planetRadius = usesCompactVariant ? 332 : 344;
  const flareRadius = usesCompactVariant ? 438 : 406;
  const flareRotation = usesCompactVariant ? -92 : -66;
  const flareDashArray = usesCompactVariant ? "1044 1708" : "666 1885";
  const flareGlowStrokeWidth = usesCompactVariant ? 30 : 28;
  const flareGlowOpacity = usesCompactVariant ? 0.52 : 0.54;
  const flareBodyStrokeWidth = usesCompactVariant ? 17 : 10;
  const flareMainStrokeWidth = usesCompactVariant ? 15 : 8;
  const flareCoreStrokeWidth = usesCompactVariant ? 4.8 : 2.4;
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
            <stop stopColor="#FFF8F2" />
            <stop offset="0.18" stopColor="#F8E1D0" />
            <stop offset="0.34" stopColor="#F7B070" />
            <stop offset="0.56" stopColor="#F26426" />
            <stop offset="0.78" stopColor="#B23C3B" />
            <stop offset="1" stopColor="#6A345F" />
          </radialGradient>
          <radialGradient
            id={planetShadowId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(600 742) rotate(8) scale(324 188)"
          >
            <stop stopColor="#8C4A53" stopOpacity="0.32" />
            <stop offset="0.58" stopColor="#C46A4A" stopOpacity="0.2" />
            <stop offset="1" stopColor="#C46A4A" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={planetHighlightId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(674 366) rotate(134) scale(280 228)"
          >
            <stop stopColor="#FFF8F3" stopOpacity="0.72" />
            <stop offset="0.5" stopColor="#FFF8F3" stopOpacity="0.18" />
            <stop offset="1" stopColor="#FFF8F3" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={orbSoftWhiteId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(612 454) rotate(128) scale(310 236)"
          >
            <stop stopColor="#FFF8F3" stopOpacity="0.74" />
            <stop offset="0.52" stopColor="#FFF8F3" stopOpacity="0.2" />
            <stop offset="1" stopColor="#FFF8F3" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={orbGoldBloomId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(724 566) rotate(166) scale(264 216)"
          >
            <stop stopColor="#FFD77E" stopOpacity="0.8" />
            <stop offset="1" stopColor="#FFD77E" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={orbVioletPocketId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(370 662) rotate(-26) scale(274 210)"
          >
            <stop stopColor="#6B37A5" stopOpacity="0.52" />
            <stop offset="1" stopColor="#6B37A5" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={orbEmberPocketId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(600 742) rotate(8) scale(324 188)"
          >
            <stop stopColor="#8C4A53" stopOpacity="0.32" />
            <stop offset="0.58" stopColor="#C46A4A" stopOpacity="0.2" />
            <stop offset="1" stopColor="#C46A4A" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={orbFoldSheenId} x1="188" y1="600" x2="744" y2="470" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFF7F0" stopOpacity="0" />
            <stop offset="0.3" stopColor="#FFF7F0" stopOpacity="0.08" />
            <stop offset="0.56" stopColor="#FFF7F0" stopOpacity="0.34" />
            <stop offset="0.82" stopColor="#FFD7B2" stopOpacity="0.18" />
            <stop offset="1" stopColor="#FFD7B2" stopOpacity="0" />
          </linearGradient>
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

        <g className="curyo-planet-mark__flare-scale">
          <g className={resolvedPreset ? "curyo-planet-mark__flare-orbit" : undefined}>
            <g>
              {usesHeroVariant ? (
                <>
                  <g filter={`url(#${softBlur42Id})`}>
                    <circle
                      className={
                        resolvedPreset
                          ? "curyo-planet-mark__flare-smoke curyo-planet-mark__flare-smoke--far"
                          : undefined
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
                        resolvedPreset
                          ? "curyo-planet-mark__flare-smoke curyo-planet-mark__flare-smoke--near"
                          : undefined
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
              <g>
                {usesHeroVariant ? (
                  <>
                    <ellipse
                      className={
                        resolvedPreset
                          ? "curyo-planet-mark__smoke-tail curyo-planet-mark__smoke-tail--primary"
                          : undefined
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
                      className={
                        resolvedPreset ? "curyo-planet-mark__ember curyo-planet-mark__ember--primary" : undefined
                      }
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
          </g>
        </g>

        <circle cx="512" cy="512" r={planetRadius} fill={`url(#${planetBaseId})`} />
        {usesCompactVariant ? null : <circle cx="512" cy="512" r={planetRadius} fill={`url(#${orbEmberPocketId})`} />}
        <g clipPath={`url(#${planetClipId})`}>
          <g filter={`url(#${softBlur20Id})`}>
            <ellipse cx="502" cy="430" rx="268" ry="176" fill={`url(#${orbSoftWhiteId})`} />
            <ellipse cx="726" cy="586" rx="236" ry="204" fill={`url(#${orbGoldBloomId})`} />
            <ellipse cx="370" cy="714" rx="274" ry="208" fill={`url(#${orbVioletPocketId})`} />
            <ellipse cx="562" cy="650" rx="302" ry="170" fill={`url(#${planetShadowId})`} />
          </g>

          <path
            d="M188 602C322 514 440 464 562 452C668 440 760 468 876 542C802 594 726 626 646 640C538 658 418 650 300 620C262 612 226 606 188 602Z"
            fill={`url(#${orbFoldSheenId})`}
          />
          <path
            d="M210 618C330 560 444 538 550 540C654 542 748 568 826 618C744 658 652 678 546 678C430 676 320 656 210 618Z"
            fill="#F5E3D2"
            fillOpacity="0.11"
          />
          <path
            d="M244 378C358 326 470 324 582 360C668 388 754 446 842 536"
            stroke="#FFF7F1"
            strokeOpacity="0.16"
            strokeWidth="20"
            strokeLinecap="round"
          />
          <path
            d="M184 714C294 692 410 700 538 738C648 772 736 820 810 886"
            stroke="#E2B2A0"
            strokeOpacity="0.1"
            strokeWidth="22"
            strokeLinecap="round"
          />

          <circle cx="286" cy="400" r="14" fill="#FFF2E2" fillOpacity="0.08" />
          <circle cx="668" cy="360" r="46" fill="#FFF9F2" fillOpacity="0.9" />
        </g>

        <g
          className={resolvedPreset ? "curyo-planet-mark__planet-highlight" : undefined}
          filter={`url(#${softBlur28Id})`}
        >
          <ellipse cx="486" cy="406" rx="164" ry="128" fill="#FFF4E2" fillOpacity="0.22" />
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
        .curyo-planet-mark__flare-scale,
        .curyo-planet-mark__flare-orbit,
        .curyo-planet-mark__planet-highlight {
          transform-origin: 50% 50%;
          transform-box: view-box;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__flare-orbit {
          animation: curyo-planet-mark-orbit 14s linear infinite;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__flare-smoke--far {
          animation: curyo-planet-mark-smoke-breathe 5.4s ease-in-out infinite;
        }

        .curyo-planet-mark--orbit .curyo-planet-mark__flare-smoke--near {
          animation: curyo-planet-mark-smoke-breathe-alt 4.7s ease-in-out infinite;
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
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-orbit,
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-smoke--far,
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-smoke--near,
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-glow,
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-body,
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-main,
          .curyo-planet-mark--orbit .curyo-planet-mark__flare-core,
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

        @media (max-width: 639px) {
          .curyo-planet-mark--hero .curyo-planet-mark__flare-scale {
            transform: scale(1.08);
          }

          .curyo-planet-mark--compact .curyo-planet-mark__flare-scale,
          .curyo-planet-mark--default .curyo-planet-mark__flare-scale {
            transform: scale(1.04);
          }
        }
      `}</style>
    </>
  );
}
