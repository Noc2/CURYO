import type { ReputationAvatarPayload } from "~~/lib/avatar/reputationConstellation";

interface Point {
  x: number;
  y: number;
}

interface OrbitalAvatarOrb extends Point {
  radius: number;
  colorA: string;
  colorB: string;
  colorC: string;
  glowColor: string;
}

interface OrbitalAvatarRing {
  radiusX: number;
  radiusY: number;
  rotation: number;
  opacity: number;
  strokeWidth: number;
  frontColor: string;
  backColor: string;
  glowColor: string;
}

interface OrbitalAvatarShell {
  radius: number;
  opacity: number;
  strokeWidth: number;
  color: string;
}

export interface OrbitalAvatarModel {
  compositionRotation: number;
  coreOrb: OrbitalAvatarOrb | null;
  shellOrbit: OrbitalAvatarShell | null;
  accuracyRing: OrbitalAvatarRing | null;
}

const VIEWBOX_SIZE = 512;
const CENTER = VIEWBOX_SIZE / 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function logScore(value: number, maxValue: number) {
  if (value <= 0) return 0;
  return clamp(Math.log10(value + 1) / Math.log10(maxValue + 1), 0, 1);
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unitHash(input: string) {
  return hashString(input) / 0xffffffff;
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

function getAddressColorSeed(address: string) {
  return address.toLowerCase().replace(/^0x/, "").slice(-6).padStart(6, "0");
}

function getSignalScores(payload: ReputationAvatarPayload) {
  const balanceCrep = Number(BigInt(payload.balance || "0")) / 1e6;
  const stats = payload.stats;

  const balanceScore = logScore(balanceCrep, 100000);
  const totalSettledVotes = stats?.totalSettledVotes ?? 0;
  const accuracyConfidence = clamp(totalSettledVotes / 25, 0, 1);
  const accuracyWinRate = stats?.winRate ?? 0;
  const accuracyScore = clamp((accuracyWinRate - 0.45) / 0.3, 0, 1) * accuracyConfidence;

  return { balanceScore, accuracyScore };
}

function getAddressVariant(address: string) {
  const hashed = (salt: string) => unitHash(`${address}:${salt}`);
  const seedHex = getAddressColorSeed(address);
  const seedValue = Number.parseInt(seedHex, 16);
  const { r, g, b } = hexToRgb(seedHex);
  const seedHsl = rgbToHsl(r, g, b);
  const hue = seedHsl.saturation < 0.18 ? seedValue % 360 : seedHsl.hue;
  const saturation = Math.max(seedHsl.saturation * 100, 64);

  return {
    compositionRotation: hashed("orb-rotation") * 360,
    ringRotation: -18 + hashed("ring-rotation") * 36,
    orbColorA: hslToHex(hue + 32, Math.min(saturation + 10, 96), 68),
    orbColorB: hslToHex(hue - 8, Math.min(saturation + 8, 94), 48),
    orbColorC: hslToHex(hue + 116, Math.min(saturation + 6, 90), 34),
    orbGlowColor: hslToHex(hue + 26, Math.min(saturation + 12, 98), 62),
    ringGlowColor: hslToHex(hue + 18, Math.min(saturation + 8, 88), 78),
  };
}

function buildCoreOrb(
  payload: ReputationAvatarPayload,
  variant: ReturnType<typeof getAddressVariant>,
): OrbitalAvatarOrb | null {
  if (!payload.voterId) return null;

  const { balanceScore } = getSignalScores(payload);
  return {
    x: CENTER,
    y: CENTER,
    radius: 96 + 30 * balanceScore,
    colorA: variant.orbColorA,
    colorB: variant.orbColorB,
    colorC: variant.orbColorC,
    glowColor: variant.orbGlowColor,
  };
}

function buildAccuracyRing(
  payload: ReputationAvatarPayload,
  coreOrb: OrbitalAvatarOrb | null,
  variant: ReturnType<typeof getAddressVariant>,
): OrbitalAvatarRing | null {
  if (!coreOrb || !payload.stats) return null;

  const { accuracyScore } = getSignalScores(payload);
  return {
    radiusX: 214 + accuracyScore * 10,
    radiusY: 90 + accuracyScore * 8,
    rotation: variant.ringRotation,
    opacity: 0.62 + accuracyScore * 0.24,
    strokeWidth: 18 + accuracyScore * 10,
    frontColor: "rgba(255,255,255,0.96)",
    backColor: "rgba(255,255,255,0.30)",
    glowColor: variant.ringGlowColor,
  };
}

function buildShellOrbit(): OrbitalAvatarShell {
  return {
    radius: 214,
    opacity: 0.18,
    strokeWidth: 18,
    color: "rgba(255,255,255,0.14)",
  };
}

export function buildOrbitalAvatarModel(
  payload: ReputationAvatarPayload,
  _options?: { nowSeconds?: number },
): OrbitalAvatarModel {
  void _options;
  const variant = getAddressVariant(payload.address);
  const coreOrb = buildCoreOrb(payload, variant);
  const accuracyRing = buildAccuracyRing(payload, coreOrb, variant);

  return {
    compositionRotation: variant.compositionRotation,
    coreOrb,
    shellOrbit: coreOrb ? null : buildShellOrbit(),
    accuracyRing,
  };
}

function renderOrbitalDefs(hashHex: string, model: OrbitalAvatarModel) {
  const defs: string[] = [];

  if (model.coreOrb) {
    defs.push(
      `<linearGradient id="orbital-avatar-body-${hashHex}" x1="0.15" y1="0.1" x2="0.85" y2="0.9" gradientUnits="objectBoundingBox" gradientTransform="rotate(${model.compositionRotation.toFixed(2)} 0.5 0.5)">
        <stop stop-color="${model.coreOrb.colorA}"/>
        <stop offset="0.52" stop-color="${model.coreOrb.colorB}"/>
        <stop offset="1" stop-color="${model.coreOrb.colorC}"/>
      </linearGradient>`,
    );
    defs.push(
      `<radialGradient id="orbital-avatar-body-glow-${hashHex}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${model.coreOrb.glowColor}" stop-opacity="0.24"/>
        <stop offset="100%" stop-color="${model.coreOrb.glowColor}" stop-opacity="0"/>
      </radialGradient>`,
    );
    defs.push(
      `<radialGradient id="orbital-avatar-highlight-${hashHex}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(0.38 0.3) scale(0.42 0.34)">
        <stop stop-color="#FFFFFF" stop-opacity="0.52"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>`,
    );
  }

  if (model.accuracyRing) {
    defs.push(
      `<radialGradient id="orbital-avatar-ring-glow-${hashHex}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${model.accuracyRing.glowColor}" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="${model.accuracyRing.glowColor}" stop-opacity="0"/>
      </radialGradient>`,
    );
    defs.push(
      `<linearGradient id="orbital-avatar-ring-front-${hashHex}" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.98"/>
        <stop offset="55%" stop-color="#F4F4F6" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#D9E1F5" stop-opacity="0.88"/>
      </linearGradient>`,
    );
    defs.push(
      `<linearGradient id="orbital-avatar-ring-back-${hashHex}" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#D9E1F5" stop-opacity="0.18"/>
      </linearGradient>`,
    );
    defs.push(
      `<clipPath id="orbital-avatar-ring-back-clip-${hashHex}">
        <rect x="0" y="0" width="${VIEWBOX_SIZE}" height="${CENTER}"/>
      </clipPath>`,
    );
    defs.push(
      `<clipPath id="orbital-avatar-ring-front-clip-${hashHex}">
        <rect x="0" y="${CENTER}" width="${VIEWBOX_SIZE}" height="${CENTER}"/>
      </clipPath>`,
    );
  }

  return defs.join("");
}

function renderShellOrbit(shellOrbit: OrbitalAvatarShell) {
  return `<circle cx="${CENTER}" cy="${CENTER}" r="${shellOrbit.radius.toFixed(2)}" fill="none" stroke="${shellOrbit.color}" stroke-width="${shellOrbit.strokeWidth.toFixed(2)}" stroke-opacity="${shellOrbit.opacity.toFixed(3)}"/>`;
}

function renderAccuracyRing(ring: OrbitalAvatarRing, hashHex: string) {
  const rotate = `rotate(${ring.rotation.toFixed(2)} ${CENTER} ${CENTER})`;

  return `
    <g transform="${rotate}">
      <ellipse cx="${CENTER}" cy="${CENTER}" rx="${ring.radiusX.toFixed(2)}" ry="${ring.radiusY.toFixed(2)}" fill="none" stroke="url(#orbital-avatar-ring-glow-${hashHex})" stroke-width="${(ring.strokeWidth * 1.42).toFixed(2)}" stroke-opacity="${Math.min(0.2, ring.opacity * 0.22).toFixed(3)}"/>
      <ellipse cx="${CENTER}" cy="${CENTER}" rx="${ring.radiusX.toFixed(2)}" ry="${ring.radiusY.toFixed(2)}" fill="none" stroke="url(#orbital-avatar-ring-back-${hashHex})" stroke-width="${ring.strokeWidth.toFixed(2)}" stroke-opacity="${(ring.opacity * 0.72).toFixed(3)}" clip-path="url(#orbital-avatar-ring-back-clip-${hashHex})" stroke-linecap="round"/>
    </g>`;
}

function renderAccuracyRingFront(ring: OrbitalAvatarRing, hashHex: string) {
  const rotate = `rotate(${ring.rotation.toFixed(2)} ${CENTER} ${CENTER})`;

  return `
    <g transform="${rotate}">
      <ellipse cx="${CENTER}" cy="${CENTER}" rx="${ring.radiusX.toFixed(2)}" ry="${ring.radiusY.toFixed(2)}" fill="none" stroke="url(#orbital-avatar-ring-front-${hashHex})" stroke-width="${ring.strokeWidth.toFixed(2)}" stroke-opacity="${ring.opacity.toFixed(3)}" clip-path="url(#orbital-avatar-ring-front-clip-${hashHex})" stroke-linecap="round"/>
    </g>`;
}

function renderCoreOrb(coreOrb: OrbitalAvatarOrb, hashHex: string) {
  return `
    <circle cx="${coreOrb.x.toFixed(2)}" cy="${coreOrb.y.toFixed(2)}" r="${(coreOrb.radius * 1.82).toFixed(2)}" fill="url(#orbital-avatar-body-glow-${hashHex})" fill-opacity="0.7"/>
    <circle cx="${coreOrb.x.toFixed(2)}" cy="${coreOrb.y.toFixed(2)}" r="${coreOrb.radius.toFixed(2)}" fill="url(#orbital-avatar-body-${hashHex})"/>
    <circle cx="${coreOrb.x.toFixed(2)}" cy="${coreOrb.y.toFixed(2)}" r="${(coreOrb.radius * 0.78).toFixed(2)}" fill="url(#orbital-avatar-highlight-${hashHex})"/>`;
}

export function renderOrbitalAvatarSvg(
  payload: ReputationAvatarPayload,
  options?: { size?: number; nowSeconds?: number },
) {
  const size = clamp(Number(options?.size ?? 96), 16, 512);
  const model = buildOrbitalAvatarModel(payload, { nowSeconds: options?.nowSeconds });
  const hashHex = hashString(payload.address).toString(16);
  const defs = renderOrbitalDefs(hashHex, model);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" fill="none">
  <defs>${defs}</defs>
  ${model.accuracyRing ? renderAccuracyRing(model.accuracyRing, hashHex) : ""}
  ${model.shellOrbit ? renderShellOrbit(model.shellOrbit) : ""}
  ${model.coreOrb ? renderCoreOrb(model.coreOrb, hashHex) : ""}
  ${model.accuracyRing ? renderAccuracyRingFront(model.accuracyRing, hashHex) : ""}
</svg>`;
}
