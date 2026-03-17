import { CuryoBrandMark } from "~~/components/brand/CuryoBrandMark";

/**
 * Shared Curyo logo wrapper.
 */
export function CuryoLogo({ className = "h-8 w-8" }: { className?: string }) {
  return <CuryoBrandMark className={className} title="Curyo logo" variant="compact" />;
}
