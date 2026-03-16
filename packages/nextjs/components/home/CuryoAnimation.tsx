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
    <div className="mx-auto flex h-[460px] w-full items-center justify-center sm:h-[620px] lg:h-[760px] xl:h-[820px]">
      <div className="relative flex h-[30rem] w-[24rem] items-center justify-center sm:h-[38rem] sm:w-[30rem] lg:h-[48rem] lg:w-[40rem] xl:h-[52rem] xl:w-[44rem]">
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

        <div className="curyo-animation__logo relative h-[19rem] w-[19rem] sm:h-[25rem] sm:w-[25rem] lg:h-[34rem] lg:w-[34rem] xl:h-[37rem] xl:w-[37rem]">
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
