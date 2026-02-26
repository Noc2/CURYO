export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center grow px-4 pt-8 pb-12">
      <div className="w-full max-w-5xl docs-prose">{children}</div>
    </div>
  );
}
