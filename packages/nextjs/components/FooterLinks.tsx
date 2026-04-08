import { Fragment } from "react";
import Link from "next/link";

type FooterLinkItem =
  | {
      href: string;
      label: string;
      external?: false;
    }
  | {
      href: string;
      label: string;
      external: true;
    };

type FooterLinksProps = {
  className?: string;
  listClassName?: string;
  linkClassName?: string;
  separatorClassName?: string;
};

const FOOTER_LINKS: FooterLinkItem[] = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/imprint", label: "Imprint" },
  { href: "https://github.com/Noc2/CURYO", label: "GitHub", external: true },
];

export function FooterLinks({
  className = "",
  listClassName = "",
  linkClassName = "link link-hover",
  separatorClassName = "text-base-content/40",
}: FooterLinksProps) {
  return (
    <nav aria-label="Footer" className={className}>
      <ul className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${listClassName}`.trim()}>
        {FOOTER_LINKS.map((item, index) => {
          const separator =
            index < FOOTER_LINKS.length - 1 ? (
              <li key={`${item.label}-separator`} aria-hidden="true" className={separatorClassName}>
                ·
              </li>
            ) : null;

          return (
            <Fragment key={item.label}>
              <li>
                {item.external ? (
                  <a href={item.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                    {item.label}
                  </a>
                ) : (
                  <Link href={item.href} className={linkClassName}>
                    {item.label}
                  </Link>
                )}
              </li>
              {separator}
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
