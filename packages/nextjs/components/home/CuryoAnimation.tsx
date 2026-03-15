"use client";

import { CuryoLighthouseMark } from "~~/components/brand/CuryoLighthouseMark";

export function CuryoAnimation() {
  const ambientStars = [
    { x: 12, y: 20, size: 8, color: "rgba(255, 220, 231, 0.9)" },
    { x: 18, y: 74, size: 6, color: "rgba(255, 196, 61, 0.84)" },
    { x: 80, y: 16, size: 7, color: "rgba(122, 174, 255, 0.86)" },
    { x: 87, y: 72, size: 5, color: "rgba(3, 206, 164, 0.82)" },
    { x: 27, y: 11, size: 4, color: "rgba(255, 255, 255, 0.78)" },
    { x: 74, y: 86, size: 4, color: "rgba(255, 255, 255, 0.7)" },
  ];

  return (
    <div className="mx-auto flex h-[420px] w-full max-w-5xl items-center justify-center sm:h-[560px] lg:h-[620px]">
      <div className="relative flex h-[24rem] w-[22rem] items-center justify-center sm:h-[31rem] sm:w-[26rem] lg:h-[36rem] lg:w-[30rem]">
        <div className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle,_rgba(94,97,130,0.16),_rgba(8,13,29,0)_68%)] blur-3xl" />

        {ambientStars.map(star => (
          <span
            key={`${star.x}-${star.y}`}
            className="curyo-animation__star absolute rounded-full"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              background: star.color,
              color: star.color,
            }}
          />
        ))}

        <div className="curyo-animation__logo relative h-[14rem] w-[14rem] sm:h-[18rem] sm:w-[18rem] lg:h-[20rem] lg:w-[20rem]">
          <CuryoLighthouseMark className="h-full w-full" title="Curyo logo" />
        </div>
      </div>

      <style jsx>{`
        .curyo-animation__logo {
          filter: drop-shadow(0 0 42px rgba(239, 71, 111, 0.12)) drop-shadow(0 0 58px rgba(53, 158, 238, 0.1));
        }

        .curyo-animation__star {
          box-shadow: 0 0 18px currentColor;
          opacity: 0.82;
        }
      `}</style>
    </div>
  );
}
