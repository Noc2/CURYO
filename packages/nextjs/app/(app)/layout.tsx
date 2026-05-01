import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ScaffoldEthAppWithProviders>
      <main id="main-content" className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden">
        {children}
      </main>
    </ScaffoldEthAppWithProviders>
  );
}
