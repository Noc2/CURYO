import { useId } from "react";

type ArrowDirection = "up" | "down";
type RingPalette = "brand" | "positive" | "negative";

interface CuryoRingMarkProps {
  className?: string;
  arrow?: ArrowDirection;
  palette?: RingPalette;
  animate?: boolean;
  animateMask?: boolean;
  animateColors?: boolean;
  title?: string;
  maskDurationSeconds?: number;
  colorDurationSeconds?: number;
}

const CENTER = 64;
const OUTER_RADIUS = 46;
const INNER_RADIUS = 41.5;
const INNER_OFFSET = 3.5;
const ROTATION = -22.5;
const ARC_STROKE = 18;

const ARC_TOP_RIGHT = "M64 18 A46 46 0 0 1 110 64";
const ARC_BOTTOM_RIGHT = "M110 64 A46 46 0 0 1 64 110";
const ARC_BOTTOM_LEFT = "M64 110 A46 46 0 0 1 18 64";
const ARC_TOP_LEFT = "M18 64 A46 46 0 0 1 64 18";

function ArrowGlyph({ direction }: { direction: ArrowDirection }) {
  return (
    <path
      d={direction === "up" ? "M64 44 L53 67 L75 67 Z" : "M64 84 L53 61 L75 61 Z"}
      fill="none"
      stroke="white"
      strokeWidth="4.25"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

export function CuryoRingMark({
  className = "h-8 w-8",
  arrow,
  palette = "brand",
  animate = false,
  animateMask,
  animateColors,
  title,
  maskDurationSeconds = 18,
  colorDurationSeconds = 24,
}: CuryoRingMarkProps) {
  const id = useId();
  const topRightGradientId = `${id}-ring-top-right`;
  const bottomRightGradientId = `${id}-ring-bottom-right`;
  const bottomLeftGradientId = `${id}-ring-bottom-left`;
  const topLeftGradientId = `${id}-ring-top-left`;
  const maskId = `${id}-ring-mask`;

  const shouldAnimateMask = animateMask ?? animate;
  const shouldAnimateColors = palette === "brand" ? (animateColors ?? animate) : false;

  const paletteStops =
    palette === "positive"
      ? {
          topRight: ["#03CEA4", "#03CEA4"],
          bottomRight: ["#03CEA4", "#03CEA4"],
          bottomLeft: ["#03CEA4", "#03CEA4"],
          topLeft: ["#03CEA4", "#03CEA4"],
        }
      : palette === "negative"
        ? {
            topRight: ["#EF476F", "#EF476F"],
            bottomRight: ["#EF476F", "#EF476F"],
            bottomLeft: ["#EF476F", "#EF476F"],
            topLeft: ["#EF476F", "#EF476F"],
          }
        : {
            topRight: ["#FFC43D", "#EF476F"],
            bottomRight: ["#EF476F", "#359EEE"],
            bottomLeft: ["#359EEE", "#03CEA4"],
            topLeft: ["#03CEA4", "#FFC43D"],
          };

  const maskValues = `${ROTATION} ${CENTER} ${CENTER}; ${ROTATION + 360} ${CENTER} ${CENTER}`;
  const colorValues = `${ROTATION} ${CENTER} ${CENTER}; ${ROTATION - 360} ${CENTER} ${CENTER}`;

  return (
    <svg
      className={className}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}

      <defs>
        <linearGradient id={topRightGradientId} x1="64" y1="18" x2="110" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={paletteStops.topRight[0]} />
          <stop offset="1" stopColor={paletteStops.topRight[1]} />
        </linearGradient>
        <linearGradient id={bottomRightGradientId} x1="110" y1="64" x2="64" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={paletteStops.bottomRight[0]} />
          <stop offset="1" stopColor={paletteStops.bottomRight[1]} />
        </linearGradient>
        <linearGradient id={bottomLeftGradientId} x1="64" y1="110" x2="18" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={paletteStops.bottomLeft[0]} />
          <stop offset="1" stopColor={paletteStops.bottomLeft[1]} />
        </linearGradient>
        <linearGradient id={topLeftGradientId} x1="18" y1="64" x2="64" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={paletteStops.topLeft[0]} />
          <stop offset="1" stopColor={paletteStops.topLeft[1]} />
        </linearGradient>

        <mask id={maskId}>
          <rect width="128" height="128" fill="black" />
          <g transform={`rotate(${ROTATION} ${CENTER} ${CENTER})`}>
            {shouldAnimateMask ? (
              <animateTransform
                attributeName="transform"
                type="rotate"
                values={maskValues}
                dur={`${maskDurationSeconds}s`}
                repeatCount="indefinite"
              />
            ) : null}
            <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS} fill="white" />
            <circle cx={CENTER} cy={CENTER - INNER_OFFSET} r={INNER_RADIUS} fill="black" />
          </g>
        </mask>
      </defs>

      <g mask={`url(#${maskId})`} transform={`rotate(${ROTATION} ${CENTER} ${CENTER})`}>
        {shouldAnimateColors ? (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values={colorValues}
            dur={`${colorDurationSeconds}s`}
            repeatCount="indefinite"
          />
        ) : null}
        <path d={ARC_TOP_RIGHT} stroke={`url(#${topRightGradientId})`} strokeWidth={ARC_STROKE} strokeLinecap="round" />
        <path
          d={ARC_BOTTOM_RIGHT}
          stroke={`url(#${bottomRightGradientId})`}
          strokeWidth={ARC_STROKE}
          strokeLinecap="round"
        />
        <path
          d={ARC_BOTTOM_LEFT}
          stroke={`url(#${bottomLeftGradientId})`}
          strokeWidth={ARC_STROKE}
          strokeLinecap="round"
        />
        <path d={ARC_TOP_LEFT} stroke={`url(#${topLeftGradientId})`} strokeWidth={ARC_STROKE} strokeLinecap="round" />
      </g>

      {arrow ? <ArrowGlyph direction={arrow} /> : null}
    </svg>
  );
}
