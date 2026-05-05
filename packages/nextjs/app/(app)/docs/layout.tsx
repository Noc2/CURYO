import { AppPageShell } from "~~/components/shared/AppPageShell";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <AppPageShell contentClassName="docs-prose">{children}</AppPageShell>;
}
