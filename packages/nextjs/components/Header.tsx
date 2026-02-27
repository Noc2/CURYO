"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Address } from "viem";
import { useAccount } from "wagmi";
import {
  Bars3Icon,
  BookOpenIcon,
  GlobeAltIcon,
  IdentificationIcon,
  MagnifyingGlassIcon,
  PlusCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CrepNavBadge } from "~~/components/CrepNavBadge";
import { CuryoLogo } from "~~/components/CuryoLogo";
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
  { label: "Discover", href: "/vote", icon: GlobeAltIcon, color: "#359EEE" },
  { label: "Submit", href: "/submit", icon: PlusCircleIcon, color: "#03CEA4" },
  { label: "cREP", href: "/governance", icon: IdentificationIcon, color: "#FFC43D" },
  { label: "Docs", href: "/docs", icon: BookOpenIcon, color: "#EF476F" },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();
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
                className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl hover:bg-base-200 transition-colors"
              >
                <Icon className="w-6 h-6 shrink-0" style={{ color }} />
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
                                ? "bg-[#EF476F]/10 text-[#EF476F] font-medium"
                                : "text-base-content/60 hover:text-base-content hover:bg-base-200"
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
              className={`flex items-center gap-3 px-3 py-2.5 text-base font-medium rounded-xl transition-colors ${
                isActive ? "bg-base-content/5" : "text-base-content/60 hover:text-base-content hover:bg-base-200"
              }`}
            >
              <Icon className="w-6 h-6 shrink-0" style={{ color }} />
              <span className={isActive ? "text-white" : ""}>{label}</span>
              {label === "cREP" && <CrepNavBadge />}
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

const HeaderSearchBar = ({ className }: { className?: string }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [inputValue, setInputValue] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setInputValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  const updateSearch = useCallback(
    (value: string) => {
      setInputValue(value);
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      const queryString = params.toString();
      const target = `/vote${queryString ? `?${queryString}` : ""}`;

      if (pathname === "/vote") {
        router.replace(target, { scroll: false });
      } else {
        router.push(target);
      }
    },
    [router, pathname, searchParams],
  );

  const clearSearch = useCallback(() => {
    setInputValue("");
    if (pathname === "/vote") {
      router.replace("/vote", { scroll: false });
    }
  }, [router, pathname]);

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
        className={`input input-sm input-bordered pl-8 pr-7 bg-base-200/50 focus:bg-base-100 text-base ${
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

/**
 * Left-side vertical navbar (TikTok-style). Desktop: fixed sidebar; mobile: top bar with burger.
 */
export const Header = () => {
  const pathname = usePathname();

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <>
      {/* Mobile: top bar */}
      <div className="xl:hidden sticky top-0 z-20">
        <div className="navbar min-h-0 shrink-0 justify-between px-4 sm:px-6 py-3 bg-base-200 backdrop-blur-lg border-b border-base-200">
          <div className="flex items-center gap-2">
            <details className="dropdown" ref={burgerMenuRef}>
              <summary className="btn btn-ghost btn-sm hover:bg-transparent p-1" aria-label="Open menu">
                <Bars3Icon className="h-5 w-5" />
              </summary>
              <ul
                className="menu menu-compact dropdown-content mt-3 p-2 bg-base-200 rounded-xl w-64 shadow-lg border border-base-content/5"
                onClick={() => burgerMenuRef?.current?.removeAttribute("open")}
              >
                <Suspense>
                  <MobileMenuLinks />
                </Suspense>
              </ul>
            </details>
            <Link href="/" className="flex items-center gap-2">
              <CuryoLogo className="w-7 h-7 shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="font-heading font-semibold text-base tracking-tight text-white">CURYO (BETA)</span>
                <span className="text-base-content/60" style={{ fontSize: "14px" }}>
                  Reputation Game
                </span>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Suspense>
              <HeaderSearchBar />
            </Suspense>
            <RainbowKitCustomConnectButton />
          </div>
        </div>
      </div>

      {/* Desktop: left sidebar */}
      <aside className="hidden xl:flex fixed left-0 top-0 z-20 h-screen w-56 flex-col items-stretch py-4 bg-base-200 border-r border-base-200 shrink-0">
        <Link href="/" className="flex flex-row items-center gap-2 px-4 mb-4 shrink-0">
          <CuryoLogo className="w-8 h-8 shrink-0" />
          <div className="flex flex-col gap-0.5 items-start">
            <span className="font-heading font-semibold text-base tracking-tight text-white">CURYO (BETA)</span>
            <span className="text-base-content/60" style={{ fontSize: "14px" }}>
              Reputation Game
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
                      className="flex items-center justify-start gap-3 px-4 py-3 mb-2 rounded-xl hover:bg-base-200 transition-colors"
                    >
                      <Icon className="w-6 h-6 shrink-0" style={{ color }} />
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
                                      ? "bg-[#EF476F]/10 text-[#EF476F] font-medium"
                                      : "text-base-content/60 hover:text-base-content hover:bg-base-200"
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
                    className={`flex items-center justify-start gap-3 px-4 py-3 rounded-xl transition-colors ${
                      isActive ? "bg-base-content/5" : "text-base-content/60 hover:text-base-content hover:bg-base-200"
                    }`}
                  >
                    <Icon className="w-6 h-6 shrink-0" style={{ color }} />
                    <span className={isActive ? "text-white" : ""}>{label}</span>
                    {label === "cREP" && <CrepNavBadge />}
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
