import Link from "next/link";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { DOCS_NAV } from "~~/constants/docsNav";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppPageShell contentClassName="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]" horizontalPaddingClassName="px-4">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <nav
          aria-label="Documentation"
          className="flex gap-4 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {DOCS_NAV.map(group => (
            <div key={group.section} className="min-w-44 shrink-0 lg:min-w-0">
              <Link
                href={group.links[0]?.href ?? "/docs"}
                prefetch={false}
                className="mb-2 block text-xs font-semibold uppercase text-base-content/50 transition-colors hover:text-base-content/80"
              >
                {group.section}
              </Link>
              <ul className="space-y-1">
                {group.links.map(link => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      prefetch={false}
                      className="block rounded-md px-2 py-1.5 text-sm font-medium text-base-content/70 transition-colors hover:bg-base-content/[0.04] hover:text-base-content"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="docs-prose min-w-0">{children}</div>
    </AppPageShell>
  );
}
