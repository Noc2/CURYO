"use client";

import type { ReactNode } from "react";
import { sanitizeExternalUrl } from "~~/utils/externalUrl";

interface SafeExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  rel?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
}

export function SafeExternalLink({ href, children, className, rel, target }: SafeExternalLinkProps) {
  const safeHref = sanitizeExternalUrl(href);

  if (!safeHref) {
    return <div className={className}>{children}</div>;
  }

  return (
    <a className={className} href={safeHref} rel={rel ?? "noopener noreferrer"} target={target ?? "_blank"}>
      {children}
    </a>
  );
}
