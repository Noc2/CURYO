"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useOutsideClick } from "~~/hooks/scaffold-eth/useOutsideClick";

interface CategoryFilterProps {
  categories: string[];
  activeCategory: string;
  onSelect: (category: string) => void;
  /** Optional callback to customize pill classes per category (e.g. for "Broken" warning style). */
  pillClassName?: (category: string, isActive: boolean) => string | undefined;
}

const PILL_GAP = 8; // gap-2 = 0.5rem = 8px
const MORE_BUTTON_WIDTH = 100; // approximate width of "+ N more" button

export function CategoryFilter({ categories, activeCategory, onSelect, pillClassName }: CategoryFilterProps) {
  const searchFieldBaseId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(categories.length);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [pillWidths, setPillWidths] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputId = `${searchFieldBaseId}-mobile`;
  const desktopSearchInputId = `${searchFieldBaseId}-desktop`;

  useOutsideClick(
    dropdownRef,
    useCallback(() => {
      setDropdownOpen(false);
      setSearch("");
    }, []),
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setSearch("");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  // Measure pill widths from the hidden measurement row
  useEffect(() => {
    if (!measureRef.current) return;
    const pills = measureRef.current.children;
    const widths: number[] = [];
    for (let i = 0; i < pills.length; i++) {
      widths.push((pills[i] as HTMLElement).offsetWidth);
    }
    setPillWidths(widths);
  }, [categories]);

  // Calculate how many pills fit
  useEffect(() => {
    if (!containerRef.current || pillWidths.length === 0) return;

    const calculate = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      let used = 0;
      let count = 0;

      for (let i = 0; i < pillWidths.length; i++) {
        const pillW = pillWidths[i] + (i > 0 ? PILL_GAP : 0);
        const remaining = pillWidths.length - (i + 1);
        const needsMore = remaining > 0;
        const available = needsMore ? containerWidth - MORE_BUTTON_WIDTH - PILL_GAP : containerWidth;

        if (used + pillW <= available) {
          used += pillW;
          count++;
        } else {
          break;
        }
      }

      setVisibleCount(Math.max(1, count));
    };

    calculate();

    const observer = new ResizeObserver(calculate);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pillWidths]);

  // If the active category would be hidden in overflow, swap it into the visible set
  const { visible, overflow } = useMemo(() => {
    const vis = categories.slice(0, visibleCount);
    const ovf = categories.slice(visibleCount);

    if (ovf.includes(activeCategory)) {
      // Swap: replace last visible pill with active category
      const swappedOut = vis[vis.length - 1];
      vis[vis.length - 1] = activeCategory;
      ovf[ovf.indexOf(activeCategory)] = swappedOut;
    }

    return { visible: vis, overflow: ovf };
  }, [categories, visibleCount, activeCategory]);

  const filteredOverflow = useMemo(
    () => overflow.filter(c => c.toLowerCase().includes(search.toLowerCase())),
    [overflow, search],
  );
  const filteredCategories = useMemo(
    () => categories.filter(category => category.toLowerCase().includes(search.toLowerCase())),
    [categories, search],
  );

  const handleSelect = (category: string) => {
    onSelect(category);
    setDropdownOpen(false);
    setMobileOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="shrink-0 sm:flex-1 sm:min-w-0 relative">
      {/* Hidden measurement row */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="absolute inset-x-0 flex h-0 max-w-full gap-2 overflow-hidden invisible pointer-events-none"
      >
        {categories.map(category => (
          <span key={category} className="px-3 py-1.5 rounded-full text-base font-medium whitespace-nowrap shrink-0">
            {category}
          </span>
        ))}
      </div>

      {/* Mobile: dropdown */}
      <div className="relative shrink-0 sm:hidden">
        <button
          type="button"
          onClick={() => {
            setMobileOpen(prev => !prev);
            setSearch("");
          }}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-base font-medium whitespace-nowrap transition-colors ${
            activeCategory !== categories[0] ? "pill-category" : "pill-inactive"
          }`}
          aria-haspopup="dialog"
          aria-expanded={mobileOpen}
          aria-label={`Category: ${activeCategory}`}
        >
          {activeCategory}
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {mobileOpen && isMounted
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-30 bg-black/45 sm:hidden"
                onClick={() => setMobileOpen(false)}
                aria-hidden="true"
              />
              <div
                className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl bg-base-200 p-4 shadow-2xl sm:hidden"
                role="dialog"
                aria-label="Category options"
              >
                <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-base-content/10" />
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-base-content">Categories</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      setSearch("");
                    }}
                    className="rounded-full bg-base-300 p-2 text-base-content/75"
                    aria-label="Close categories"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="relative">
                  <label htmlFor={mobileSearchInputId} className="sr-only">
                    Search categories
                  </label>
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/40" />
                  <input
                    id={mobileSearchInputId}
                    name="category-search-mobile"
                    type="text"
                    placeholder="Search categories..."
                    aria-label="Search categories"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="input h-12 w-full rounded-2xl border-none bg-base-300 pl-10 text-base"
                    autoFocus
                  />
                </div>

                <div className="mt-3 max-h-[min(58vh,26rem)] space-y-1 overflow-y-auto pr-1">
                  {filteredCategories.length > 0 ? (
                    filteredCategories.map(category => {
                      const isActive = activeCategory === category;
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => handleSelect(category)}
                          className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-base font-medium transition-colors ${
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-base-content/80 hover:bg-base-300 hover:text-base-content"
                          }`}
                        >
                          <span className="min-w-0 leading-tight">{category}</span>
                          {isActive ? <CheckIcon className="ml-3 h-4 w-4 shrink-0" /> : null}
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-2 py-3 text-sm text-base-content/40">No matches</div>
                  )}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}

      {/* Desktop: measured pills with overflow */}
      <div className="hidden gap-2 items-center sm:flex">
        {visible.map(category => {
          const isActive = activeCategory === category;
          const custom = pillClassName?.(category, isActive);
          const defaultCls = isActive ? "pill-category" : "pill-inactive";
          return (
            <button
              key={category}
              onClick={() => handleSelect(category)}
              className={`px-3 py-1.5 rounded-full text-base font-medium whitespace-nowrap transition-colors shrink-0 ${custom ?? defaultCls}`}
            >
              {category}
            </button>
          );
        })}

        {overflow.length > 0 && (
          <div ref={dropdownRef} className="relative shrink-0">
            <button
              onClick={() => setDropdownOpen(prev => !prev)}
              className={`px-3 py-1.5 rounded-full text-base font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                overflow.includes(activeCategory) ? "pill-category" : "pill-inactive"
              }`}
            >
              +{overflow.length} more
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>

            {dropdownOpen && (
              <div className="absolute top-full mt-1 right-0 z-50 bg-base-200 rounded-box shadow-lg min-w-[200px]">
                <div className="p-2">
                  <div className="relative">
                    <label htmlFor={desktopSearchInputId} className="sr-only">
                      Search categories
                    </label>
                    <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
                    <input
                      id={desktopSearchInputId}
                      ref={searchInputRef}
                      name="category-search-desktop"
                      type="text"
                      placeholder="Search categories..."
                      aria-label="Search categories"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="input input-sm w-full pl-8 bg-base-300 border-none text-base"
                      autoFocus
                    />
                  </div>
                </div>
                <ul className="menu p-2 pt-0 max-h-[250px] overflow-y-auto">
                  {filteredOverflow.length > 0 ? (
                    filteredOverflow.map(category => (
                      <li key={category}>
                        <button
                          onClick={() => handleSelect(category)}
                          className={`whitespace-nowrap ${
                            activeCategory === category ? "bg-primary text-primary-content hover:bg-primary" : ""
                          }`}
                        >
                          {category}
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="text-base-content/40 text-sm px-3 py-2">No matches</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
