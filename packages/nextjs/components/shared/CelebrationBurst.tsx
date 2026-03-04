"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

const COLORS = ["#359EEE", "#FFC43D", "#EF476F", "#03CEA4"];

/**
 * GSAP-based celebration burst effect — expanding colored ellipses from center.
 * Inspired by CuryoAnimation.tsx color palette and custom eases.
 * Auto-destroys after ~2s.
 */
export function CelebrationBurst() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    CustomEase.create("burstOut", "M0,0 C0.2,0 0.432,0.147 0.507,0.374 0.59,0.629 0.822,1 1,1");

    const particles: HTMLDivElement[] = [];
    const count = 24;

    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      const size = 6 + Math.random() * 10;
      const color = COLORS[i % COLORS.length];
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const distance = 80 + Math.random() * 120;

      el.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size * 0.6}px;
        border-radius: 50%;
        background: ${color};
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
      `;
      container.appendChild(el);
      particles.push(el);

      gsap.to(el, {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        opacity: 0,
        scale: 0.3,
        duration: 1.2 + Math.random() * 0.6,
        ease: "burstOut",
        delay: Math.random() * 0.15,
      });
    }

    const timer = setTimeout(() => {
      particles.forEach(el => el.remove());
    }, 2200);

    return () => {
      clearTimeout(timer);
      particles.forEach(el => el.remove());
      gsap.killTweensOf(particles);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true" />;
}
