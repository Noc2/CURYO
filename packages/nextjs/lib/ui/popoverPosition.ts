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

interface PopoverPlacementInput {
  triggerRect: RectLike;
  popoverSize: SizeLike;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
  gap?: number;
}

export interface PopoverPlacement {
  left: number;
  top: number;
  maxHeight: number;
  position: "top" | "bottom";
}

const DEFAULT_VIEWPORT_MARGIN = 8;
const DEFAULT_POPOVER_GAP = 8;

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function computePopoverPlacement({
  triggerRect,
  popoverSize,
  viewportWidth,
  viewportHeight,
  margin = DEFAULT_VIEWPORT_MARGIN,
  gap = DEFAULT_POPOVER_GAP,
}: PopoverPlacementInput): PopoverPlacement {
  const maxLeft = viewportWidth - margin - popoverSize.width;
  const left = clamp(triggerRect.left, margin, maxLeft);
  const fitsBelow = triggerRect.bottom + gap + popoverSize.height <= viewportHeight - margin;
  const fitsAbove = triggerRect.top - gap - popoverSize.height >= margin;

  if (fitsBelow || !fitsAbove) {
    const top = clamp(triggerRect.bottom + gap, margin, viewportHeight - margin - popoverSize.height);
    return {
      left,
      top,
      maxHeight: Math.max(viewportHeight - top - margin, 0),
      position: "bottom",
    };
  }

  const top = clamp(triggerRect.top - gap - popoverSize.height, margin, viewportHeight - margin - popoverSize.height);
  return {
    left,
    top,
    maxHeight: Math.max(triggerRect.top - gap - margin, 0),
    position: "top",
  };
}
