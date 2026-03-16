"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(categories.length);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pillWidths, setPillWidths] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useOutsideClick(
    dropdownRef,
    useCallback(() => {
      setDropdownOpen(false);
      setSearch("");
    }, []),
  );

  useOutsideClick(
    mobileDropdownRef,
    useCallback(() => {
      setMobileOpen(false);
      setSearch("");
    }, []),
  );

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

  const handleSelect = (category: string) => {
    onSelect(category);
    setDropdownOpen(false);
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
      <div ref={mobileDropdownRef} className="relative shrink-0 sm:hidden">
        <button
          onClick={() => {
            setMobileOpen(prev => !prev);
            setSearch("");
          }}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-base font-medium whitespace-nowrap transition-colors ${
            activeCategory !== categories[0]
              ? "pill-category"
              : "bg-base-200 text-base-content hover:bg-[#F5F0EB]/[0.05]"
          }`}
        >
          {activeCategory}
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>

        {mobileOpen && (
          <div className="absolute top-full mt-1 left-0 z-50 bg-base-200 rounded-box shadow-lg min-w-[200px] max-w-[280px]">
            <div className="p-2">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
                <input
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
            <ul className="menu p-2 pt-0 max-h-[300px] overflow-y-auto">
              {categories
                .filter(c => c.toLowerCase().includes(search.toLowerCase()))
                .map(category => {
                  const isActive = activeCategory === category;
                  return (
                    <li key={category}>
                      <button
                        onClick={() => {
                          handleSelect(category);
                          setMobileOpen(false);
                        }}
                        className={`whitespace-nowrap ${isActive ? "bg-[#F26426] text-[#F5F0EB] hover:bg-[#F26426]" : ""}`}
                      >
                        {category}
                      </button>
                    </li>
                  );
                })}
              {categories.filter(c => c.toLowerCase().includes(search.toLowerCase())).length === 0 && (
                <li className="text-base-content/40 text-sm px-3 py-2">No matches</li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Desktop: measured pills with overflow */}
      <div className="hidden gap-2 items-center sm:flex">
        {visible.map(category => {
          const isActive = activeCategory === category;
          const custom = pillClassName?.(category, isActive);
          const defaultCls = isActive ? "pill-category" : "bg-base-200 text-base-content hover:bg-[#F5F0EB]/[0.05]";
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
                overflow.includes(activeCategory)
                  ? "pill-category"
                  : "bg-base-200 text-base-content hover:bg-[#F5F0EB]/[0.05]"
              }`}
            >
              +{overflow.length} more
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>

            {dropdownOpen && (
              <div className="absolute top-full mt-1 right-0 z-50 bg-base-200 rounded-box shadow-lg min-w-[200px]">
                <div className="p-2">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
                    <input
                      ref={searchInputRef}
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
                            activeCategory === category ? "bg-[#F26426] text-[#F5F0EB] hover:bg-[#F26426]" : ""
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
