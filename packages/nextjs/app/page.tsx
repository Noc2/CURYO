"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { useAccount } from "wagmi";
import { GlobeAltIcon, IdentificationIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

gsap.registerPlugin(CustomEase, MotionPathPlugin);

const STEPS = [
  {
    icon: IdentificationIcon,
    title: "Reputation",
    description: "A privacy-preserving proof of personhood lets you claim cREP tokens and build reputation.",
    color: "#FFC43D",
  },
  {
    icon: GlobeAltIcon,
    title: "The Future of Rating",
    description: "Use your reputation to vote on content, stake on your judgment, and grow your influence.",
    color: "#359EEE",
  },
  {
    icon: PlusCircleIcon,
    title: "Decentralized Community",
    description: "Join a community that lets anyone contribute and is fully decentralized from day one.",
    color: "#03CEA4",
  },
];

const CuryoAnimation = () => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const ellipses = svg.querySelectorAll<SVGEllipseElement>(".ell");
    const easeIn = CustomEase.create("curyoIn", "M0,0 C0.594,0.062 0.79,0.698 1,1");
    const easeA = CustomEase.create("curyoA", "M0,0 C0.2,0 0.432,0.147 0.507,0.374 0.59,0.629 0.822,1 1,1");
    const easeB = CustomEase.create("curyoB", "M0,0 C0.266,0.412 0.297,0.582 0.453,0.775 0.53,0.87 0.78,1 1,1");
    const colorInterp = gsap.utils.interpolate(["#359EEE", "#FFC43D", "#EF476F", "#03CEA4"]);

    gsap.set(svg, { visibility: "visible" });

    const timelines: gsap.core.Timeline[] = [];

    const animateEllipse = (el: SVGEllipseElement, index: number) => {
      const tl = gsap.timeline({ defaults: { ease: easeA }, repeat: -1 });
      gsap.set(el, {
        opacity: 1 - index / ellipses.length,
        stroke: colorInterp(index / ellipses.length),
      });
      tl.to(el, {
        attr: { ry: `-=${index * 2.3}`, rx: `+=${index * 1.4}` },
        ease: easeIn,
      })
        .to(el, {
          attr: { ry: `+=${index * 2.3}`, rx: `-=${index * 1.4}` },
          ease: easeB,
        })
        .to(el, { duration: 1, rotation: -180, transformOrigin: "50% 50%" }, 0);
      tl.timeScale(0.5);
      timelines.push(tl);
    };

    ellipses.forEach((el, i) => {
      gsap.delayedCall(i / (ellipses.length - 1), animateEllipse, [el, i + 1]);
    });

    const gradTl = gsap.to("#aiGrad", {
      duration: 4,
      delay: 0.75,
      attr: { x1: "-=300", x2: "-=300" },
      scale: 1.2,
      transformOrigin: "50% 50%",
      repeat: -1,
      ease: "none",
    });

    const iconTl = gsap.to("#ai", {
      duration: 1,
      scale: 1.1,
      transformOrigin: "50% 50%",
      repeat: -1,
      yoyo: true,
      ease: easeA,
    });

    return () => {
      timelines.forEach(tl => tl.kill());
      gradTl.kill();
      iconTl.kill();
      gsap.killTweensOf(svg.querySelectorAll("*"));
    };
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto h-[600px] sm:h-[780px]">
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="170 70 460 460"
        className="w-full h-full"
        style={{ visibility: "hidden" }}
      >
        <defs>
          <linearGradient id="aiGrad" x1="513.98" y1="290" x2="479.72" y2="320" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset=".15" stopColor="#EF476F" />
            <stop offset=".4" stopColor="#359eee" />
            <stop offset=".6" stopColor="#03cea4" />
            <stop offset=".78" stopColor="#FFC43D" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>

        {Array.from({ length: 30 }).map((_, i) => (
          <ellipse key={i} className="ell" cx="400" cy="300" rx="220" ry="220" fill="none" />
        ))}

        <path
          id="ai"
          opacity={0}
          d="m417.17,323.85h-34.34c-3.69,0-6.67-2.99-6.67-6.67v-34.34c0-3.69,2.99-6.67,6.67-6.67h34.34c3.69,0,6.67,2.99,6.67,6.67v34.34c0,3.69-2.99,6.67-6.67,6.67Zm-5.25-12.92v-21.85c0-.55-.45-1-1-1h-21.85c-.55,0-1,.45-1,1v21.85c0,.55.45,1,1,1h21.85c.55,0,1-.45,1-1Zm23.08-16.29h-11.15m-47.69,0h-11.15m70,10.73h-11.15m-47.69,0h-11.15m40.37,29.63v-11.15m0-47.69v-11.15m-10.73,70v-11.15m0-47.69v-11.15"
          stroke="url(#aiGrad)"
          strokeLinecap="round"
          strokeMiterlimit="10"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    </div>
  );
};

export default function LandingPage() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const router = useRouter();
  const searchParams = useSearchParams();
  const wasConnected = useRef(isConnected);

  const { data: crepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
    query: { enabled: !!address },
  });

  // Redirect old /?content=123 share links to /vote?content=123
  useEffect(() => {
    const contentParam = searchParams.get("content");
    if (contentParam) {
      router.replace(`/vote?content=${contentParam}`);
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (isConnected && !wasConnected.current) {
      const hasBalance = crepBalance && crepBalance > 0n;
      router.push(hasBalance ? "/vote" : "/governance");
    }
    wasConnected.current = isConnected;
  }, [isConnected, router, crepBalance]);

  return (
    <div className="flex flex-col items-center grow px-4 pt-0 pb-16">
      <div className="w-full max-w-6xl flex flex-col items-center">
        {/* Hero: stacked on mobile, side-by-side on large screens */}
        <div className="w-full flex flex-col lg:flex-row-reverse lg:items-center lg:gap-8">
          {/* Animation (right on large screens) */}
          <div className="lg:flex-1">
            <CuryoAnimation />
          </div>

          {/* Title (left on large screens) */}
          <div className="flex flex-col items-center lg:items-start lg:flex-1">
            <h1 className="text-7xl sm:text-9xl font-bold tracking-tight -mt-8 lg:mt-0 uppercase">Curyo</h1>
            <p className="text-2xl sm:text-3xl text-base-content/60 mt-3 text-center lg:text-left">
              The Reputation Game for the
              <br />
              Age of AI
            </p>
            <div className="flex gap-3 mt-6">
              {!isConnected && (
                <button
                  className="btn bg-white text-black hover:bg-gray-200 border-none"
                  onClick={openConnectModal}
                  type="button"
                  style={{ fontSize: "16px" }}
                >
                  Connect Wallet
                </button>
              )}
              <Link
                href="/docs"
                className="btn bg-gray-800 text-white hover:bg-gray-700 border-none"
                style={{ fontSize: "16px" }}
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="w-full mt-12">
          <h2 className="text-4xl sm:text-5xl font-bold text-center mb-12">
            How it{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: "linear-gradient(90deg, #359EEE, #03CEA4, #FFC43D, #EF476F)",
              }}
            >
              Works
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {STEPS.map(({ icon: Icon, title, description, color }) => (
              <div key={title} className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4">
                  <Icon className="w-10 h-10" style={{ color }} />
                </div>
                <h3 className="text-xl font-semibold mb-2">{title}</h3>
                <p className="text-lg text-base-content/60">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
