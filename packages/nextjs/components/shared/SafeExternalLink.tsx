"use client";

import React, { type MouseEventHandler, type ReactNode, createContext, useContext } from "react";
import { sanitizeExternalUrl } from "~~/utils/externalUrl";

const ExternalLinkBehaviorContext = createContext({ disableNavigation: false });

interface SafeExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  rel?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  title?: string;
  ariaLabel?: string;
  allowExternalOpen?: boolean;
  testId?: string;
  onClick?: MouseEventHandler<HTMLElement>;
}

export function ExternalLinkBehaviorProvider({
  disableNavigation = false,
  children,
}: {
  disableNavigation?: boolean;
  children: ReactNode;
}) {
  return (
    <ExternalLinkBehaviorContext.Provider value={{ disableNavigation }}>
      {children}
    </ExternalLinkBehaviorContext.Provider>
  );
}

function useExternalLinkBehavior() {
  return useContext(ExternalLinkBehaviorContext);
}

export function SafeExternalLink({
  href,
  children,
  className,
  rel,
  target,
  title,
  ariaLabel,
  allowExternalOpen = false,
  testId,
  onClick,
}: SafeExternalLinkProps) {
  const safeHref = sanitizeExternalUrl(href);
  const { disableNavigation } = useExternalLinkBehavior();

  if (!safeHref) {
    return <div className={className}>{children}</div>;
  }

  if (disableNavigation) {
    return (
      <button
        type="button"
        className={`appearance-none border-0 bg-transparent p-0 font-inherit text-left text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
          className ?? ""
        }`.trim()}
        title={title}
        aria-label={ariaLabel}
        data-content-intent-surface="true"
        data-external-href={safeHref}
        data-testid={testId}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }

  return (
    <a
      className={className}
      href={safeHref}
      rel={rel ?? "noopener noreferrer"}
      target={target ?? "_blank"}
      title={title}
      aria-label={ariaLabel}
      data-allow-external-open={allowExternalOpen ? "true" : undefined}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
