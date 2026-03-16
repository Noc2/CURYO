"use client";

import { CuryoPlanetMark } from "~~/components/brand/CuryoPlanetMark";

export function CuryoAnimation() {
  const ambientStars = [
    { x: 12, y: 20, size: 8, color: "rgba(245, 240, 235, 0.88)" },
    { x: 18, y: 74, size: 6, color: "rgba(242, 100, 38, 0.82)" },
    { x: 80, y: 16, size: 7, color: "rgba(126, 137, 150, 0.84)" },
    { x: 87, y: 72, size: 5, color: "rgba(179, 52, 27, 0.76)" },
    { x: 27, y: 11, size: 4, color: "rgba(245, 240, 235, 0.74)" },
    { x: 74, y: 86, size: 4, color: "rgba(126, 137, 150, 0.68)" },
  ];

  return (
    <div className="mx-auto flex h-[500px] w-full items-center justify-center sm:h-[680px] lg:h-[840px] xl:h-[900px]">
      <div className="relative flex h-[33rem] w-[26rem] items-center justify-center sm:h-[41rem] sm:w-[33rem] lg:h-[54rem] lg:w-[46rem] xl:h-[58rem] xl:w-[50rem]">
        <div className="absolute inset-[4%] rounded-full bg-[radial-gradient(circle,_rgba(242,100,38,0.18),_rgba(179,52,27,0.12)_22%,_rgba(126,137,150,0.08)_46%,_rgba(9,10,12,0)_74%)] blur-3xl" />
        <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,_rgba(245,240,235,0.08),_rgba(9,10,12,0)_68%)] blur-[120px]" />

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
          <CuryoPlanetMark className="h-full w-full" title="Curyo logo" animationPreset="orbit" />
        </div>
      </div>

      <style jsx>{`
        .curyo-animation__logo {
          filter: drop-shadow(0 0 68px rgba(242, 100, 38, 0.22)) drop-shadow(0 0 84px rgba(126, 137, 150, 0.12));
        }

        .curyo-animation__star {
          box-shadow: 0 0 18px currentColor;
          opacity: 0.82;
        }
      `}</style>
    </div>
  );
}
