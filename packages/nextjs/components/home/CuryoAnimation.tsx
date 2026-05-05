import Image from "next/image";

export function CuryoAnimation() {
  return (
    <div className="mx-auto flex h-[280px] w-full items-center justify-center sm:h-[390px] lg:h-[500px] xl:h-[560px]">
      <Image
        src="/launch/curyo-human-loop-orange-orbits-neutral-ai.webp"
        alt="Line illustration of a person working at a desktop computer beside an abstract AI loop mark"
        width={1672}
        height={941}
        priority
        className="h-auto w-full max-w-[44rem] object-contain lg:max-w-[54rem] xl:max-w-[62rem]"
        sizes="(min-width: 1280px) 62rem, (min-width: 1024px) 54rem, 100vw"
      />
    </div>
  );
}
