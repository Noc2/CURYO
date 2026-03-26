export function clampContentRating(rating: number): number {
  if (!Number.isFinite(rating)) return 0;
  return Math.min(100, Math.max(0, rating));
}

export function formatRatingScoreOutOfTen(rating: number): string {
  return (clampContentRating(rating) / 10).toFixed(1);
}

export function formatRatingOutOfTen(rating: number): string {
  return `${formatRatingScoreOutOfTen(rating)}/10`;
}

export function formatCommunityRatingAriaLabel(rating: number): string {
  return `Community rating ${formatRatingScoreOutOfTen(rating)} out of 10`;
}
