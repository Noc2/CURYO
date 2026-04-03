"use client";

import React, { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Address } from "viem";
import { useAccount } from "wagmi";
import {
  ArrowLeftIcon,
  Bars3Icon,
  BookOpenIcon,
  GlobeAltIcon,
  IdentificationIcon,
  MagnifyingGlassIcon,
  PlusCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CuryoLogo } from "~~/components/CuryoLogo";
import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { AddressInfoDropdown } from "~~/components/scaffold-eth/ConnectButton/AddressInfoDropdown";
import { DOCS_NAV } from "~~/constants/docsNav";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { useVoteSearch } from "~~/hooks/useVoteSearch";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const menuLinks: HeaderMenuLink[] = [
  { label: "Discover", href: "/vote", icon: GlobeAltIcon },
  { label: "Submit", href: "/submit", icon: PlusCircleIcon },
  { label: "cREP", href: "/governance", icon: IdentificationIcon },
  { label: "Docs", href: "/docs", icon: BookOpenIcon },
];

type HeaderNavLinkProps = {
  className?: string;
  compact?: boolean;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  indicatorLayoutId?: string;
  isActive: boolean;
  label: string;
};

const navIndicatorClassName =
  "absolute right-2 top-2 bottom-2 w-1 rounded-full bg-linear-to-b from-[#F5F0EB] via-[#F26426] to-[#B3341B] shadow-[0_0_18px_rgba(242,100,38,0.45)]";

const HeaderNavLink = ({
  className,
  compact = false,
  href,
  icon: Icon,
  indicatorLayoutId,
  isActive,
  label,
}: HeaderNavLinkProps) => {
  const navTone = isActive ? "text-base-content" : "text-base-content/75 group-hover:text-base-content";

  return (
    <Link
      href={href}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl ${
        compact ? "px-3 py-2.5" : "px-4 py-3"
      } ${className ?? ""} transition-colors duration-200 ${
        isActive ? "text-base-content" : "text-base-content/75 hover:bg-base-content/[0.04] hover:text-base-content"
      }`}
    >
      <Icon className={`relative z-10 h-6 w-6 shrink-0 transition-colors duration-200 ${navTone}`} />
      <span className={`relative z-10 text-base font-medium transition-colors duration-200 ${navTone}`}>{label}</span>
      {isActive ? (
        indicatorLayoutId ? (
          <motion.span
            layoutId={indicatorLayoutId}
            transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.55 }}
            className={navIndicatorClassName}
          />
        ) : (
          <span className={navIndicatorClassName} />
        )
      ) : null}
    </Link>
  );
};

const HeaderMenuLinks = ({ variant = "mobile" }: { variant?: "mobile" | "desktop" }) => {
  const pathname = usePathname() ?? "";
  const isDocsPage = pathname.startsWith("/docs");
  const compact = variant === "mobile";
  const indicatorLayoutId = variant === "desktop" ? "header-sidebar-active-indicator" : undefined;

  return (
    <>
      {menuLinks.map(({ label, href, icon: Icon }) => {
        const isActive = pathname.startsWith(href);
        const isDocs = href === "/docs";

        // If we're on docs page, show Docs as header with submenu, otherwise show as regular link
        if (isDocs && isDocsPage) {
          return (
            <li key={href} className="w-full">
              <HeaderNavLink
                className="mb-2"
                compact={compact}
                href={href}
                icon={Icon}
                indicatorLayoutId={indicatorLayoutId}
                isActive
                label="Docs"
              />
              {/* Docs submenu - single column, explicitly block layout */}
              <div className="flex flex-col space-y-4 w-full">
                {DOCS_NAV.map(group => {
                  const sectionHref = group.links[0]?.href ?? href;
                  const isSectionActive = group.links.some(link => pathname === link.href);

                  return (
                    <div key={group.section} className="w-full flex flex-col">
                      <h3 className="mb-1.5 w-full">
                        <Link
                          href={sectionHref}
                          className={`block w-full rounded-lg px-3 text-base font-semibold uppercase tracking-wider transition-colors ${isSectionActive ? "text-base-content/80" : "text-base-content/55 hover:text-base-content/80"}`}
                        >
                          {group.section}
                        </Link>
                      </h3>
                      <div className="flex flex-col space-y-0.5 w-full">
                        {group.links.map(link => {
                          const isLinkActive = pathname === link.href;
                          return (
                            <Link
                              key={link.href}
                              href={link.href}
                              className={`block w-full px-3 py-1.5 text-base rounded-lg transition-colors ${
                                isLinkActive
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "text-base-content/75 hover:bg-base-content/[0.04] hover:text-base-content"
                              }`}
                            >
                              {link.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </li>
          );
        }

        // Regular menu items
        return (
          <li key={href} className="w-full">
            <HeaderNavLink
              href={href}
              icon={Icon}
              compact={compact}
              indicatorLayoutId={indicatorLayoutId}
              isActive={isActive}
              label={label}
            />
          </li>
        );
      })}
    </>
  );
};

const MobileMenuLinks = () => {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const blockExplorerAddressLink = address ? getBlockExplorerAddressLink(targetNetwork, address) : undefined;

  return (
    <>
      {/* Main nav items */}
      <HeaderMenuLinks />
      {/* Wallet menu items when connected */}
      {address && (
        <>
          <li className="divider my-1" />
          <AddressInfoDropdown
            address={address as Address}
            displayName={address.slice(0, 6) + "..." + address.slice(-4)}
            blockExplorerAddressLink={blockExplorerAddressLink}
            menuItemsOnly
          />
        </>
      )}
    </>
  );
};

const SEARCH_COMMIT_DEBOUNCE_MS = 200;
const MOBILE_HEADER_SCROLL_DELTA = 12;
const MOBILE_HEADER_HIDE_OFFSET = 72;
const EXPLICIT_LANDING_HREF = "/?landing=1";

const HeaderBrand = ({ className, compact = false }: { className?: string; compact?: boolean }) => (
  <Link href={EXPLICIT_LANDING_HREF} className={`flex min-w-0 items-center gap-2 ${className ?? ""}`}>
    <CuryoLogo className={compact ? "h-8 w-8 shrink-0" : "h-9 w-9 shrink-0"} />
    <div className={`flex min-w-0 flex-col gap-0.5 ${compact ? "" : "items-start"}`}>
      <span
        className={`font-display leading-none tracking-[0.08em] text-base-content ${
          compact ? "truncate text-[1.35rem]" : "text-[1.4rem]"
        }`}
      >
        CURYO (BETA)
      </span>
      <span className={`${compact ? "truncate" : ""} text-base-content/75`} style={{ fontSize: "14px" }}>
        Human Reputation
      </span>
    </div>
  </Link>
);

const HeaderSearchBar = ({ className }: { className?: string }) => {
  const { activeQuery, commitSearch } = useVoteSearch();
  const [inputValue, setInputValue] = useState(activeQuery);
  const searchInputId = useId();

  useEffect(() => {
    setInputValue(activeQuery);
  }, [activeQuery]);

  const updateSearch = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  const clearSearch = useCallback(() => {
    setInputValue("");
    commitSearch("");
  }, [commitSearch]);

  useEffect(() => {
    if (inputValue === activeQuery) return;

    const timeoutId = setTimeout(() => {
      commitSearch(inputValue, { skipIfUnchanged: true });
    }, SEARCH_COMMIT_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [activeQuery, commitSearch, inputValue]);

  const isSidebar = className?.includes("sidebar");
  return (
    <div className={`relative ${className ?? ""} ${isSidebar ? "w-full min-w-0" : "hidden sm:block"}`}>
      <label htmlFor={searchInputId} className="sr-only">
        Search content
      </label>
      <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/45 pointer-events-none" />
      <input
        id={searchInputId}
        name="vote-search"
        type="text"
        placeholder="Search there"
        aria-label="Search content"
        value={inputValue}
        onChange={e => updateSearch(e.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitSearch(inputValue, { skipIfUnchanged: true });
          }
        }}
        className={`input input-sm input-bordered border-base-content/10 bg-base-300/80 pl-8 pr-7 text-base focus:border-primary/30 focus:bg-base-300 ${
          isSidebar ? "w-full max-w-full" : "w-40 lg:w-56"
        }`}
      />
      {inputValue && (
        <button
          onClick={clearSearch}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-base-content/10 flex items-center justify-center hover:bg-base-content/20 transition-colors"
        >
          <XMarkIcon className="w-3 h-3 text-base-content/65" />
        </button>
      )}
    </div>
  );
};

const MobileHeaderSearch = ({ onClose }: { onClose: () => void }) => {
  const { activeQuery, commitSearch } = useVoteSearch();
  const [draftValue, setDraftValue] = useState(activeQuery);
  const searchInputId = useId();

  useEffect(() => {
    setDraftValue(activeQuery);
  }, [activeQuery]);

  const handleClose = useCallback(() => {
    setDraftValue(activeQuery);
    onClose();
  }, [activeQuery, onClose]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      commitSearch(draftValue);
      onClose();
    },
    [commitSearch, draftValue, onClose],
  );

  return (
    <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
      <button type="button" onClick={handleClose} className="btn btn-ghost btn-sm p-1" aria-label="Close search">
        <ArrowLeftIcon className="h-5 w-5" />
      </button>
      <div className="relative min-w-0 flex-1">
        <label htmlFor={searchInputId} className="sr-only">
          Search content
        </label>
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/30" />
        <input
          id={searchInputId}
          name="vote-search-mobile"
          type="text"
          placeholder="Search there"
          aria-label="Search content"
          value={draftValue}
          onChange={event => setDraftValue(event.target.value)}
          autoFocus
          className="input input-sm w-full border-base-content/10 bg-base-300/85 pl-9 pr-9 text-base"
        />
        {draftValue ? (
          <button
            type="button"
            onClick={() => setDraftValue("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-base-content/10 text-base-content/70"
          >
            <XMarkIcon className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <button type="submit" className="btn btn-sm btn-primary border-none px-3" aria-label="Submit search">
        <MagnifyingGlassIcon className="h-4 w-4" />
      </button>
    </form>
  );
};

/**
 * Left-side vertical navbar (TikTok-style). Desktop: fixed sidebar; mobile: top bar with burger.
 */
export const Header = () => {
  const pathname = usePathname() ?? "";
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isMobileHeaderVisible, setIsMobileHeaderVisible] = useState(true);

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  const lastScrollYRef = useRef(0);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  useEffect(() => {
    setMobileSearchOpen(false);
    setIsMobileHeaderVisible(true);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    lastScrollYRef.current = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollYRef.current;
      const isMobileMenuOpen = burgerMenuRef.current?.open ?? false;

      if (currentScrollY <= 0) {
        setIsMobileHeaderVisible(true);
        lastScrollYRef.current = 0;
        return;
      }

      if (mobileSearchOpen || isMobileMenuOpen) {
        setIsMobileHeaderVisible(true);
        lastScrollYRef.current = currentScrollY;
        return;
      }

      if (Math.abs(scrollDelta) < MOBILE_HEADER_SCROLL_DELTA) return;

      setIsMobileHeaderVisible(scrollDelta < 0 || currentScrollY < MOBILE_HEADER_HIDE_OFFSET);
      lastScrollYRef.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [mobileSearchOpen]);

  return (
    <>
      {/* Mobile: top bar */}
      <div
        className={`xl:hidden sticky top-0 z-20 transition-transform duration-200 ease-out will-change-transform ${
          isMobileHeaderVisible ? "translate-y-0" : "-translate-y-full"
        }`}
        data-mobile-header="true"
        data-visible={isMobileHeaderVisible ? "true" : "false"}
      >
        <div className="navbar min-h-0 shrink-0 justify-between bg-base-200 px-4 py-3 shadow-[0_18px_44px_rgba(9,10,12,0.32)] backdrop-blur-xl sm:px-6">
          {mobileSearchOpen ? (
            <Suspense>
              <MobileHeaderSearch onClose={() => setMobileSearchOpen(false)} />
            </Suspense>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-2">
                <details
                  className="dropdown"
                  ref={burgerMenuRef}
                  onToggle={() => {
                    if (burgerMenuRef.current?.open) setIsMobileHeaderVisible(true);
                  }}
                >
                  <summary className="btn btn-ghost btn-sm hover:bg-transparent p-1" aria-label="Open menu">
                    <Bars3Icon className="h-5 w-5" />
                  </summary>
                  <ul
                    className="menu menu-compact dropdown-content mt-3 w-64 rounded-xl bg-base-200 p-2 shadow-lg"
                    onClick={() => burgerMenuRef?.current?.removeAttribute("open")}
                  >
                    <Suspense>
                      <MobileMenuLinks />
                    </Suspense>
                  </ul>
                </details>
                <HeaderBrand compact />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen(true)}
                  className="btn btn-ghost btn-sm p-1 sm:hidden"
                  aria-label="Search content"
                >
                  <MagnifyingGlassIcon className="h-5 w-5" />
                </button>
                <Suspense>
                  <HeaderSearchBar />
                </Suspense>
                <CuryoConnectButton compact />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Desktop: left sidebar */}
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-52 shrink-0 flex-col items-stretch bg-base-200 py-4 shadow-[18px_0_48px_rgba(9,10,12,0.24)] backdrop-blur-xl xl:flex">
        <HeaderBrand className="mb-4 shrink-0 px-4" />
        <div className="mb-4 w-full min-w-0 px-2.5">
          <Suspense>
            <HeaderSearchBar className="sidebar" />
          </Suspense>
        </div>
        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
          <ul className="menu menu-vertical p-0 gap-0.5 w-full">
            <HeaderMenuLinks variant="desktop" />
          </ul>
        </nav>
        <div className="mt-auto flex w-full shrink-0 flex-col items-stretch gap-2 border-t border-base-300 px-2.5 pt-4">
          <div className="w-full flex justify-stretch">
            <CuryoConnectButton inlineMenu />
          </div>
        </div>
      </aside>
    </>
  );
};
