"use client";

import { PosterOrbScene } from "~~/components/home/PosterOrbScene";

export function CuryoAnimation() {
  return (
    <div className="mx-auto flex h-[396px] w-full items-end justify-center sm:h-[520px] sm:items-center lg:h-[588px] xl:h-[632px]">
      <div className="relative flex h-[24rem] w-[20rem] items-center justify-center overflow-visible sm:h-[32.5rem] sm:w-[28rem] lg:h-[35.5rem] lg:w-[31.5rem] xl:h-[38.5rem] xl:w-[34.5rem]">
        <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle,_rgba(255,182,115,0.22),_rgba(242,100,38,0.12)_20%,_rgba(88,40,50,0.14)_42%,_rgba(9,10,12,0)_76%)] blur-[92px]" />
        <div className="absolute inset-x-[14%] bottom-[5%] h-[34%] rounded-full bg-[radial-gradient(circle,_rgba(255,155,91,0.18),_rgba(116,49,36,0.12)_36%,_rgba(9,10,12,0)_74%)] blur-[82px]" />
        <div className="absolute inset-x-[22%] top-[5%] h-[24%] rounded-full bg-[radial-gradient(circle,_rgba(255,247,233,0.09),_rgba(9,10,12,0)_72%)] blur-[74px]" />

        <div className="curyo-animation__logo relative h-[18rem] w-[18rem] translate-y-[1.5rem] sm:h-[25rem] sm:w-[25rem] sm:translate-y-[2.5rem] lg:h-[29rem] lg:w-[29rem] lg:translate-y-[3.25rem] xl:h-[31rem] xl:w-[31rem] xl:translate-y-[3.5rem]">
          <PosterOrbScene className="h-full w-full" animated={false} />
        </div>
      </div>

      <style jsx>{`
        .curyo-animation__logo {
          filter: drop-shadow(0 0 58px rgba(242, 100, 38, 0.34)) drop-shadow(0 0 88px rgba(110, 57, 84, 0.18));
        }
      `}</style>
    </div>
  );
}
