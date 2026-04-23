import Image from "next/image";

/**
 * Shared Curyo logo wrapper.
 */
export function CuryoLogo({ className = "h-8 w-8", idPrefix }: { className?: string; idPrefix?: string }) {
  void idPrefix;

  return (
    <Image src="/favicon.png" alt="" aria-hidden="true" width={512} height={512} className={className} sizes="36px" />
  );
}
