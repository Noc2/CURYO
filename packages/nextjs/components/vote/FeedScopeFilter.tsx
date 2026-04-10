"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { type PopoverPlacement, computePopoverPlacement } from "~~/lib/ui/popoverPosition";

interface FeedScopeOption {
  value: string;
  label: string;
  description?: string;
}

interface FeedScopeOptionGroup {
  label: string;
  options: FeedScopeOption[];
}

interface FeedScopeFilterProps {
  value: string;
  groups: FeedScopeOptionGroup[];
  onChange: (value: string) => void;
  label?: string;
}

const DESKTOP_BREAKPOINT_QUERY = "(min-width: 640px)";

function measureDesktopPopover(
  triggerElement: HTMLButtonElement | null,
  popoverElement: HTMLDivElement | null,
): PopoverPlacement | null {
  if (!triggerElement || !popoverElement || typeof window === "undefined") return null;

  const triggerRect = triggerElement.getBoundingClientRect();
  const popoverRect = popoverElement.getBoundingClientRect();

  return computePopoverPlacement({
    triggerRect,
    popoverSize: { width: popoverRect.width, height: popoverRect.height },
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
}

export function FeedScopeFilter({ value, groups, onChange, label = "View" }: FeedScopeFilterProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const desktopPanelRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [desktopLayout, setDesktopLayout] = useState<PopoverPlacement | null>(null);
  const flatOptions = useMemo(() => groups.flatMap(group => group.options), [groups]);
  const defaultValue = flatOptions[0]?.value;
  const isFiltered = value !== defaultValue;

  const selectedOption = useMemo(
    () => flatOptions.find(option => option.value === value) ?? flatOptions[0],
    [flatOptions, value],
  );
  const buttonLabel = isFiltered ? (selectedOption?.label ?? label) : label;

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(DESKTOP_BREAKPOINT_QUERY);
    const updateViewportMode = () => setIsDesktopViewport(mediaQuery.matches);

    updateViewportMode();
    mediaQuery.addEventListener("change", updateViewportMode);
    return () => mediaQuery.removeEventListener("change", updateViewportMode);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;

      const isInsideTrigger = wrapperRef.current?.contains(event.target) ?? false;
      const isInsideDesktopPanel = desktopPanelRef.current?.contains(event.target) ?? false;
      const isInsideMobilePanel = mobilePanelRef.current?.contains(event.target) ?? false;

      if (isInsideTrigger || isInsideDesktopPanel || isInsideMobilePanel) return;
      setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isMounted || !isOpen || !isDesktopViewport) return;

    const updateLayout = () => {
      const nextLayout = measureDesktopPopover(buttonRef.current, desktopPanelRef.current);
      if (nextLayout) {
        setDesktopLayout(nextLayout);
      }
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);

    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [groups, isDesktopViewport, isMounted, isOpen, value]);

  useEffect(() => {
    if (!isOpen) {
      setDesktopLayout(null);
    }
  }, [isOpen]);

  const panelContent = (
    <>
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-base-content/10 sm:hidden" />
      <div className="mb-3 flex items-center justify-between sm:hidden">
        <div>
          <p className="text-sm font-semibold text-base-content">{label}</p>
        </div>
        <button
          type="button"
          onClick={close}
          className="rounded-full bg-base-200 p-2 text-base-content/75"
          aria-label="Close feed options"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-3 sm:space-y-2">
        {groups.map(group => (
          <div key={group.label}>
            {groups.length > 1 ? (
              <p className="px-2 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-base-content/60">
                {group.label}
              </p>
            ) : null}
            <div className="space-y-1">
              {group.options.map(option => {
                const isActive = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    title={option.description}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-base font-medium transition-colors sm:rounded-xl sm:px-3 sm:py-2 ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-base-content/80 hover:bg-base-200 hover:text-base-content sm:hover:bg-base-300"
                    }`}
                  >
                    <span>{option.label}</span>
                    {isActive ? <CheckIcon className="h-4 w-4" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedOption && isFiltered ? (
        <p className="mt-3 hidden text-xs text-base-content/70 sm:block">Showing: {selectedOption.label}</p>
      ) : null}
    </>
  );

  const mobilePanel = (
    <>
      <div className="fixed inset-0 z-50 bg-black/45 sm:hidden" onClick={close} aria-hidden="true" />
      <div
        ref={mobilePanelRef}
        className="fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl bg-base-200 p-4 shadow-2xl sm:hidden"
        role="dialog"
        aria-label={`${label} options`}
      >
        {panelContent}
      </div>
    </>
  );

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`inline-flex items-center rounded-full px-3 py-1.5 text-base font-medium whitespace-nowrap transition-colors ${
          isFiltered ? "pill-filter-active" : "pill-filter"
        }`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={isFiltered && selectedOption ? `${label}: ${selectedOption.label}` : label}
      >
        <span>{buttonLabel}</span>
      </button>

      {isOpen && (
        <>
          {isMounted ? createPortal(mobilePanel, document.body) : null}
          {isMounted && isDesktopViewport
            ? createPortal(
                <div
                  ref={desktopPanelRef}
                  className="hidden rounded-2xl bg-base-200 p-2 shadow-2xl sm:fixed sm:z-40 sm:block"
                  style={{
                    left: desktopLayout?.left ?? 0,
                    top: desktopLayout?.top ?? 0,
                    width: "min(18rem, calc(100vw - 1rem))",
                    maxHeight: desktopLayout ? `${desktopLayout.maxHeight}px` : undefined,
                    overflowY: desktopLayout && desktopLayout.maxHeight > 0 ? "auto" : undefined,
                    visibility: desktopLayout ? "visible" : "hidden",
                  }}
                  role="dialog"
                  aria-label={`${label} options`}
                >
                  {panelContent}
                </div>,
                document.body,
              )
            : null}
        </>
      )}
    </div>
  );
}
