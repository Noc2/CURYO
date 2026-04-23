"use client";

import { useId } from "react";

interface PosterOrbSceneProps {
  className?: string;
  title?: string;
  animated?: boolean;
}

const CENTER = 750;
const ORB_RADIUS = 356;
const ORBIT_RADIUS = 520;

function polarPoint(radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;

  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
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

export function PosterOrbScene({
  className = "h-full w-full",
  title = "Poster-inspired Curyo orb",
  animated = true,
}: PosterOrbSceneProps) {
  const id = useId().replace(/:/g, "");
  const orbClipId = `${id}-poster-orb-clip`;
  const orbBaseId = `${id}-poster-orb-base`;
  const orbEdgeId = `${id}-poster-orb-edge`;
  const hotCoreId = `${id}-poster-hot-core`;
  const upperVeilId = `${id}-poster-upper-veil`;
  const warmRibbonId = `${id}-poster-warm-ribbon`;
  const frontRibbonId = `${id}-poster-front-ribbon`;
  const lowerRibbonId = `${id}-poster-lower-ribbon`;
  const shadowBandId = `${id}-poster-shadow-band`;
  const smokeWarmId = `${id}-poster-smoke-warm`;
  const smokePlumId = `${id}-poster-smoke-plum`;
  const smokeDustId = `${id}-poster-smoke-dust`;
  const orbitGlowId = `${id}-poster-orbit-glow`;
  const orbitCoreId = `${id}-poster-orbit-core`;
  const blur24Id = `${id}-poster-blur-24`;
  const blur44Id = `${id}-poster-blur-44`;
  const blur82Id = `${id}-poster-blur-82`;
  const smokeFilterId = `${id}-poster-smoke-filter`;
  const grainFilterId = `${id}-poster-grain-filter`;

  const orbitBackPath = describeArcPath(ORBIT_RADIUS, 150, 92);
  const orbitFrontPath = describeArcPath(ORBIT_RADIUS, 204, 160);
  const orbitSparkPath = describeArcPath(ORBIT_RADIUS, 276, 42);
  const nodePoint = polarPoint(ORBIT_RADIUS, 364);

  const stars = [
    { x: 224, y: 338, r: 2.4, opacity: 0.54, color: "#F5EBDD" },
    { x: 316, y: 1118, r: 2.2, opacity: 0.46, color: "#F89C59" },
    { x: 1182, y: 268, r: 2.6, opacity: 0.45, color: "#F4E8D9" },
    { x: 1236, y: 1054, r: 2.1, opacity: 0.58, color: "#FF9B6A" },
    { x: 1328, y: 846, r: 2.5, opacity: 0.52, color: "#FFB16D" },
    { x: 1102, y: 1178, r: 1.9, opacity: 0.42, color: "#F6E9E2" },
    { x: 368, y: 486, r: 1.8, opacity: 0.44, color: "#D8B9C0" },
    { x: 934, y: 1216, r: 1.6, opacity: 0.36, color: "#FF8554" },
  ];

  return (
    <>
      <svg
        className={[className, animated ? "poster-orb-scene--animated" : ""].filter(Boolean).join(" ")}
        viewBox="0 0 1500 1500"
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
            gradientTransform="translate(830 560) rotate(124) scale(760 792)"
          >
            <stop stopColor="#FFF7EA" />
            <stop offset="0.16" stopColor="#FDE6C7" />
            <stop offset="0.34" stopColor="#F8A56A" />
            <stop offset="0.54" stopColor="#F36A33" />
            <stop offset="0.76" stopColor="#6E344B" />
            <stop offset="1" stopColor="#120E18" />
          </radialGradient>
          <radialGradient
            id={orbEdgeId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(568 548) rotate(22) scale(244 566)"
          >
            <stop stopColor="#FFEFE1" stopOpacity="0.74" />
            <stop offset="0.22" stopColor="#DFAF9A" stopOpacity="0.28" />
            <stop offset="1" stopColor="#DFAF9A" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={hotCoreId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(750 786) rotate(94) scale(314 304)"
          >
            <stop stopColor="#FFF8E9" />
            <stop offset="0.18" stopColor="#FFD9A0" stopOpacity="0.94" />
            <stop offset="0.46" stopColor="#FF8B55" stopOpacity="0.9" />
            <stop offset="1" stopColor="#FF8B55" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={upperVeilId} x1="476" y1="448" x2="1118" y2="826" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFF8F0" stopOpacity="0.82" />
            <stop offset="0.24" stopColor="#FFE8D0" stopOpacity="0.52" />
            <stop offset="0.68" stopColor="#A97F8E" stopOpacity="0.28" />
            <stop offset="1" stopColor="#40273A" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id={warmRibbonId} x1="420" y1="656" x2="1120" y2="1038" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFBE79" />
            <stop offset="0.28" stopColor="#FF8751" />
            <stop offset="0.62" stopColor="#F05C2E" />
            <stop offset="1" stopColor="#7A3340" />
          </linearGradient>
          <linearGradient id={frontRibbonId} x1="640" y1="758" x2="1220" y2="1120" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFF5E7" stopOpacity="0.88" />
            <stop offset="0.34" stopColor="#FEC88C" stopOpacity="0.94" />
            <stop offset="0.66" stopColor="#74455F" stopOpacity="0.88" />
            <stop offset="1" stopColor="#281827" stopOpacity="0.78" />
          </linearGradient>
          <linearGradient id={lowerRibbonId} x1="436" y1="876" x2="1104" y2="1260" gradientUnits="userSpaceOnUse">
            <stop stopColor="#281322" />
            <stop offset="0.36" stopColor="#5D355C" />
            <stop offset="0.68" stopColor="#7D4D74" />
            <stop offset="1" stopColor="#2A1728" />
          </linearGradient>
          <linearGradient id={shadowBandId} x1="424" y1="838" x2="1166" y2="1102" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1B101A" stopOpacity="0.98" />
            <stop offset="0.4" stopColor="#27141E" stopOpacity="0.94" />
            <stop offset="0.76" stopColor="#4A1D2C" stopOpacity="0.74" />
            <stop offset="1" stopColor="#6A2A33" stopOpacity="0.4" />
          </linearGradient>
          <radialGradient
            id={smokeWarmId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(1144 838) rotate(142) scale(388 310)"
          >
            <stop stopColor="#FDAB6D" stopOpacity="0.46" />
            <stop offset="0.54" stopColor="#A74F35" stopOpacity="0.2" />
            <stop offset="1" stopColor="#A74F35" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={smokePlumId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(408 1046) rotate(10) scale(408 314)"
          >
            <stop stopColor="#C68BA0" stopOpacity="0.42" />
            <stop offset="0.44" stopColor="#6E4561" stopOpacity="0.24" />
            <stop offset="1" stopColor="#6E4561" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={smokeDustId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(752 1182) rotate(90) scale(420 220)"
          >
            <stop stopColor="#FF9B5B" stopOpacity="0.34" />
            <stop offset="0.6" stopColor="#8C412E" stopOpacity="0.16" />
            <stop offset="1" stopColor="#8C412E" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={orbitGlowId} x1="260" y1="1130" x2="1264" y2="918" gradientUnits="userSpaceOnUse">
            <stop stopColor="#B84E33" />
            <stop offset="0.28" stopColor="#FF8E58" />
            <stop offset="0.62" stopColor="#FFD38B" />
            <stop offset="1" stopColor="#FFF3D5" />
          </linearGradient>
          <linearGradient id={orbitCoreId} x1="346" y1="1106" x2="1296" y2="932" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF764C" />
            <stop offset="0.42" stopColor="#FFF4D5" />
            <stop offset="1" stopColor="#FFF8F0" />
          </linearGradient>
          <filter id={blur24Id} x="0" y="0" width="1500" height="1500" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="24" />
          </filter>
          <filter id={blur44Id} x="0" y="0" width="1500" height="1500" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="44" />
          </filter>
          <filter id={blur82Id} x="0" y="0" width="1500" height="1500" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="82" />
          </filter>
          <filter id={smokeFilterId} x="0" y="0" width="1500" height="1500" filterUnits="userSpaceOnUse">
            <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="2" seed="11" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="34" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id={grainFilterId} x="0" y="0" width="1500" height="1500" filterUnits="userSpaceOnUse">
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="1" seed="4" result="grain" />
            <feColorMatrix
              in="grain"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 0.18 0"
            />
          </filter>
          <clipPath id={orbClipId}>
            <circle cx={CENTER} cy={CENTER} r={ORB_RADIUS} />
          </clipPath>
        </defs>

        <rect width="1500" height="1500" fill="#040405" />

        <g className={animated ? "poster-orb-scene__haze poster-orb-scene__haze--top" : undefined}>
          <ellipse
            cx="788"
            cy="256"
            rx="276"
            ry="164"
            fill="#FFF4E8"
            fillOpacity="0.055"
            filter={`url(#${blur82Id})`}
          />
          <path
            d="M1024 588C1080 448 1192 410 1292 446C1384 480 1440 586 1428 720C1376 826 1288 888 1172 880C1088 874 1016 820 980 742C978 690 990 634 1024 588Z"
            fill={`url(#${smokeWarmId})`}
            filter={`url(#${smokeFilterId})`}
            opacity="0.95"
          />
          <path
            d="M186 1010C244 908 342 848 460 854C556 860 618 924 636 1016C602 1106 526 1182 424 1210C320 1238 228 1202 176 1128C156 1082 162 1040 186 1010Z"
            fill={`url(#${smokePlumId})`}
            filter={`url(#${smokeFilterId})`}
            opacity="0.94"
          />
          <ellipse
            cx="756"
            cy="1184"
            rx="384"
            ry="120"
            fill={`url(#${smokeDustId})`}
            filter={`url(#${blur44Id})`}
            opacity="0.8"
          />
        </g>

        <g filter={`url(#${blur24Id})`} opacity="0.58">
          {stars.map(star => (
            <circle
              key={`${star.x}-${star.y}`}
              cx={star.x}
              cy={star.y}
              r={star.r}
              fill={star.color}
              fillOpacity={star.opacity}
            />
          ))}
        </g>

        <g className={animated ? "poster-orb-scene__orbit-ring poster-orb-scene__orbit-ring--rear" : undefined}>
          <path d={orbitBackPath} stroke="#C35A39" strokeOpacity="0.16" strokeWidth="18" strokeLinecap="round" />
          <path
            d={orbitBackPath}
            stroke={`url(#${orbitGlowId})`}
            strokeOpacity="0.24"
            strokeWidth="7"
            strokeLinecap="round"
            filter={`url(#${blur24Id})`}
          />
        </g>

        <g className={animated ? "poster-orb-scene__orb" : undefined}>
          <circle cx={CENTER} cy={CENTER} r={ORB_RADIUS} fill={`url(#${orbBaseId})`} />
          <circle cx={CENTER} cy={CENTER} r={ORB_RADIUS} fill={`url(#${orbEdgeId})`} />

          <g clipPath={`url(#${orbClipId})`}>
            <ellipse cx="754" cy="814" rx="248" ry="210" fill={`url(#${hotCoreId})`} filter={`url(#${blur44Id})`} />
            <ellipse
              cx="674"
              cy="552"
              rx="170"
              ry="126"
              fill="#FFF8F0"
              fillOpacity="0.4"
              filter={`url(#${blur44Id})`}
            />
            <ellipse
              cx="928"
              cy="960"
              rx="242"
              ry="162"
              fill="#8F6488"
              fillOpacity="0.24"
              filter={`url(#${blur44Id})`}
            />

            <path
              d="M392 652C458 482 604 380 774 384C938 388 1076 478 1124 642C1036 554 936 514 816 522C646 534 508 630 430 784C386 734 376 694 392 652Z"
              fill={`url(#${upperVeilId})`}
            />
            <path
              d="M418 790C508 628 662 548 838 556C980 562 1092 636 1134 746C1086 824 1018 886 922 936C820 990 700 1016 582 1004C486 994 414 948 380 886C382 852 394 820 418 790Z"
              fill={`url(#${warmRibbonId})`}
            />
            <path
              d="M424 894C560 836 716 816 870 824C994 832 1094 878 1162 960C1078 1022 982 1062 864 1082C714 1108 556 1098 418 1046C394 1000 394 946 424 894Z"
              fill={`url(#${shadowBandId})`}
            />
            <path
              d="M732 840C820 760 930 722 1038 734C1122 744 1192 792 1230 866C1204 960 1128 1034 1026 1076C926 1118 804 1114 700 1064C636 1034 592 982 580 914C624 890 674 864 732 840Z"
              fill={`url(#${frontRibbonId})`}
            />
            <path
              d="M372 942C488 1008 648 1028 816 1000C960 976 1074 912 1154 812C1158 938 1110 1048 1012 1126C914 1204 790 1242 660 1222C520 1200 412 1106 372 942Z"
              fill={`url(#${lowerRibbonId})`}
            />

            <g filter={`url(#${blur24Id})`} opacity="0.84">
              <path
                d="M428 700C510 564 626 494 772 490C914 486 1032 562 1096 680"
                stroke="#FFF6EA"
                strokeWidth="16"
                strokeLinecap="round"
              />
              <path
                d="M452 810C548 666 674 600 818 600C946 602 1046 656 1100 742"
                stroke="#FFECD7"
                strokeWidth="15"
                strokeLinecap="round"
              />
              <path
                d="M700 878C788 802 902 772 1012 792C1094 808 1158 852 1194 916"
                stroke="#FFE8D0"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M470 1042C592 1080 732 1086 872 1048C998 1016 1090 958 1148 878"
                stroke="#FFB579"
                strokeWidth="10"
                strokeLinecap="round"
              />
            </g>

            <g opacity="0.44" filter={`url(#${grainFilterId})`}>
              <circle cx={CENTER} cy={CENTER} r={ORB_RADIUS} fill="#FFF6EE" />
            </g>
          </g>

          <circle
            cx={CENTER}
            cy={CENTER}
            r={ORB_RADIUS}
            fill="none"
            stroke="#FFF0E2"
            strokeOpacity="0.18"
            strokeWidth="2.6"
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={ORB_RADIUS + 4}
            fill="none"
            stroke="#FFF7EE"
            strokeOpacity="0.08"
            strokeWidth="18"
            filter={`url(#${blur24Id})`}
          />
        </g>

        <g className={animated ? "poster-orb-scene__orbit-ring poster-orb-scene__orbit-ring--front" : undefined}>
          <path d={orbitFrontPath} stroke="#8E392B" strokeOpacity="0.44" strokeWidth="30" strokeLinecap="round" />
          <path
            d={orbitFrontPath}
            stroke={`url(#${orbitGlowId})`}
            strokeOpacity="0.9"
            strokeWidth="10"
            strokeLinecap="round"
            filter={`url(#${blur24Id})`}
          />
          <path d={orbitFrontPath} stroke={`url(#${orbitGlowId})`} strokeWidth="7.4" strokeLinecap="round" />
          <path d={orbitFrontPath} stroke={`url(#${orbitCoreId})`} strokeWidth="2.8" strokeLinecap="round" />
          <path
            d={orbitSparkPath}
            stroke="#FFF5DA"
            strokeOpacity="0.84"
            strokeWidth="2.2"
            strokeLinecap="round"
            filter={`url(#${blur24Id})`}
          />

          <path
            d={`M ${nodePoint.x - 94} ${nodePoint.y + 20} C ${nodePoint.x - 40} ${nodePoint.y - 4}, ${nodePoint.x - 12} ${nodePoint.y - 4}, ${nodePoint.x} ${nodePoint.y}`}
            stroke={`url(#${orbitGlowId})`}
            strokeOpacity="0.8"
            strokeWidth="10"
            strokeLinecap="round"
            filter={`url(#${blur24Id})`}
          />
          <circle
            className={animated ? "poster-orb-scene__flare-halo" : undefined}
            cx={nodePoint.x}
            cy={nodePoint.y}
            r="40"
            fill="#FFB86E"
            fillOpacity="0.22"
            filter={`url(#${blur44Id})`}
          />
          <circle
            className={animated ? "poster-orb-scene__flare-node" : undefined}
            cx={nodePoint.x}
            cy={nodePoint.y}
            r="18"
            fill="#FFF7E9"
          />
          <circle cx={nodePoint.x} cy={nodePoint.y} r="9" fill="#FFFDF8" />
        </g>
      </svg>

      <style jsx>{`
        .poster-orb-scene--animated .poster-orb-scene__orb,
        .poster-orb-scene--animated .poster-orb-scene__orbit-ring,
        .poster-orb-scene--animated .poster-orb-scene__haze,
        .poster-orb-scene--animated .poster-orb-scene__flare-node,
        .poster-orb-scene--animated .poster-orb-scene__flare-halo {
          transform-origin: 50% 50%;
          transform-box: view-box;
        }

        .poster-orb-scene--animated .poster-orb-scene__orb {
          animation: poster-orb-scene-float 11s ease-in-out infinite;
        }

        .poster-orb-scene--animated .poster-orb-scene__orbit-ring {
          animation: poster-orb-scene-orbit 22s linear infinite;
        }

        .poster-orb-scene--animated .poster-orb-scene__orbit-ring--rear {
          animation-duration: 24s;
        }

        .poster-orb-scene--animated .poster-orb-scene__haze--top {
          animation: poster-orb-scene-haze 18s ease-in-out infinite alternate;
        }

        .poster-orb-scene--animated .poster-orb-scene__flare-node {
          animation: poster-orb-scene-node 3.2s ease-in-out infinite;
          transform-origin: ${nodePoint.x}px ${nodePoint.y}px;
        }

        .poster-orb-scene--animated .poster-orb-scene__flare-halo {
          animation: poster-orb-scene-halo 3.2s ease-in-out infinite;
          transform-origin: ${nodePoint.x}px ${nodePoint.y}px;
        }

        @keyframes poster-orb-scene-float {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }

          50% {
            transform: translateY(-12px) scale(1.012);
          }
        }

        @keyframes poster-orb-scene-orbit {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        @keyframes poster-orb-scene-haze {
          0% {
            opacity: 0.88;
            transform: translate3d(-8px, 6px, 0) scale(0.985);
          }

          100% {
            opacity: 1;
            transform: translate3d(12px, -10px, 0) scale(1.025);
          }
        }

        @keyframes poster-orb-scene-node {
          0%,
          100% {
            opacity: 0.92;
            transform: scale(0.96);
          }

          50% {
            opacity: 1;
            transform: scale(1.08);
          }
        }

        @keyframes poster-orb-scene-halo {
          0%,
          100% {
            opacity: 0.44;
            transform: scale(0.9);
          }

          50% {
            opacity: 0.92;
            transform: scale(1.12);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .poster-orb-scene--animated .poster-orb-scene__orb,
          .poster-orb-scene--animated .poster-orb-scene__orbit-ring,
          .poster-orb-scene--animated .poster-orb-scene__haze--top,
          .poster-orb-scene--animated .poster-orb-scene__flare-node,
          .poster-orb-scene--animated .poster-orb-scene__flare-halo {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
