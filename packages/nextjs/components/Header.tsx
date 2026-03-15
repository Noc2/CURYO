"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Address } from "viem";
import { useAccount } from "wagmi";
import { ArrowLeftIcon, Bars3Icon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { CuryoLogo } from "~~/components/CuryoLogo";
import { CrepNavIcon, DiscoverNavIcon, DocsNavIcon, SubmitNavIcon } from "~~/components/brand/OrbitalNavIcons";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { AddressInfoDropdown } from "~~/components/scaffold-eth/RainbowKitCustomConnectButton/AddressInfoDropdown";
import { DOCS_NAV } from "~~/constants/docsNav";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
};

export const menuLinks: HeaderMenuLink[] = [
  { label: "Discover", href: "/vote", icon: DiscoverNavIcon, color: "#8EB6FF" },
  { label: "Submit", href: "/submit", icon: SubmitNavIcon, color: "#63E6D2" },
  { label: "cREP", href: "/governance", icon: CrepNavIcon, color: "#FFC76A" },
  { label: "Docs", href: "/docs", icon: DocsNavIcon, color: "#FF9FC2" },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname() ?? "";
  const isDocsPage = pathname.startsWith("/docs");

  return (
    <>
      {menuLinks.map(({ label, href, icon: Icon, color }) => {
        const isActive = pathname.startsWith(href);
        const isDocs = href === "/docs";

        // If we're on docs page, show Docs as header with submenu, otherwise show as regular link
        if (isDocs && isDocsPage) {
          return (
            <li key={href} className="w-full">
              {/* Docs header */}
              <Link
                href={href}
                className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-2xl border border-white/6 bg-white/[0.02] transition-colors hover:bg-white/[0.05]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03]">
                  <Icon className="w-5 h-5 shrink-0" style={{ color }} />
                </span>
                <span className="text-base font-medium" style={{ color }}>
                  Docs
                </span>
              </Link>
              {/* Docs submenu - single column, explicitly block layout */}
              <div className="flex flex-col space-y-4 w-full">
                {DOCS_NAV.map(group => (
                  <div key={group.section} className="w-full flex flex-col">
                    <h3 className="text-base font-semibold uppercase tracking-wider text-base-content/40 mb-1.5 px-3 w-full">
                      {group.section}
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
                                ? "border border-white/10 bg-white/[0.07] text-white font-medium"
                                : "text-base-content/60 hover:text-base-content hover:bg-white/[0.04]"
                            }`}
                          >
                            {link.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </li>
          );
        }

        // Regular menu items
        return (
          <li key={href} className="w-full">
            <Link
              href={href}
              passHref
              className={`flex items-center gap-3 px-3 py-2.5 text-base font-medium rounded-2xl border transition-colors ${
                isActive
                  ? "border-white/10 bg-white/[0.07] text-white shadow-[0_18px_36px_rgba(0,0,0,0.22)]"
                  : "border-transparent text-base-content/60 hover:border-white/6 hover:text-base-content hover:bg-white/[0.04]"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                  isActive ? "border-white/12 bg-white/[0.05]" : "border-white/6 bg-white/[0.02]"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" style={{ color }} />
              </span>
              <span className={isActive ? "text-white" : ""}>{label}</span>
            </Link>
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

const buildVoteSearchTarget = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? `/vote?q=${encodeURIComponent(trimmed)}` : "/vote";
};

const HeaderSearchBar = ({ className }: { className?: string }) => {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  const activeQuery = searchParams?.get("q") ?? "";
  const [inputValue, setInputValue] = useState(activeQuery);

  useEffect(() => {
    setInputValue(activeQuery);
  }, [activeQuery]);

  const commitSearch = useCallback(
    (value: string) => {
      const target = buildVoteSearchTarget(value);
      if (pathname === "/vote") {
        router.replace(target, { scroll: false });
      } else {
        router.push(target);
      }
    },
    [pathname, router],
  );

  const updateSearch = useCallback(
    (value: string) => {
      setInputValue(value);
      commitSearch(value);
    },
    [commitSearch],
  );

  const clearSearch = useCallback(() => {
    setInputValue("");
    commitSearch("");
  }, [commitSearch]);

  const isSidebar = className?.includes("sidebar");
  return (
    <div className={`relative ${className ?? ""} ${isSidebar ? "w-full min-w-0" : "hidden sm:block"}`}>
      <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/30 pointer-events-none" />
      <input
        type="text"
        placeholder="Search..."
        aria-label="Search content"
        value={inputValue}
        onChange={e => updateSearch(e.target.value)}
        className={`input input-sm input-bordered pl-8 pr-7 border-white/8 bg-white/[0.04] focus:bg-white/[0.08] focus:border-white/12 text-base ${
          isSidebar ? "w-full max-w-full" : "w-40 lg:w-56"
        }`}
      />
      {inputValue && (
        <button
          onClick={clearSearch}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-base-content/10 flex items-center justify-center hover:bg-base-content/20 transition-colors"
        >
          <XMarkIcon className="w-3 h-3 text-base-content/50" />
        </button>
      )}
    </div>
  );
};

const MobileHeaderSearch = ({ onClose }: { onClose: () => void }) => {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const activeQuery = searchParams?.get("q") ?? "";
  const [draftValue, setDraftValue] = useState(activeQuery);

  useEffect(() => {
    setDraftValue(activeQuery);
  }, [activeQuery]);

  const commitSearch = useCallback(
    (value: string) => {
      const target = buildVoteSearchTarget(value);
      if (pathname === "/vote") {
        router.replace(target, { scroll: false });
      } else {
        router.push(target);
      }
    },
    [pathname, router],
  );

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
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/30" />
        <input
          type="text"
          placeholder="Search content"
          aria-label="Search content"
          value={draftValue}
          onChange={event => setDraftValue(event.target.value)}
          autoFocus
          className="input input-sm w-full border border-white/8 bg-white/[0.04] pl-9 pr-9 text-base"
        />
        {draftValue ? (
          <button
            type="button"
            onClick={() => setDraftValue("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-base-content/10 text-base-content/50"
          >
            <XMarkIcon className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <button type="submit" className="btn btn-sm border-none btn-primary px-3 text-black" aria-label="Submit search">
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

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  useEffect(() => {
    setMobileSearchOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile: top bar */}
      <div className="xl:hidden sticky top-0 z-20">
        <div className="navbar min-h-0 shrink-0 justify-between px-4 sm:px-6 py-3 border-b border-white/8 bg-[linear-gradient(180deg,rgba(18,22,34,0.96),rgba(12,15,24,0.94))] backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.25)]">
          {mobileSearchOpen ? (
            <Suspense>
              <MobileHeaderSearch onClose={() => setMobileSearchOpen(false)} />
            </Suspense>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-2">
                <details className="dropdown" ref={burgerMenuRef}>
                  <summary className="btn btn-ghost btn-sm hover:bg-transparent p-1" aria-label="Open menu">
                    <Bars3Icon className="h-5 w-5" />
                  </summary>
                  <ul
                    className="menu menu-compact dropdown-content mt-3 p-2 rounded-2xl w-64 border border-white/8 bg-[linear-gradient(180deg,rgba(18,22,34,0.98),rgba(12,15,24,0.96))] shadow-[0_22px_48px_rgba(0,0,0,0.32)]"
                    onClick={() => burgerMenuRef?.current?.removeAttribute("open")}
                  >
                    <Suspense>
                      <MobileMenuLinks />
                    </Suspense>
                  </ul>
                </details>
                <Link href="/" className="flex min-w-0 items-center gap-2">
                  <CuryoLogo className="w-7 h-7 shrink-0" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-heading font-semibold text-base tracking-tight text-white">
                      CURYO (BETA)
                    </span>
                    <span className="truncate text-base-content/60" style={{ fontSize: "14px" }}>
                      Public Ratings
                    </span>
                  </div>
                </Link>
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
                <RainbowKitCustomConnectButton />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Desktop: left sidebar */}
      <aside className="hidden xl:flex fixed left-0 top-0 z-20 h-screen w-60 flex-col items-stretch py-4 border-r border-white/8 bg-[linear-gradient(180deg,rgba(18,22,34,0.98),rgba(10,12,20,0.96))] shadow-[18px_0_48px_rgba(0,0,0,0.22)] backdrop-blur-xl shrink-0">
        <Link href="/" className="flex flex-row items-center gap-2 px-4 mb-4 shrink-0">
          <CuryoLogo className="w-8 h-8 shrink-0" />
          <div className="flex flex-col gap-0.5 items-start">
            <span className="font-heading font-semibold text-base tracking-tight text-white">CURYO (BETA)</span>
            <span className="text-base-content/60" style={{ fontSize: "14px" }}>
              Public Ratings
            </span>
          </div>
        </Link>
        <div className="w-full min-w-0 px-3 mb-4">
          <Suspense>
            <HeaderSearchBar className="sidebar" />
          </Suspense>
        </div>
        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
          <ul className="menu menu-vertical p-0 gap-0.5 w-full">
            {menuLinks.map(({ label, href, icon: Icon, color }) => {
              const isActive = pathname.startsWith(href);
              const isDocs = href === "/docs";
              const isDocsPage = pathname.startsWith("/docs");

              // If we're on docs page, show Docs as header with submenu, otherwise show as regular link
              if (isDocs && isDocsPage) {
                return (
                  <li key={href} className="w-full">
                    {/* Docs header */}
                    <Link
                      href={href}
                      className="flex items-center justify-start gap-3 px-4 py-3 mb-2 rounded-2xl border border-white/6 bg-white/[0.02] transition-colors hover:bg-white/[0.05]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03]">
                        <Icon className="w-5 h-5 shrink-0" style={{ color }} />
                      </span>
                      <span className="text-base font-medium" style={{ color }}>
                        Docs
                      </span>
                    </Link>
                    {/* Docs submenu - single column, explicitly block layout */}
                    <div className="flex flex-col space-y-4 w-full">
                      {DOCS_NAV.map(group => (
                        <div key={group.section} className="w-full flex flex-col">
                          <h3 className="text-base font-semibold uppercase tracking-wider text-base-content/40 mb-1.5 px-3 w-full">
                            {group.section}
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
                                      ? "border border-white/10 bg-white/[0.07] text-white font-medium"
                                      : "text-base-content/60 hover:text-base-content hover:bg-white/[0.04]"
                                  }`}
                                >
                                  {link.label}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              }

              // Regular menu items
              return (
                <li key={href} className="w-full">
                  <Link
                    href={href}
                    className={`flex items-center justify-start gap-3 px-4 py-3 rounded-2xl border transition-colors ${
                      isActive
                        ? "border-white/10 bg-white/[0.07] text-white shadow-[0_18px_36px_rgba(0,0,0,0.22)]"
                        : "border-transparent text-base-content/60 hover:border-white/6 hover:text-base-content hover:bg-white/[0.04]"
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                        isActive ? "border-white/12 bg-white/[0.05]" : "border-white/6 bg-white/[0.02]"
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" style={{ color }} />
                    </span>
                    <span className={isActive ? "text-white" : ""}>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex flex-col items-stretch gap-2 pt-4 border-t border-base-300 mt-auto shrink-0 w-full px-3">
          <div className="w-full flex justify-stretch">
            <RainbowKitCustomConnectButton inlineMenu />
          </div>
        </div>
      </aside>
    </>
  );
};
