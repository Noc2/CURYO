export type TooltipPosition = "top" | "bottom" | "left" | "right";

interface RectLike {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface SizeLike {
  width: number;
  height: number;
}

interface TooltipPlacementInput {
  triggerRect: RectLike;
  tooltipSize: SizeLike;
  preferredPosition: TooltipPosition;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
  gap?: number;
  arrowSize?: number;
}

export interface TooltipPlacement {
  position: TooltipPosition;
  left: number;
  top: number;
  arrowLeft: number;
  arrowTop: number;
}

const DEFAULT_VIEWPORT_MARGIN = 8;
const DEFAULT_TOOLTIP_GAP = 10;
const DEFAULT_ARROW_SIZE = 8;
const ARROW_EDGE_PADDING = 12;

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function oppositePosition(position: TooltipPosition): TooltipPosition {
  switch (position) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

function uniquePositions(positions: TooltipPosition[]) {
  return positions.filter((position, index) => positions.indexOf(position) === index);
}

function buildCandidate(
  position: TooltipPosition,
  triggerRect: RectLike,
  tooltipSize: SizeLike,
  viewportWidth: number,
  viewportHeight: number,
  margin: number,
  gap: number,
) {
  const centerX = triggerRect.left + triggerRect.width / 2;
  const centerY = triggerRect.top + triggerRect.height / 2;
  const maxLeft = viewportWidth - margin - tooltipSize.width;
  const maxTop = viewportHeight - margin - tooltipSize.height;

  switch (position) {
    case "top": {
      const top = triggerRect.top - tooltipSize.height - gap;
      const left = clamp(centerX - tooltipSize.width / 2, margin, maxLeft);
      return { position, top, left, fits: top >= margin };
    }
    case "bottom": {
      const top = triggerRect.bottom + gap;
      const left = clamp(centerX - tooltipSize.width / 2, margin, maxLeft);
      return { position, top, left, fits: top + tooltipSize.height <= viewportHeight - margin };
    }
    case "left": {
      const left = triggerRect.left - tooltipSize.width - gap;
      const top = clamp(centerY - tooltipSize.height / 2, margin, maxTop);
      return { position, top, left, fits: left >= margin };
    }
    case "right": {
      const left = triggerRect.right + gap;
      const top = clamp(centerY - tooltipSize.height / 2, margin, maxTop);
      return { position, top, left, fits: left + tooltipSize.width <= viewportWidth - margin };
    }
  }
}

export function computeTooltipPlacement({
  triggerRect,
  tooltipSize,
  preferredPosition,
  viewportWidth,
  viewportHeight,
  margin = DEFAULT_VIEWPORT_MARGIN,
  gap = DEFAULT_TOOLTIP_GAP,
  arrowSize = DEFAULT_ARROW_SIZE,
}: TooltipPlacementInput): TooltipPlacement {
  const positions = uniquePositions([
    preferredPosition,
    oppositePosition(preferredPosition),
    "top",
    "bottom",
    "right",
    "left",
  ]);

  const candidate =
    positions
      .map(position => buildCandidate(position, triggerRect, tooltipSize, viewportWidth, viewportHeight, margin, gap))
      .find(option => option.fits) ??
    (() => {
      const fallback = buildCandidate(
        preferredPosition,
        triggerRect,
        tooltipSize,
        viewportWidth,
        viewportHeight,
        margin,
        gap,
      );

      return {
        position: fallback.position,
        left: clamp(fallback.left, margin, viewportWidth - margin - tooltipSize.width),
        top: clamp(fallback.top, margin, viewportHeight - margin - tooltipSize.height),
      };
    })();

  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  const triggerCenterY = triggerRect.top + triggerRect.height / 2;

  if (candidate.position === "top" || candidate.position === "bottom") {
    return {
      position: candidate.position,
      left: candidate.left,
      top: candidate.top,
      arrowLeft: clamp(
        triggerCenterX - candidate.left - arrowSize / 2,
        ARROW_EDGE_PADDING,
        tooltipSize.width - ARROW_EDGE_PADDING - arrowSize,
      ),
      arrowTop: candidate.position === "bottom" ? -arrowSize / 2 : tooltipSize.height - arrowSize / 2,
    };
  }

  return {
    position: candidate.position,
    left: candidate.left,
    top: candidate.top,
    arrowLeft: candidate.position === "right" ? -arrowSize / 2 : tooltipSize.width - arrowSize / 2,
    arrowTop: clamp(
      triggerCenterY - candidate.top - arrowSize / 2,
      ARROW_EDGE_PADDING,
      tooltipSize.height - ARROW_EDGE_PADDING - arrowSize,
    ),
  };
}
