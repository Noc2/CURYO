"use client";

import { CuryoOrbitalMark } from "~~/components/brand/CuryoOrbitalMark";

export function CuryoAnimation() {
  const ambientStars = [
    { x: 10, y: 22, size: 8, delay: "0s", color: "rgba(255, 220, 231, 0.9)" },
    { x: 18, y: 74, size: 6, delay: "-1.7s", color: "rgba(255, 196, 61, 0.88)" },
    { x: 84, y: 18, size: 7, delay: "-2.4s", color: "rgba(122, 174, 255, 0.88)" },
    { x: 88, y: 64, size: 5, delay: "-3.6s", color: "rgba(3, 206, 164, 0.86)" },
  ];

  return (
    <div className="mx-auto flex h-[420px] w-full max-w-5xl items-center justify-center sm:h-[560px] lg:h-[620px]">
      <div className="relative flex h-[22rem] w-[22rem] items-center justify-center sm:h-[30rem] sm:w-[30rem] lg:h-[35rem] lg:w-[35rem]">
        <div className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle,_rgba(255,104,122,0.12),_rgba(255,196,61,0.08)_38%,_rgba(53,158,238,0.05)_58%,_transparent_76%)] blur-3xl" />
        <div className="curyo-animation__orbit-trace absolute inset-[11%] rounded-full border border-white/8" />
        <div className="curyo-animation__orbit-trace curyo-animation__orbit-trace--secondary absolute inset-[16%] rounded-full border border-white/6" />

        {ambientStars.map(star => (
          <span
            key={`${star.x}-${star.y}`}
            className="curyo-animation__star absolute rounded-full"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDelay: star.delay,
              background: star.color,
              color: star.color,
            }}
          />
        ))}

        <div className="curyo-animation__logo relative h-[17rem] w-[17rem] sm:h-[23rem] sm:w-[23rem] lg:h-[26rem] lg:w-[26rem]">
          <CuryoOrbitalMark className="h-full w-full" animated title="Animated Curyo logo" />
        </div>
      </div>

      <style jsx>{`
        .curyo-animation__logo {
          animation: hero-float 9s ease-in-out infinite;
          filter: drop-shadow(0 0 42px rgba(239, 71, 111, 0.12)) drop-shadow(0 0 58px rgba(53, 158, 238, 0.1));
        }

        .curyo-animation__orbit-trace {
          animation: orbit-spin 24s linear infinite;
          opacity: 0.72;
          transform: rotate(-18deg);
        }

        .curyo-animation__orbit-trace--secondary {
          animation-duration: 30s;
          opacity: 0.5;
          transform: rotate(16deg);
        }

        .curyo-animation__star {
          animation: star-pulse 5.2s ease-in-out infinite;
          box-shadow: 0 0 18px currentColor;
        }

        @keyframes hero-float {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-8px) rotate(-1.2deg);
          }
        }

        @keyframes orbit-spin {
          0%,
          100% {
            transform: rotate(-18deg) scale(0.98);
          }
          50% {
            transform: rotate(-10deg) scale(1.02);
          }
        }

        @keyframes star-pulse {
          0%,
          100% {
            opacity: 0.28;
            transform: scale(0.88);
          }
          50% {
            opacity: 0.98;
            transform: scale(1.18);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .curyo-animation__logo,
          .curyo-animation__star,
          .curyo-animation__orbit-trace {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
