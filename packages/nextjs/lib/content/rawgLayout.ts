export function shouldFillRawgMediaSurface(compact?: boolean, fillMediaSurface = false) {
  return fillMediaSurface || !compact;
}
