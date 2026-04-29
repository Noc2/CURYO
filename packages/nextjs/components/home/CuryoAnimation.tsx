"use client";

import Image from "next/image";

export function CuryoAnimation() {
  return (
    <div className="mx-auto flex h-[280px] w-full items-center justify-center sm:h-[390px] lg:h-[430px] xl:h-[470px]">
      <Image
        src="/launch/curyo-human-loop-orange-orbits-neutral-ai.png"
        alt="Line illustration of a person working at a desktop computer beside an abstract AI loop mark"
        width={1672}
        height={941}
        priority
        className="h-auto w-full max-w-[44rem] object-contain lg:max-w-[46rem] xl:max-w-[50rem]"
        sizes="(min-width: 1280px) 50rem, (min-width: 1024px) 54vw, 100vw"
      />
    </div>
  );
}
