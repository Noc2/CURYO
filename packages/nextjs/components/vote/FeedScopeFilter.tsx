"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useOutsideClick } from "~~/hooks/scaffold-eth/useOutsideClick";

export interface FeedScopeOption {
  value: string;
  label: string;
}

interface FeedScopeFilterProps {
  value: string;
  options: FeedScopeOption[];
  onChange: (value: string) => void;
  label?: string;
}

export function FeedScopeFilter({ value, options, onChange, label = "Filter" }: FeedScopeFilterProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const defaultValue = options[0]?.value;
  const isFiltered = value !== defaultValue;

  const selectedOption = useMemo(() => options.find(option => option.value === value) ?? options[0], [options, value]);
  const buttonLabel = isFiltered ? (selectedOption?.label ?? label) : label;

  const close = useCallback(() => setIsOpen(false), []);

  useOutsideClick(
    wrapperRef,
    useCallback(() => {
      setIsOpen(false);
    }, []),
  );

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

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`inline-flex items-center rounded-full px-3 py-1.5 text-base font-medium whitespace-nowrap transition-colors ${
          isFiltered ? "pill-category" : "bg-base-200 text-white hover:bg-base-300"
        }`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={isFiltered && selectedOption ? `${label}: ${selectedOption.label}` : label}
      >
        <span>{buttonLabel}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-black/45 sm:hidden" onClick={close} aria-hidden="true" />
          <div
            ref={panelRef}
            className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border border-base-content/10 bg-base-100 p-4 shadow-2xl sm:absolute sm:inset-auto sm:top-full sm:left-0 sm:z-30 sm:mt-2 sm:w-72 sm:rounded-2xl sm:bg-base-200 sm:p-2"
            role="dialog"
            aria-label="Feed filter options"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-base-content/10 sm:hidden" />
            <div className="mb-3 flex items-center justify-between sm:hidden">
              <div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-xs text-base-content/50">Choose which items appear in your feed.</p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-full bg-base-200 p-2 text-base-content/60"
                aria-label="Close filters"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1">
              {options.map(option => {
                const isActive = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition-colors sm:rounded-xl sm:px-3 sm:py-2 ${
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

            {selectedOption && isFiltered ? (
              <p className="mt-3 hidden text-xs text-base-content/50 sm:block">Showing: {selectedOption.label}</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
