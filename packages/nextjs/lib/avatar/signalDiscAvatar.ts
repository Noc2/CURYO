import type { ReputationAvatarPayload } from "~~/lib/avatar/avatarPayload";

interface Point {
  x: number;
  y: number;
}

interface SignalDiscAvatarCore {
  radius: number;
  color: string;
  edgeColor: string;
}

interface SignalDiscAvatarProgress {
  radius: number;
  sweepDegrees: number;
  startDegrees: number;
  width: number;
  opacity: number;
}

interface SignalDiscAvatarModel {
  badgeRadius: number;
  core: SignalDiscAvatarCore;
  progress: SignalDiscAvatarProgress | null;
}

const VIEWBOX_SIZE = 512;
const CENTER = VIEWBOX_SIZE / 2;
const BADGE_RADIUS = 245;
const RAIL_RADIUS = 197;
const RAIL_WIDTH = 38;
const CORE_RADIUS = 138;
const ACCURACY_START_DEGREES = -48;
const CONFIDENCE_SETTLED_VOTES = 25;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((h % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 1) {
    r = c;
    g = x;
  } else if (h < 2) {
    r = x;
    g = c;
  } else if (h < 3) {
    g = c;
    b = x;
  } else if (h < 4) {
    g = x;
    b = c;
  } else if (h < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const m = l - c / 2;
  const toHex = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number) {
  const rUnit = r / 255;
  const gUnit = g / 255;
  const bUnit = b / 255;
  const max = Math.max(rUnit, gUnit, bUnit);
  const min = Math.min(rUnit, gUnit, bUnit);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === rUnit) {
      hue = ((gUnit - bUnit) / delta) % 6;
    } else if (max === gUnit) {
      hue = (bUnit - rUnit) / delta + 2;
    } else {
      hue = (rUnit - gUnit) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return {
    hue,
    saturation,
    lightness,
  };
}

function polarToPoint(radius: number, angleDegrees: number): Point {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  return {
    x: CENTER + Math.cos(angleRadians) * radius,
    y: CENTER + Math.sin(angleRadians) * radius,
  };
}

function describeAccuracyArcPath(radius: number, startDegrees: number, sweepDegrees: number) {
  const clampedSweep = clamp(sweepDegrees, 0, 359.9);
  const startPoint = polarToPoint(radius, startDegrees);
  const endPoint = polarToPoint(radius, startDegrees - clampedSweep);
  const largeArcFlag = clampedSweep > 180 ? 1 : 0;

  return [
    `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)}`,
    `A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArcFlag} 0 ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`,
  ].join(" ");
}

function getAddressColorSeed(address: string) {
  return address.toLowerCase().replace(/^0x/, "").slice(-6).padStart(6, "0");
}

function getPaletteSeedHex(payload: ReputationAvatarPayload) {
  const accentHex = payload.avatarAccentHex?.replace(/^#/, "").toLowerCase();
  return accentHex && /^[0-9a-f]{6}$/.test(accentHex) ? accentHex : getAddressColorSeed(payload.address);
}

function getAvatarPalette(payload: ReputationAvatarPayload) {
  const seedHex = getPaletteSeedHex(payload);
  const seedValue = Number.parseInt(seedHex, 16);
  const { r, g, b } = hexToRgb(seedHex);
  const seedHsl = rgbToHsl(r, g, b);
  const baseHue = seedHsl.saturation < 0.18 ? seedValue % 360 : seedHsl.hue;
  const saturation = clamp(Math.max(seedHsl.saturation * 100, 58), 58, 100);
  const lightness = clamp(seedHsl.lightness * 100, 45, 62);

  return {
    coreColor: hslToHex(baseHue, saturation, lightness),
    coreEdgeColor: hslToHex(baseHue, Math.max(42, saturation - 18), Math.max(30, lightness - 14)),
  };
}

function getSignalScores(payload: ReputationAvatarPayload) {
  const totalSettledVotes = payload.stats?.totalSettledVotes ?? 0;
  const accuracy = clamp(payload.stats?.winRate ?? 0, 0, 1);
  const accuracyConfidence = clamp(totalSettledVotes / CONFIDENCE_SETTLED_VOTES, 0, 1);

  return { accuracy, accuracyConfidence, totalSettledVotes };
}

function buildProgress(payload: ReputationAvatarPayload): SignalDiscAvatarProgress | null {
  const { accuracy, accuracyConfidence, totalSettledVotes } = getSignalScores(payload);
  if (totalSettledVotes <= 0 || accuracy <= 0) return null;

  return {
    radius: RAIL_RADIUS,
    sweepDegrees: accuracy * 360,
    startDegrees: ACCURACY_START_DEGREES,
    width: RAIL_WIDTH,
    opacity: 0.36 + accuracyConfidence * 0.64,
  };
}

export function buildSignalDiscAvatarModel(
  payload: ReputationAvatarPayload,
  _options?: { nowSeconds?: number },
): SignalDiscAvatarModel {
  void _options;
  const palette = getAvatarPalette(payload);

  return {
    badgeRadius: BADGE_RADIUS,
    core: {
      radius: CORE_RADIUS,
      color: palette.coreColor,
      edgeColor: palette.coreEdgeColor,
    },
    progress: buildProgress(payload),
  };
}

function renderProgress(progress: SignalDiscAvatarProgress) {
  const commonAttributes = `fill="none" stroke="#FFFFFF" stroke-width="${progress.width.toFixed(2)}" stroke-opacity="${progress.opacity.toFixed(3)}" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision"`;

  if (progress.sweepDegrees >= 360) {
    return `<circle class="signal-disc-avatar-progress" cx="${CENTER}" cy="${CENTER}" r="${progress.radius.toFixed(2)}" ${commonAttributes}/>`;
  }

  const path = describeAccuracyArcPath(progress.radius, progress.startDegrees, progress.sweepDegrees);
  return `<path class="signal-disc-avatar-progress" d="${path}" ${commonAttributes}/>`;
}

export function renderSignalDiscAvatarSvg(
  payload: ReputationAvatarPayload,
  options?: { size?: number; nowSeconds?: number },
) {
  const size = clamp(Number(options?.size ?? 96), 16, 512);
  const model = buildSignalDiscAvatarModel(payload, { nowSeconds: options?.nowSeconds });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" fill="none">
  ${model.progress ? renderProgress(model.progress) : ""}
  <circle class="signal-disc-avatar-core" cx="${CENTER}" cy="${CENTER}" r="${model.core.radius.toFixed(2)}" fill="${model.core.color}"/>
  <circle class="signal-disc-avatar-core-edge" cx="${CENTER}" cy="${CENTER}" r="${model.core.radius.toFixed(2)}" fill="none" stroke="${model.core.edgeColor}" stroke-width="7" stroke-opacity="0.32"/>
</svg>`;
}
