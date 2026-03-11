"use client";

import dynamic from "next/dynamic";

const CuryoAnimation = dynamic(() => import("~~/components/home/CuryoAnimation").then(m => m.CuryoAnimation), {
  ssr: false,
  loading: () => <div className="w-full max-w-5xl mx-auto h-[600px] sm:h-[780px]" />,
});

export function LandingPageAnimation() {
  return <CuryoAnimation />;
}
