"use client";

import { CuryoPlanetMark } from "~~/components/brand/CuryoPlanetMark";

export function CuryoAnimation() {
  const ambientStars = [
    { x: 8, y: 20, size: 8, delay: "0s", color: "rgba(168, 255, 242, 0.9)" },
    { x: 14, y: 74, size: 6, delay: "-2.1s", color: "rgba(255, 210, 227, 0.88)" },
    { x: 82, y: 16, size: 7, delay: "-1.4s", color: "rgba(199, 255, 175, 0.88)" },
    { x: 88, y: 68, size: 5, delay: "-3.2s", color: "rgba(255, 196, 61, 0.84)" },
    { x: 54, y: 10, size: 4, delay: "-0.8s", color: "rgba(122, 174, 255, 0.9)" },
    { x: 78, y: 46, size: 5, delay: "-2.6s", color: "rgba(255, 255, 255, 0.82)" },
  ];
  const connections = [
    { from: 0, to: 4, delay: "-0.6s" },
    { from: 4, to: 2, delay: "-1.7s" },
    { from: 1, to: 5, delay: "-2.3s" },
    { from: 5, to: 3, delay: "-3.1s" },
  ];

  return (
    <div className="mx-auto flex h-[420px] w-full max-w-5xl items-center justify-center sm:h-[560px] lg:h-[620px]">
      <div className="relative flex h-[22rem] w-[22rem] items-center justify-center sm:h-[30rem] sm:w-[30rem] lg:h-[35rem] lg:w-[35rem]">
        <div className="absolute inset-[4%] rounded-full bg-[radial-gradient(circle,_rgba(255,196,61,0.08),_rgba(3,206,164,0.07)_34%,_rgba(53,158,238,0.04)_58%,_transparent_76%)] blur-3xl" />

        <svg className="curyo-animation__links absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          {connections.map((connection, index) => {
            const from = ambientStars[connection.from];
            const to = ambientStars[connection.to];

            return (
              <line
                key={`${connection.from}-${connection.to}`}
                className="curyo-animation__link"
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                style={{ animationDelay: connection.delay, opacity: index % 2 === 0 ? 0.34 : 0.22 }}
              />
            );
          })}
        </svg>

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

        <div className="curyo-animation__logo relative h-[18rem] w-[18rem] sm:h-[24rem] sm:w-[24rem] lg:h-[28rem] lg:w-[28rem]">
          <CuryoPlanetMark className="h-full w-full" animated title="Animated Curyo logo" />
        </div>
      </div>

      <style jsx>{`
        .curyo-animation__logo {
          animation: hero-float 9s ease-in-out infinite;
          filter: drop-shadow(0 0 36px rgba(3, 206, 164, 0.12)) drop-shadow(0 0 52px rgba(53, 158, 238, 0.1));
        }

        .curyo-animation__star {
          animation: star-pulse 4.8s ease-in-out infinite;
          box-shadow: 0 0 18px currentColor;
        }

        .curyo-animation__link {
          animation: link-breathe 6.4s ease-in-out infinite;
          stroke: rgba(106, 146, 210, 0.38);
          stroke-dasharray: 2.4 4;
          stroke-linecap: round;
          stroke-width: 0.22;
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

        @keyframes star-pulse {
          0%,
          100% {
            opacity: 0.35;
            transform: scale(0.9);
          }
          50% {
            opacity: 0.95;
            transform: scale(1.18);
          }
        }

        @keyframes link-breathe {
          0%,
          100% {
            opacity: 0.12;
            stroke-dashoffset: 0;
          }
          50% {
            opacity: 0.68;
            stroke-dashoffset: -8;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .curyo-animation__logo,
          .curyo-animation__star,
          .curyo-animation__link {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
