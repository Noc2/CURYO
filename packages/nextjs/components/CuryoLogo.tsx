import { CuryoLighthouseMark } from "~~/components/brand/CuryoLighthouseMark";

/**
 * Shared Curyo logo wrapper.
 */
export function CuryoLogo({ className = "h-8 w-8" }: { className?: string }) {
  return <CuryoLighthouseMark className={className} title="Curyo logo" />;
}
