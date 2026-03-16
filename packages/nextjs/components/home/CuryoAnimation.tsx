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
    <div className="mx-auto flex h-[540px] w-full items-center justify-center sm:h-[740px] lg:h-[920px] xl:h-[980px]">
      <div className="relative flex h-[36rem] w-[29rem] items-center justify-center sm:h-[46rem] sm:w-[37rem] lg:h-[60rem] lg:w-[52rem] xl:h-[66rem] xl:w-[58rem]">
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

        <div className="curyo-animation__logo relative h-[24rem] w-[24rem] sm:h-[32rem] sm:w-[32rem] lg:h-[44rem] lg:w-[44rem] xl:h-[48rem] xl:w-[48rem]">
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
