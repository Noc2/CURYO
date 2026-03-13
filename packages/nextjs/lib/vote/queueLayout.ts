export interface VoteQueueLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  containerWidth: number;
  availableHeight: number;
  rootFontSize: number;
}

export interface VoteQueueLayout {
  rows: 1 | 2;
  columns: number;
  pageSize: number;
  cardWidthPx: number;
  gapPx: number;
}

const QUEUE_CARD_WIDTH_REM = {
  base: 11.5,
  sm: 12.25,
  xl: 12.75,
} as const;

const QUEUE_GAP_PX = {
  base: 12,
  xl: 10,
} as const;

const TWO_ROW_MIN_CONTAINER_WIDTH_PX = 1080;
const TWO_ROW_MIN_COLUMNS = 4;
const TWO_ROW_MAX_COLUMNS = 5;
const TWO_ROW_CARD_HEIGHT_ESTIMATE_PX = 198;
const TWO_ROW_EXTRA_CLEARANCE_PX = 24;

export function getVoteQueueCardWidthPx(viewportWidth: number, rootFontSize: number) {
  if (viewportWidth >= 1280) return QUEUE_CARD_WIDTH_REM.xl * rootFontSize;
  if (viewportWidth >= 640) return QUEUE_CARD_WIDTH_REM.sm * rootFontSize;
  return QUEUE_CARD_WIDTH_REM.base * rootFontSize;
}

export function getVoteQueueGapPx(viewportWidth: number) {
  return viewportWidth >= 1280 ? QUEUE_GAP_PX.xl : QUEUE_GAP_PX.base;
}

export function computeVoteQueueLayout({
  viewportWidth,
  containerWidth,
  availableHeight,
  rootFontSize,
}: VoteQueueLayoutInput): VoteQueueLayout {
  const cardWidthPx = getVoteQueueCardWidthPx(viewportWidth, rootFontSize);
  const gapPx = getVoteQueueGapPx(viewportWidth);
  const maxColumnsThatFit = Math.max(1, Math.floor((containerWidth + gapPx) / (cardWidthPx + gapPx)));
  const requiredTwoRowHeight = TWO_ROW_CARD_HEIGHT_ESTIMATE_PX * 2 + gapPx + TWO_ROW_EXTRA_CLEARANCE_PX;

  const supportsTwoRows =
    containerWidth >= TWO_ROW_MIN_CONTAINER_WIDTH_PX &&
    maxColumnsThatFit >= TWO_ROW_MIN_COLUMNS &&
    availableHeight >= requiredTwoRowHeight;

  if (!supportsTwoRows) {
    return {
      rows: 1,
      columns: Math.max(1, maxColumnsThatFit),
      pageSize: Math.max(1, maxColumnsThatFit),
      cardWidthPx,
      gapPx,
    };
  }

  const columns = Math.max(TWO_ROW_MIN_COLUMNS, Math.min(maxColumnsThatFit, TWO_ROW_MAX_COLUMNS));
  return {
    rows: 2,
    columns,
    pageSize: columns * 2,
    cardWidthPx,
    gapPx,
  };
}

export function chunkVoteQueueItems<T>(items: T[], pageSize: number): T[][] {
  if (pageSize <= 0 || items.length === 0) return items.length === 0 ? [] : [items];

  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }
  return pages;
}
