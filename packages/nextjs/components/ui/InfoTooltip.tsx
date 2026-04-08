"use client";

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { type TooltipPlacement, type TooltipPosition, computeTooltipPlacement } from "~~/lib/ui/tooltipPosition";

interface InfoTooltipProps {
  text: string;
  position?: TooltipPosition;
  className?: string;
}

interface HoverTooltipProps extends InfoTooltipProps {
  ariaLabel?: string;
  children: ReactNode;
}

function measureTooltipLayout(
  triggerElement: HTMLButtonElement | null,
  tooltipElement: HTMLSpanElement | null,
  position: TooltipPosition,
) {
  if (!triggerElement || !tooltipElement || typeof window === "undefined") return null;

  const triggerRect = triggerElement.getBoundingClientRect();
  const tooltipRect = tooltipElement.getBoundingClientRect();

  return computeTooltipPlacement({
    triggerRect,
    tooltipSize: { width: tooltipRect.width, height: tooltipRect.height },
    preferredPosition: position,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
}

function getArrowStyle(layout: TooltipPlacement) {
  return { left: layout.arrowLeft, top: layout.arrowTop };
}

/**
 * Reusable trigger with a viewport-aware tooltip.
 * Renders into a portal so the tooltip is not clipped by overflow-hidden parents.
 */
export const HoverTooltip = ({ text, position = "top", className = "", ariaLabel, children }: HoverTooltipProps) => {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [layout, setLayout] = useState<TooltipPlacement | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !isMounted) return;
    const nextLayout = measureTooltipLayout(triggerRef.current, tooltipRef.current, position);
    if (nextLayout) setLayout(nextLayout);
  }, [isMounted, isOpen, position, text]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const handleViewportChange = () => {
      const nextLayout = measureTooltipLayout(triggerRef.current, tooltipRef.current, position);
      if (nextLayout) setLayout(nextLayout);
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, position, text]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`inline-flex cursor-help items-center border-0 bg-transparent p-0 text-left align-middle text-inherit ${className}`}
        aria-label={ariaLabel}
        aria-describedby={isOpen ? tooltipId : undefined}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
      >
        {children}
      </button>

      {isMounted && isOpen
        ? createPortal(
            <span
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-[1000] block"
              style={{
                left: layout?.left ?? 0,
                top: layout?.top ?? 0,
                visibility: layout ? "visible" : "hidden",
                maxWidth: "min(20rem, calc(100vw - 1rem))",
              }}
            >
              <span className="relative block rounded-2xl bg-neutral px-3 py-2 text-sm leading-snug text-neutral-content shadow-2xl">
                {text}
                {layout ? (
                  <span
                    aria-hidden="true"
                    className="absolute block h-2 w-2 rotate-45 bg-neutral"
                    style={getArrowStyle(layout)}
                  />
                ) : null}
              </span>
            </span>,
            document.body,
          )
        : null}
    </>
  );
};

/**
 * Reusable info icon with a viewport-aware tooltip.
 * Renders into a portal so the tooltip is not clipped by overflow-hidden parents.
 */
export const InfoTooltip = ({ text, position = "top", className = "" }: InfoTooltipProps) => (
  <HoverTooltip text={text} position={position} className={className} ariaLabel={text}>
    <InformationCircleIcon className="h-4 w-4 text-base-content/40 hover:text-base-content/60" aria-hidden="true" />
  </HoverTooltip>
);
