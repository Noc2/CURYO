"use client";

import { PosterOrbScene } from "~~/components/home/PosterOrbScene";

export function CuryoAnimation() {
  return (
    <div className="mx-auto flex h-[396px] w-full items-end justify-center sm:h-[520px] sm:items-center lg:h-[588px] xl:h-[632px]">
      <div className="relative flex h-[24rem] w-[20rem] items-center justify-center overflow-visible sm:h-[32.5rem] sm:w-[28rem] lg:h-[35.5rem] lg:w-[31.5rem] xl:h-[38.5rem] xl:w-[34.5rem]">
        <div className="relative h-[18rem] w-[18rem] translate-y-[2.4rem] sm:h-[25rem] sm:w-[25rem] sm:translate-y-[3rem] lg:h-[29rem] lg:w-[29rem] lg:translate-y-[2rem] xl:h-[31rem] xl:w-[31rem] xl:translate-y-[2.25rem]">
          <PosterOrbScene className="h-full w-full" animated={false} />
        </div>
      </div>
    </div>
  );
}
