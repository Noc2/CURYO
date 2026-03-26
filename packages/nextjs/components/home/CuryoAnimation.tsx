"use client";

import { CuryoBrandMark } from "~~/components/brand/CuryoBrandMark";

export function CuryoAnimation() {
  const ambientStars = [
    { x: 14, y: 22, size: 6, color: "rgba(245, 240, 235, 0.76)" },
    { x: 22, y: 72, size: 4, color: "rgba(242, 100, 38, 0.62)" },
    { x: 78, y: 18, size: 5, color: "rgba(126, 137, 150, 0.7)" },
    { x: 84, y: 70, size: 4, color: "rgba(179, 52, 27, 0.56)" },
  ];

  return (
    <div className="mx-auto flex h-[360px] w-full items-center justify-center sm:h-[500px] lg:h-[560px] xl:h-[620px]">
      <div className="relative flex h-[24rem] w-[20rem] items-center justify-center sm:h-[32rem] sm:w-[28rem] lg:h-[34rem] lg:w-[30rem] xl:h-[38rem] xl:w-[34rem]">
        <div className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle,_rgba(242,100,38,0.12),_rgba(179,52,27,0.08)_24%,_rgba(126,137,150,0.05)_50%,_rgba(9,10,12,0)_74%)] blur-3xl" />
        <div className="absolute inset-[16%] rounded-full bg-[radial-gradient(circle,_rgba(245,240,235,0.06),_rgba(9,10,12,0)_70%)] blur-[96px]" />

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

        <div className="curyo-animation__logo relative h-[16rem] w-[16rem] sm:h-[23rem] sm:w-[23rem] lg:h-[26rem] lg:w-[26rem] xl:h-[29rem] xl:w-[29rem]">
          <CuryoBrandMark className="h-full w-full" title="Curyo logo" animated variant="hero" />
        </div>
      </div>

      <style jsx>{`
        .curyo-animation__logo {
          filter: drop-shadow(0 0 44px rgba(242, 100, 38, 0.16)) drop-shadow(0 0 56px rgba(126, 137, 150, 0.08));
        }

        .curyo-animation__star {
          box-shadow: 0 0 12px currentColor;
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
}
