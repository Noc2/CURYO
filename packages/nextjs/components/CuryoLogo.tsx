import { CuryoBrandMark } from "~~/components/brand/CuryoBrandMark";

/**
 * Shared Curyo logo wrapper.
 */
export function CuryoLogo({ className = "h-8 w-8", idPrefix }: { className?: string; idPrefix?: string }) {
  return <CuryoBrandMark className={className} idPrefix={idPrefix} title="Curyo logo" variant="compact" />;
}
