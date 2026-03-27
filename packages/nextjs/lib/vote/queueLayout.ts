export interface VoteQueueLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  containerWidth: number;
  availableHeight: number;
  rootFontSize: number;
}

export interface VoteQueueLayout {
  rows: 0 | 1 | 2 | 3;
  columns: number;
  pageSize: number;
  cardWidthPx: number;
  gapPx: number;
}

const QUEUE_CARD_WIDTH_REM = {
  base: 11.1,
  sm: 11.35,
  xl: 11.8,
} as const;

const QUEUE_GAP_PX = {
  base: 12,
  xl: 10,
} as const;

const DESKTOP_QUEUE_MIN_VIEWPORT_WIDTH_PX = 1024;
const TWO_ROW_MIN_COLUMNS = 4;
const THREE_ROW_MIN_COLUMNS = 5;
const MULTI_ROW_MAX_COLUMNS = 5;
const QUEUE_CARD_BODY_MIN_HEIGHT_REM = 5.5;
const SINGLE_ROW_EXTRA_CLEARANCE_PX = 28;
const TWO_ROW_EXTRA_CLEARANCE_PX = 16;
const THREE_ROW_EXTRA_CLEARANCE_PX = 20;

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
  const cardThumbnailHeightPx = cardWidthPx * (9 / 16);
  const cardBodyHeightPx = QUEUE_CARD_BODY_MIN_HEIGHT_REM * rootFontSize;
  const cardHeightPx = cardThumbnailHeightPx + cardBodyHeightPx;
  const requiredSingleRowHeight = cardHeightPx + SINGLE_ROW_EXTRA_CLEARANCE_PX;
  const requiredTwoRowHeight = cardHeightPx * 2 + gapPx + TWO_ROW_EXTRA_CLEARANCE_PX;
  const requiredThreeRowHeight = cardHeightPx * 3 + gapPx * 2 + THREE_ROW_EXTRA_CLEARANCE_PX;

  if (viewportWidth < DESKTOP_QUEUE_MIN_VIEWPORT_WIDTH_PX) {
    return {
      rows: 1,
      columns: Math.max(1, maxColumnsThatFit),
      pageSize: Math.max(1, maxColumnsThatFit),
      cardWidthPx,
      gapPx,
    };
  }

  if (availableHeight < requiredSingleRowHeight) {
    return {
      rows: 0,
      columns: Math.max(1, maxColumnsThatFit),
      pageSize: 0,
      cardWidthPx,
      gapPx,
    };
  }

  const supportsThreeRows = maxColumnsThatFit >= THREE_ROW_MIN_COLUMNS && availableHeight >= requiredThreeRowHeight;
  if (supportsThreeRows) {
    const columns = Math.max(THREE_ROW_MIN_COLUMNS, Math.min(maxColumnsThatFit, MULTI_ROW_MAX_COLUMNS));
    return {
      rows: 3,
      columns,
      pageSize: columns * 3,
      cardWidthPx,
      gapPx,
    };
  }

  const supportsTwoRows = maxColumnsThatFit >= TWO_ROW_MIN_COLUMNS && availableHeight >= requiredTwoRowHeight;

  if (!supportsTwoRows) {
    return {
      rows: 1,
      columns: Math.max(1, maxColumnsThatFit),
      pageSize: Math.max(1, maxColumnsThatFit),
      cardWidthPx,
      gapPx,
    };
  }

  const columns = Math.max(TWO_ROW_MIN_COLUMNS, Math.min(maxColumnsThatFit, MULTI_ROW_MAX_COLUMNS));
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
