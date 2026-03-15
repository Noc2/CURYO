import type { ComponentPropsWithoutRef } from "react";

type OrbitalNavIconProps = ComponentPropsWithoutRef<"svg">;

function OrbitalIconFrame({ className = "h-6 w-6", children, ...props }: OrbitalNavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function DiscoverNavIcon(props: OrbitalNavIconProps) {
  return (
    <OrbitalIconFrame {...props}>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="8" ry="4.25" stroke="currentColor" strokeWidth="1.6" transform="rotate(-18 12 12)" />
      <circle cx="18.4" cy="9.1" r="1.45" fill="currentColor" />
    </OrbitalIconFrame>
  );
}

export function SubmitNavIcon(props: OrbitalNavIconProps) {
  return (
    <OrbitalIconFrame {...props}>
      <path d="M6.2 15.6c1.7-4.1 5.4-7 9.8-7.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="15.6" cy="8.1" r="1.5" fill="currentColor" />
      <circle cx="10.5" cy="14" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 11.6v4.8M8.1 14h4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </OrbitalIconFrame>
  );
}

export function CrepNavIcon(props: OrbitalNavIconProps) {
  return (
    <OrbitalIconFrame {...props}>
      <circle cx="12" cy="12" r="4.8" stroke="currentColor" strokeWidth="1.6" />
      <ellipse
        cx="12"
        cy="12"
        rx="8.9"
        ry="3.3"
        stroke="currentColor"
        strokeWidth="1.6"
        transform="rotate(-16 12 12)"
      />
      <path d="M4.8 13.7c2.3.2 4.4-.3 6.2-1.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </OrbitalIconFrame>
  );
}

export function DocsNavIcon(props: OrbitalNavIconProps) {
  return (
    <OrbitalIconFrame {...props}>
      <path
        d="M8 5.8h5.7l2.3 2.2v10.2H8.8c-1 0-1.8-.8-1.8-1.8V7.6C7 6.6 7.6 5.8 8 5.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M13.7 5.8v2.6H16" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.8 11.2h3.9M9.8 14.1h3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17.7" cy="7.1" r="1.2" fill="currentColor" />
    </OrbitalIconFrame>
  );
}
