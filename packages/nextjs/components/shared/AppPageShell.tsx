import type { ReactNode } from "react";

type AppPageShellProps = {
  children: ReactNode;
  outerClassName?: string;
  contentClassName?: string;
  paddingTopClassName?: string;
};

export function AppPageShell({
  children,
  outerClassName = "",
  contentClassName = "",
  paddingTopClassName = "pt-4",
}: AppPageShellProps) {
  return (
    <div className={`flex grow flex-col items-center px-4 ${paddingTopClassName} ${outerClassName}`.trim()}>
      <div className={`w-full max-w-5xl ${contentClassName}`.trim()}>{children}</div>
    </div>
  );
}
