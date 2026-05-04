"use client";

import { useEffect, useRef, useState } from "react";

export function AnimateInView({
  children,
  className = "",
  delay = 0,
  duration = 0.9,
  translateY = 24,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  translateY?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hidden = ready && !isInView;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? `translateY(${translateY}px)` : "translateY(0)",
        transition: hidden
          ? undefined
          : `opacity ${duration}s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${duration}s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
