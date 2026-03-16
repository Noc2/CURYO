import { CuryoPlanetMark } from "~~/components/brand/CuryoPlanetMark";

/**
 * Shared Curyo logo wrapper.
 */
export function CuryoLogo({ className = "h-8 w-8" }: { className?: string }) {
  return <CuryoPlanetMark className={className} title="Curyo logo" variant="compact" />;
}
