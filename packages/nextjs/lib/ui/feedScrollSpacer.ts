interface EndSpacerHeightInput {
  scrollerHeight: number;
  lastCardHeight: number;
  reservedEndSpace?: number;
  topSnapGuard?: number;
}

export function resolveEndSpacerHeightForLastCardSnap({
  scrollerHeight,
  lastCardHeight,
  reservedEndSpace = 0,
  topSnapGuard = 0,
}: EndSpacerHeightInput) {
  const requiredEndSpace = Math.max(0, Math.ceil(scrollerHeight) - Math.ceil(lastCardHeight) - Math.ceil(topSnapGuard));

  return Math.max(0, requiredEndSpace - Math.ceil(reservedEndSpace));
}
