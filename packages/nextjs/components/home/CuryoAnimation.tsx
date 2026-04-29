"use client";

import Image from "next/image";

export function CuryoAnimation() {
  return (
    <div className="mx-auto flex h-[244px] w-full items-center justify-center sm:h-[340px] lg:h-[360px] xl:h-[392px]">
      <Image
        src="/launch/curyo-human-loop-orange-orbits-neutral-ai.png"
        alt="Line illustration of a person working at a desktop computer beside an abstract AI loop mark"
        width={1672}
        height={941}
        priority
        className="h-auto w-full max-w-[38rem] object-contain lg:max-w-none"
        sizes="(min-width: 1280px) 32rem, (min-width: 1024px) 42vw, 100vw"
      />
    </div>
  );
}
