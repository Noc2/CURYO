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
    <div className="mx-auto flex h-[500px] w-full items-center justify-center sm:h-[680px] lg:h-[840px] xl:h-[900px]">
      <div className="relative flex h-[33rem] w-[26rem] items-center justify-center sm:h-[41rem] sm:w-[33rem] lg:h-[54rem] lg:w-[46rem] xl:h-[58rem] xl:w-[50rem]">
        <div className="absolute inset-[4%] rounded-full bg-[radial-gradient(circle,_rgba(255,163,109,0.18),_rgba(255,112,89,0.12)_18%,_rgba(103,146,255,0.1)_42%,_rgba(8,13,29,0)_74%)] blur-3xl" />
        <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,_rgba(255,122,71,0.1),_rgba(11,19,34,0)_68%)] blur-[120px]" />

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

        <div className="curyo-animation__logo relative h-[21rem] w-[21rem] sm:h-[28rem] sm:w-[28rem] lg:h-[39rem] lg:w-[39rem] xl:h-[42rem] xl:w-[42rem]">
          <CuryoPlanetMark className="h-full w-full" title="Curyo logo" animationPreset="orbit" variant="hero" />
        </div>
      </div>

      <style jsx>{`
        .curyo-animation__logo {
          filter: drop-shadow(0 0 68px rgba(255, 140, 96, 0.2)) drop-shadow(0 0 84px rgba(64, 160, 241, 0.14));
        }

        .curyo-animation__star {
          box-shadow: 0 0 18px currentColor;
          opacity: 0.82;
        }
      `}</style>
    </div>
  );
}
