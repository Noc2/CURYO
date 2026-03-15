import { CuryoOrbitalMark } from "~~/components/brand/CuryoOrbitalMark";

/**
 * Shared Curyo logo wrapper.
 */
export function CuryoLogo({ className = "h-8 w-8" }: { className?: string }) {
  return <CuryoOrbitalMark className={className} title="Curyo logo" />;
}
