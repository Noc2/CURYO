"use client";

import { CuryoRingMark } from "~~/components/brand/CuryoRingMark";

export function CuryoAnimation() {
  return (
    <div className="mx-auto flex h-[420px] w-full max-w-5xl items-center justify-center sm:h-[560px] lg:h-[620px]">
      <div className="relative flex h-[20rem] w-[20rem] items-center justify-center sm:h-[28rem] sm:w-[28rem] lg:h-[34rem] lg:w-[34rem]">
        <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle,_rgba(53,158,238,0.10),_rgba(3,206,164,0.06)_38%,_rgba(239,71,111,0.03)_62%,_transparent_76%)]" />
        <CuryoRingMark className="relative h-full w-full" animateColors colorDurationSeconds={20} animateMask={false} />
      </div>
    </div>
  );
}
