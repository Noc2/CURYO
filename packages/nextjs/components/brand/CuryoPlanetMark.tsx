import { useId } from "react";

interface CuryoPlanetMarkProps {
  className?: string;
  title?: string;
  animated?: boolean;
}

export function CuryoPlanetMark({ className = "h-8 w-8", title, animated = false }: CuryoPlanetMarkProps) {
  const id = useId().replace(/:/g, "");
  const mainFillId = `${id}-main-fill`;
  const mainGlowId = `${id}-main-glow`;
  const orbitId = `${id}-orbit`;
  const orbitBlurId = `${id}-orbit-blur`;
  const topFillId = `${id}-sat-top-fill`;
  const topGlowId = `${id}-sat-top-glow`;
  const leftFillId = `${id}-sat-left-fill`;
  const leftGlowId = `${id}-sat-left-glow`;
  const rightFillId = `${id}-sat-right-fill`;
  const rightGlowId = `${id}-sat-right-glow`;

  return (
    <>
      <svg
        className={`${className} ${animated ? "curyo-planet-mark--animated" : ""}`}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
      >
        {title ? <title>{title}</title> : null}

        <defs>
          <linearGradient id={mainFillId} x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(28 0.5 0.5)">
            <stop offset="0%" stopColor="#FFC43D" />
            <stop offset="34%" stopColor="#EF476F" />
            <stop offset="68%" stopColor="#359EEE" />
            <stop offset="100%" stopColor="#03CEA4" />
          </linearGradient>
          <radialGradient id={mainGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFE08E" stopOpacity="0.54" />
            <stop offset="58%" stopColor="#5BD7B8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#5BD7B8" stopOpacity="0" />
          </radialGradient>

          <linearGradient id={orbitId} x1="110" y1="150" x2="394" y2="366" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#03CEA4" stopOpacity="0.18" />
            <stop offset="32%" stopColor="#FFC43D" stopOpacity="0.16" />
            <stop offset="64%" stopColor="#EF476F" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#359EEE" stopOpacity="0.18" />
          </linearGradient>
          <filter id={orbitBlurId} x="70" y="70" width="372" height="372">
            <feGaussianBlur stdDeviation="4.5" />
          </filter>

          <linearGradient id={topFillId} x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(22 0.5 0.5)">
            <stop offset="0%" stopColor="#A8FFF2" />
            <stop offset="58%" stopColor="#20DFC1" />
            <stop offset="100%" stopColor="#14A79B" />
          </linearGradient>
          <radialGradient id={topGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#A8FFF2" stopOpacity="0.46" />
            <stop offset="58%" stopColor="#20DFC1" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#20DFC1" stopOpacity="0" />
          </radialGradient>

          <linearGradient id={leftFillId} x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(22 0.5 0.5)">
            <stop offset="0%" stopColor="#FFD2E3" />
            <stop offset="58%" stopColor="#FF8AB0" />
            <stop offset="100%" stopColor="#E45787" />
          </linearGradient>
          <radialGradient id={leftGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFD2E3" stopOpacity="0.42" />
            <stop offset="58%" stopColor="#FF8AB0" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#FF8AB0" stopOpacity="0" />
          </radialGradient>

          <linearGradient id={rightFillId} x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(22 0.5 0.5)">
            <stop offset="0%" stopColor="#C7FFAF" />
            <stop offset="58%" stopColor="#7BE96D" />
            <stop offset="100%" stopColor="#4BCF62" />
          </linearGradient>
          <radialGradient id={rightGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#C7FFAF" stopOpacity="0.42" />
            <stop offset="58%" stopColor="#7BE96D" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#7BE96D" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className={animated ? "curyo-planet-mark__orbit" : undefined}>
          <circle
            cx="256"
            cy="258"
            r="123"
            fill="none"
            stroke={`url(#${orbitId})`}
            strokeWidth="10"
            strokeOpacity="0.1"
            filter={`url(#${orbitBlurId})`}
          />
          <circle
            cx="256"
            cy="258"
            r="123"
            fill="none"
            stroke={`url(#${orbitId})`}
            strokeWidth="4"
            strokeOpacity="0.24"
          />
        </g>

        <g className={animated ? "curyo-planet-mark__planet" : undefined}>
          <circle cx="256" cy="258" r="205" fill={`url(#${mainGlowId})`} fillOpacity="0.46" />
          <circle
            className={animated ? "curyo-planet-mark__planet-body" : undefined}
            cx="256"
            cy="258"
            r="82"
            fill={`url(#${mainFillId})`}
          />
          <circle
            className={animated ? "curyo-planet-mark__planet-highlight" : undefined}
            cx="241.24"
            cy="238.32"
            r="27.88"
            fill="#FFFFFF"
            fillOpacity="0.18"
          />
        </g>

        <g className={animated ? "curyo-planet-mark__satellite curyo-planet-mark__satellite--top" : undefined}>
          <circle cx="344" cy="94" r="44" fill={`url(#${topGlowId})`} fillOpacity="0.4" />
          <circle cx="344" cy="94" r="24" fill={`url(#${topFillId})`} />
          <circle cx="339.68" cy="88.24" r="8.16" fill="#FFFFFF" fillOpacity="0.18" />
        </g>

        <g className={animated ? "curyo-planet-mark__satellite curyo-planet-mark__satellite--left" : undefined}>
          <circle cx="118" cy="420" r="38" fill={`url(#${leftGlowId})`} fillOpacity="0.36" />
          <circle cx="118" cy="420" r="21" fill={`url(#${leftFillId})`} />
          <circle cx="114.22" cy="414.96" r="7.14" fill="#FFFFFF" fillOpacity="0.18" />
        </g>

        <g className={animated ? "curyo-planet-mark__satellite curyo-planet-mark__satellite--right" : undefined}>
          <circle cx="404" cy="412" r="44" fill={`url(#${rightGlowId})`} fillOpacity="0.36" />
          <circle cx="404" cy="412" r="24" fill={`url(#${rightFillId})`} />
          <circle cx="399.68" cy="406.24" r="8.16" fill="#FFFFFF" fillOpacity="0.18" />
        </g>
      </svg>

      <style jsx>{`
        .curyo-planet-mark--animated .curyo-planet-mark__orbit {
          animation: orbit-spin 22s linear infinite;
          transform-origin: 256px 258px;
        }

        .curyo-planet-mark--animated .curyo-planet-mark__planet {
          animation: planet-float 7.5s ease-in-out infinite;
          transform-origin: 256px 258px;
        }

        .curyo-planet-mark--animated .curyo-planet-mark__planet-body {
          animation: planet-breathe 6.5s ease-in-out infinite;
          transform-origin: 256px 258px;
        }

        .curyo-planet-mark--animated .curyo-planet-mark__planet-highlight {
          animation: planet-glint 5.2s ease-in-out infinite;
          transform-origin: 256px 258px;
        }

        .curyo-planet-mark--animated .curyo-planet-mark__satellite--top {
          animation: satellite-top 8s ease-in-out infinite;
          transform-origin: 344px 94px;
        }

        .curyo-planet-mark--animated .curyo-planet-mark__satellite--left {
          animation: satellite-left 9.5s ease-in-out infinite;
          transform-origin: 118px 420px;
        }

        .curyo-planet-mark--animated .curyo-planet-mark__satellite--right {
          animation: satellite-right 8.8s ease-in-out infinite;
          transform-origin: 404px 412px;
        }

        @keyframes orbit-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes planet-float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        @keyframes planet-breathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.022);
          }
        }

        @keyframes planet-glint {
          0%,
          100% {
            transform: translate(-1px, 0px);
            opacity: 0.72;
          }
          50% {
            transform: translate(6px, -4px);
            opacity: 1;
          }
        }

        @keyframes satellite-top {
          0%,
          100% {
            transform: translate(0px, 0px) scale(1);
          }
          50% {
            transform: translate(4px, -8px) scale(1.04);
          }
        }

        @keyframes satellite-left {
          0%,
          100% {
            transform: translate(0px, 0px) scale(1);
          }
          50% {
            transform: translate(-6px, 4px) scale(1.03);
          }
        }

        @keyframes satellite-right {
          0%,
          100% {
            transform: translate(0px, 0px) scale(1);
          }
          50% {
            transform: translate(7px, 3px) scale(1.035);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .curyo-planet-mark--animated .curyo-planet-mark__orbit,
          .curyo-planet-mark--animated .curyo-planet-mark__planet,
          .curyo-planet-mark--animated .curyo-planet-mark__planet-body,
          .curyo-planet-mark--animated .curyo-planet-mark__planet-highlight,
          .curyo-planet-mark--animated .curyo-planet-mark__satellite--top,
          .curyo-planet-mark--animated .curyo-planet-mark__satellite--left,
          .curyo-planet-mark--animated .curyo-planet-mark__satellite--right {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
