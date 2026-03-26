import type { ReactNode } from "react";

type AppPageShellProps = {
  children: ReactNode;
  outerClassName?: string;
  contentClassName?: string;
};

export function AppPageShell({ children, outerClassName = "", contentClassName = "" }: AppPageShellProps) {
  return (
    <div className={`flex grow flex-col items-center px-4 pt-4 ${outerClassName}`.trim()}>
      <div className={`w-full max-w-5xl ${contentClassName}`.trim()}>{children}</div>
    </div>
  );
}
