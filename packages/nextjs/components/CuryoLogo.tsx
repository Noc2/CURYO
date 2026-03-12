import { CuryoRingMark } from "~~/components/brand/CuryoRingMark";

/**
 * Shared Curyo logo wrapper.
 */
export function CuryoLogo({ className = "h-8 w-8" }: { className?: string }) {
  return <CuryoRingMark className={className} title="Curyo logo" />;
}
