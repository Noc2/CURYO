"use client";

import Image from "next/image";

interface PosterOrbSceneProps {
  className?: string;
  title?: string;
  animated?: boolean;
}

export function PosterOrbScene({
  className = "h-full w-full",
  title = "Poster-inspired Curyo orb",
  animated = true,
}: PosterOrbSceneProps) {
  const wrapperClassName = [className, "poster-orb-scene", animated ? "poster-orb-scene--animated" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClassName} role={title ? "img" : undefined} aria-label={title || undefined}>
      <div className="poster-orb-scene__canvas" aria-hidden="true">
        <div className="poster-orb-scene__nebula poster-orb-scene__nebula--left" />
        <div className="poster-orb-scene__nebula poster-orb-scene__nebula--right" />
        <div className="poster-orb-scene__nebula poster-orb-scene__nebula--bottom" />

        <div className="poster-orb-scene__image-shell">
          <Image
            src="/launch/curyo-v2-orb-hero-alpha.webp"
            alt=""
            fill
            priority
            unoptimized
            sizes="(min-width: 1280px) 36rem, (min-width: 1024px) 31rem, (min-width: 640px) 27rem, 21rem"
            className="poster-orb-scene__image"
          />
          <div className="poster-orb-scene__core-glow" />
          <div className="poster-orb-scene__sheen" />
          <div className="poster-orb-scene__grain" />
        </div>
      </div>

      <style jsx>{`
        .poster-orb-scene {
          --poster-orb-scene-y: 14%;

          position: relative;
          display: block;
          height: 100%;
          width: 100%;
          isolation: isolate;
          overflow: visible;
        }

        .poster-orb-scene__canvas {
          position: absolute;
          inset: -9% -10% -8%;
          overflow: visible;
        }

        .poster-orb-scene__image-shell {
          position: absolute;
          inset: 0;
          transform: translateY(var(--poster-orb-scene-y));
          transform-origin: 50% 52%;
          mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 0 84%, rgba(0, 0, 0, 0.9) 90%, transparent 100%);
          -webkit-mask-image: linear-gradient(
            to right,
            rgba(0, 0, 0, 1) 0 84%,
            rgba(0, 0, 0, 0.9) 90%,
            transparent 100%
          );
        }

        .poster-orb-scene__image {
          object-fit: contain;
          object-position: center;
          filter: saturate(1.035) contrast(1.02) brightness(0.99);
        }

        .poster-orb-scene__nebula,
        .poster-orb-scene__core-glow,
        .poster-orb-scene__sheen,
        .poster-orb-scene__grain {
          position: absolute;
          pointer-events: none;
        }

        .poster-orb-scene__nebula {
          mix-blend-mode: screen;
          filter: blur(40px);
          opacity: 0.56;
        }

        .poster-orb-scene__nebula--left {
          left: 7%;
          top: 48%;
          height: 18%;
          width: 23%;
          border-radius: 9999px;
          background: radial-gradient(
            circle at 48% 52%,
            rgba(194, 125, 154, 0.72),
            rgba(105, 59, 88, 0.34) 46%,
            transparent 82%
          );
        }

        .poster-orb-scene__nebula--right {
          right: 8%;
          top: 22%;
          height: 32%;
          width: 24%;
          border-radius: 9999px;
          background: radial-gradient(
            circle at 44% 56%,
            rgba(255, 189, 116, 0.56),
            rgba(180, 96, 52, 0.28) 42%,
            transparent 78%
          );
          filter: blur(48px);
        }

        .poster-orb-scene__nebula--bottom {
          inset: 68% 14% 7% 18%;
          border-radius: 9999px;
          background: radial-gradient(
            circle at 50% 32%,
            rgba(255, 150, 84, 0.3),
            rgba(112, 47, 36, 0.16) 46%,
            transparent 78%
          );
          filter: blur(58px);
          opacity: 0.46;
        }

        .poster-orb-scene__core-glow {
          inset: 20% 24% 21% 20%;
          border-radius: 9999px;
          background: radial-gradient(
            circle at 53% 42%,
            rgba(255, 248, 236, 0.42),
            rgba(255, 174, 101, 0.18) 24%,
            rgba(255, 122, 70, 0.08) 50%,
            transparent 72%
          );
          filter: blur(34px);
          mix-blend-mode: screen;
          opacity: 0.48;
        }

        .poster-orb-scene__sheen {
          left: 36%;
          top: 15%;
          height: 54%;
          width: 26%;
          border-radius: 9999px;
          background: linear-gradient(
            114deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 248, 237, 0.22) 30%,
            rgba(255, 227, 191, 0.3) 44%,
            rgba(255, 255, 255, 0) 74%
          );
          filter: blur(26px);
          mix-blend-mode: screen;
          opacity: 0.54;
          transform: rotate(-9deg);
        }

        .poster-orb-scene__grain {
          inset: 10%;
          border-radius: 9999px;
          background-image: radial-gradient(rgba(255, 255, 255, 0.12) 0.7px, transparent 0.7px);
          background-size: 14px 14px;
          mix-blend-mode: overlay;
          opacity: 0.12;
          mask-image: radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.86) 0 54%, transparent 84%);
          -webkit-mask-image: radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.86) 0 54%, transparent 84%);
        }

        .poster-orb-scene--animated .poster-orb-scene__image-shell,
        .poster-orb-scene--animated .poster-orb-scene__nebula,
        .poster-orb-scene--animated .poster-orb-scene__core-glow,
        .poster-orb-scene--animated .poster-orb-scene__sheen {
          will-change: transform, opacity;
        }

        .poster-orb-scene--animated .poster-orb-scene__image-shell {
          animation: poster-orb-scene-float 14s ease-in-out infinite;
        }

        .poster-orb-scene--animated .poster-orb-scene__nebula--left {
          animation: poster-orb-scene-nebula-left 20s ease-in-out infinite alternate;
        }

        .poster-orb-scene--animated .poster-orb-scene__nebula--right {
          animation: poster-orb-scene-nebula-right 18s ease-in-out infinite alternate;
        }

        .poster-orb-scene--animated .poster-orb-scene__nebula--bottom {
          animation: poster-orb-scene-nebula-bottom 22s ease-in-out infinite alternate;
        }

        .poster-orb-scene--animated .poster-orb-scene__core-glow {
          animation: poster-orb-scene-core-glow 8.4s ease-in-out infinite;
        }

        .poster-orb-scene--animated .poster-orb-scene__sheen {
          animation: poster-orb-scene-sheen 12s ease-in-out infinite;
        }

        @keyframes poster-orb-scene-float {
          0%,
          100% {
            transform: translateY(var(--poster-orb-scene-y)) scale(1.01);
          }

          50% {
            transform: translateY(calc(var(--poster-orb-scene-y) - 12px)) scale(1.03);
          }
        }

        @keyframes poster-orb-scene-nebula-left {
          0% {
            opacity: 0.42;
            transform: translate3d(-6px, 4px, 0) scale(0.96);
          }

          100% {
            opacity: 0.62;
            transform: translate3d(8px, -10px, 0) scale(1.08);
          }
        }

        @keyframes poster-orb-scene-nebula-right {
          0% {
            opacity: 0.48;
            transform: translate3d(6px, -4px, 0) scale(0.97);
          }

          100% {
            opacity: 0.68;
            transform: translate3d(-8px, 10px, 0) scale(1.08);
          }
        }

        @keyframes poster-orb-scene-nebula-bottom {
          0% {
            opacity: 0.28;
            transform: translateY(4px) scale(0.98);
          }

          100% {
            opacity: 0.52;
            transform: translateY(-8px) scale(1.06);
          }
        }

        @keyframes poster-orb-scene-core-glow {
          0%,
          100% {
            opacity: 0.48;
            transform: scale(0.98);
          }

          50% {
            opacity: 0.72;
            transform: scale(1.04);
          }
        }

        @keyframes poster-orb-scene-sheen {
          0%,
          100% {
            opacity: 0.28;
            transform: translate3d(-14px, 0, 0) rotate(-11deg) scaleY(0.98);
          }

          50% {
            opacity: 0.6;
            transform: translate3d(22px, -6px, 0) rotate(-8deg) scaleY(1.04);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .poster-orb-scene--animated .poster-orb-scene__image-shell,
          .poster-orb-scene--animated .poster-orb-scene__nebula,
          .poster-orb-scene--animated .poster-orb-scene__core-glow,
          .poster-orb-scene--animated .poster-orb-scene__sheen {
            animation: none;
          }
        }

        @media (max-width: 639px) {
          .poster-orb-scene__canvas {
            inset: -2% -12% -10%;
          }
        }
      `}</style>
    </div>
  );
}
