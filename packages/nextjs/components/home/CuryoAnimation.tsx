"use client";

import { CuryoPlanetMark } from "~~/components/brand/CuryoPlanetMark";

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
        <div className="absolute inset-[7%] rounded-full bg-[radial-gradient(circle,_rgba(250,160,112,0.14),_rgba(104,142,255,0.08)_44%,_rgba(8,13,29,0)_72%)] blur-3xl" />

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

        <div className="curyo-animation__logo relative h-[15rem] w-[15rem] sm:h-[20rem] sm:w-[20rem] lg:h-[23rem] lg:w-[23rem]">
          <CuryoPlanetMark className="h-full w-full" title="Curyo logo" animationPreset="orbit" />
        </div>
      </div>

      <style jsx>{`
        .curyo-animation__logo {
          filter: drop-shadow(0 0 54px rgba(255, 140, 96, 0.16)) drop-shadow(0 0 64px rgba(64, 160, 241, 0.12));
        }

        .curyo-animation__star {
          box-shadow: 0 0 18px currentColor;
          opacity: 0.82;
        }
      `}</style>
    </div>
  );
}
