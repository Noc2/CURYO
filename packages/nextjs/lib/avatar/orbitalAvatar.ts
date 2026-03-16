import type { ReputationAvatarPayload } from "~~/lib/avatar/avatarPayload";

interface Point {
  x: number;
  y: number;
}

interface OrbitalAvatarPlanet {
  radius: number;
  atmosphereRadius: number;
  colorA: string;
  colorB: string;
  colorC: string;
  glowColor: string;
  bandColorA: string;
  bandColorB: string;
  bandColorC: string;
  rimColor: string;
}

interface OrbitalAvatarOrbit {
  radius: number;
  trackWidth: number;
  trackOpacity: number;
  accentColor: string;
  accentOpacity: number;
}

interface OrbitalAvatarFlare {
  radius: number;
  sweepDegrees: number;
  rotationDegrees: number;
  width: number;
  glowWidth: number;
  opacity: number;
  headRadius: number;
  headAngleDegrees: number;
  startColor: string;
  middleColor: string;
  endColor: string;
  glowColor: string;
}

interface OrbitalAvatarShell {
  orbitRadii: number[];
  orbitOpacity: number;
  strokeWidth: number;
  orbitStroke: string;
  planetRadius: number;
  planetStroke: string;
}

export interface OrbitalAvatarModel {
  compositionRotation: number;
  planet: OrbitalAvatarPlanet | null;
  orbit: OrbitalAvatarOrbit | null;
  flare: OrbitalAvatarFlare | null;
  shellOrbit: OrbitalAvatarShell | null;
}

const VIEWBOX_SIZE = 512;
const CENTER = VIEWBOX_SIZE / 2;
const CREP_DECIMALS = 1e6;
const FLARE_START_ROTATION_DEGREES = -90;
const AVATAR_FLARE_WIDTH = 7.5;
const AVATAR_FLARE_GLOW_WIDTH = 15;
const AVATAR_FLARE_HEAD_RADIUS = 5.5;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function logScore(value: number, maxValue: number) {
  if (value <= 0) return 0;
  return clamp(Math.log10(value + 1) / Math.log10(maxValue + 1), 0, 1);
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
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

function polarToPoint(radius: number, angleDegrees: number): Point {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  return {
    x: CENTER + Math.cos(angleRadians) * radius,
    y: CENTER + Math.sin(angleRadians) * radius,
  };
}

function getAddressColorSeed(address: string) {
  return address.toLowerCase().replace(/^0x/, "").slice(-6).padStart(6, "0");
}

function getSignalScores(payload: ReputationAvatarPayload) {
  const balanceCrep = Number(BigInt(payload.balance || "0")) / CREP_DECIMALS;
  const stats = payload.stats;
  const balanceScore = logScore(balanceCrep, 100000);
  const totalSettledVotes = stats?.totalSettledVotes ?? 0;
  const accuracy = clamp(stats?.winRate ?? 0, 0, 1);
  const accuracyConfidence = clamp(totalSettledVotes / 25, 0, 1);

  return { balanceScore, accuracy, accuracyConfidence };
}

function getAddressVariant(address: string) {
  const seedHex = getAddressColorSeed(address);
  const seedValue = Number.parseInt(seedHex, 16);
  const { r, g, b } = hexToRgb(seedHex);
  const seedHsl = rgbToHsl(r, g, b);
  const baseHue = seedHsl.saturation < 0.18 ? seedValue % 360 : seedHsl.hue;
  const saturation = Math.max(seedHsl.saturation * 100, 70);

  return {
    compositionRotation: unitHash(`${address}:planet-rotation`) * 360,
    planetColorA: hslToHex(baseHue + 24, Math.min(saturation + 10, 98), 82),
    planetColorB: hslToHex(baseHue - 8, Math.min(saturation + 6, 94), 62),
    planetColorC: hslToHex(baseHue + 118, Math.min(saturation - 4, 88), 22),
    bandColorA: hslToHex(baseHue + 116, Math.min(saturation + 2, 92), 54),
    bandColorB: hslToHex(baseHue + 42, Math.min(saturation + 8, 98), 76),
    bandColorC: hslToHex(baseHue - 18, Math.min(saturation + 4, 95), 70),
    glowColor: hslToHex(baseHue + 18, Math.min(saturation + 12, 100), 74),
    rimColor: hslToHex(baseHue + 18, Math.min(saturation + 6, 94), 90),
    accentColor: hslToHex(baseHue + 24, Math.min(saturation + 4, 94), 78),
  };
}

function buildPlanet(
  payload: ReputationAvatarPayload,
  variant: ReturnType<typeof getAddressVariant>,
): OrbitalAvatarPlanet | null {
  if (!payload.voterId) return null;

  const { balanceScore } = getSignalScores(payload);
  const radius = 92 + 40 * balanceScore;

  return {
    radius,
    atmosphereRadius: radius + 20,
    colorA: variant.planetColorA,
    colorB: variant.planetColorB,
    colorC: variant.planetColorC,
    glowColor: variant.glowColor,
    bandColorA: variant.bandColorA,
    bandColorB: variant.bandColorB,
    bandColorC: variant.bandColorC,
    rimColor: variant.rimColor,
  };
}

function buildOrbit(
  planet: OrbitalAvatarPlanet | null,
  variant: ReturnType<typeof getAddressVariant>,
): OrbitalAvatarOrbit | null {
  if (!planet) return null;

  return {
    radius: planet.radius + 62,
    trackWidth: 16,
    trackOpacity: 0.96,
    accentColor: variant.accentColor,
    accentOpacity: 0.12,
  };
}

function buildFlare(payload: ReputationAvatarPayload, orbit: OrbitalAvatarOrbit | null): OrbitalAvatarFlare | null {
  if (!orbit || !payload.stats || payload.stats.totalSettledVotes <= 0) return null;

  const { accuracy, accuracyConfidence } = getSignalScores(payload);
  if (accuracy <= 0) return null;

  const sweepDegrees = accuracy * 360;
  return {
    radius: orbit.radius,
    sweepDegrees,
    rotationDegrees: FLARE_START_ROTATION_DEGREES,
    width: AVATAR_FLARE_WIDTH,
    glowWidth: AVATAR_FLARE_GLOW_WIDTH,
    opacity: 0.24 + accuracyConfidence * 0.76,
    headRadius: AVATAR_FLARE_HEAD_RADIUS,
    headAngleDegrees: FLARE_START_ROTATION_DEGREES + sweepDegrees,
    startColor: "#F45C4D",
    middleColor: "#FFC37A",
    endColor: "#FFF4DB",
    glowColor: "#FF8D65",
  };
}

function buildShellOrbit(): OrbitalAvatarShell {
  return {
    orbitRadii: [120, 150, 180],
    orbitOpacity: 0.18,
    strokeWidth: 12,
    orbitStroke: "rgba(255,255,255,0.14)",
    planetRadius: 96,
    planetStroke: "rgba(255,255,255,0.12)",
  };
}

export function buildOrbitalAvatarModel(
  payload: ReputationAvatarPayload,
  _options?: { nowSeconds?: number },
): OrbitalAvatarModel {
  void _options;
  const variant = getAddressVariant(payload.address);
  const planet = buildPlanet(payload, variant);
  const orbit = buildOrbit(planet, variant);
  const flare = buildFlare(payload, orbit);

  return {
    compositionRotation: variant.compositionRotation,
    planet,
    orbit,
    flare,
    shellOrbit: planet ? null : buildShellOrbit(),
  };
}

function renderOrbitTrack(orbit: OrbitalAvatarOrbit) {
  return `
    <circle cx="${CENTER}" cy="${CENTER}" r="${(orbit.radius + 26).toFixed(2)}" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-opacity="0.03"/>
    <circle cx="${CENTER}" cy="${CENTER}" r="${(orbit.radius + 12).toFixed(2)}" fill="none" stroke="${orbit.accentColor}" stroke-width="6" stroke-opacity="${orbit.accentOpacity.toFixed(3)}"/>
    <circle cx="${CENTER}" cy="${CENTER}" r="${orbit.radius.toFixed(2)}" fill="none" stroke="#1A1E28" stroke-width="${orbit.trackWidth.toFixed(2)}" stroke-opacity="${orbit.trackOpacity.toFixed(3)}"/>
    <circle cx="${CENTER}" cy="${CENTER}" r="${orbit.radius.toFixed(2)}" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-opacity="0.055"/>
    <circle cx="${CENTER}" cy="${CENTER}" r="${(orbit.radius - 12).toFixed(2)}" fill="none" stroke="#FFFFFF" stroke-width="1.2" stroke-opacity="0.032"/>
  `;
}

function renderShellOrbit(shellOrbit: OrbitalAvatarShell) {
  const shells = shellOrbit.orbitRadii
    .map((radius, index) => {
      const strokeWidth = Math.max(4, shellOrbit.strokeWidth - index * 2);
      const opacity = Math.max(0.06, shellOrbit.orbitOpacity - index * 0.04);
      return `<circle cx="${CENTER}" cy="${CENTER}" r="${radius.toFixed(2)}" fill="none" stroke="${shellOrbit.orbitStroke}" stroke-width="${strokeWidth.toFixed(2)}" stroke-opacity="${opacity.toFixed(3)}"/>`;
    })
    .join("");

  return `
    ${shells}
    <circle cx="${CENTER}" cy="${CENTER}" r="${shellOrbit.planetRadius.toFixed(2)}" fill="none" stroke="${shellOrbit.planetStroke}" stroke-width="10" stroke-opacity="0.75"/>
    <circle cx="${CENTER}" cy="${CENTER}" r="${(shellOrbit.planetRadius - 14).toFixed(2)}" fill="none" stroke="#FFFFFF" stroke-width="1.4" stroke-opacity="0.08"/>
  `;
}

function renderPlanetBands(planet: OrbitalAvatarPlanet) {
  const radius = planet.radius;
  const curves = [
    { yRatio: -0.38, bend: -0.08, width: 0.1, opacity: 0.16 },
    { yRatio: -0.1, bend: -0.05, width: 0.085, opacity: 0.12 },
    { yRatio: 0.18, bend: -0.03, width: 0.078, opacity: 0.1 },
    { yRatio: 0.46, bend: 0.04, width: 0.11, opacity: 0.09 },
  ];

  return curves
    .map(({ yRatio, bend, width, opacity }, index) => {
      const y = CENTER + radius * yRatio;
      const startX = CENTER - radius * 1.06;
      const endX = CENTER + radius * 1.06;
      const c1X = CENTER - radius * 0.58;
      const c2X = CENTER + radius * 0.18;
      const c1Y = y + radius * bend;
      const c2Y = y - radius * bend;
      const strokeWidth = radius * width;
      const stroke = index === 3 ? planet.bandColorC : "#FFFFFF";
      const strokeOpacity = index === 3 ? 0.16 : opacity;

      return `<path d="M ${startX.toFixed(2)} ${y.toFixed(2)} C ${c1X.toFixed(2)} ${c1Y.toFixed(2)}, ${c2X.toFixed(2)} ${c2Y.toFixed(2)}, ${endX.toFixed(2)} ${(y + radius * bend * 0.45).toFixed(2)}" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round" stroke-opacity="${strokeOpacity.toFixed(3)}"/>`;
    })
    .join("");
}

function renderPlanet(planet: OrbitalAvatarPlanet, hashHex: string) {
  const radius = planet.radius;

  return `
    <circle cx="${CENTER}" cy="${CENTER}" r="${planet.atmosphereRadius.toFixed(2)}" fill="url(#orbital-avatar-atmosphere-${hashHex})" fill-opacity="0.95"/>
    <circle cx="${CENTER}" cy="${CENTER}" r="${radius.toFixed(2)}" fill="url(#orbital-avatar-body-${hashHex})"/>
    <g clip-path="url(#orbital-avatar-clip-${hashHex})">
      <g filter="url(#orbital-avatar-band-blur-${hashHex})">
        <ellipse cx="${(CENTER - radius * 0.44).toFixed(2)}" cy="${(CENTER - radius * 0.3).toFixed(2)}" rx="${(radius * 0.68).toFixed(2)}" ry="${(radius * 0.46).toFixed(2)}" fill="${planet.bandColorA}" fill-opacity="0.38"/>
        <ellipse cx="${(CENTER + radius * 0.22).toFixed(2)}" cy="${(CENTER - radius * 0.46).toFixed(2)}" rx="${(radius * 0.74).toFixed(2)}" ry="${(radius * 0.48).toFixed(2)}" fill="${planet.bandColorC}" fill-opacity="0.28"/>
        <ellipse cx="${(CENTER + radius * 0.36).toFixed(2)}" cy="${(CENTER + radius * 0.14).toFixed(2)}" rx="${(radius * 0.78).toFixed(2)}" ry="${(radius * 0.46).toFixed(2)}" fill="${planet.bandColorB}" fill-opacity="0.18"/>
        <ellipse cx="${(CENTER - radius * 0.28).toFixed(2)}" cy="${(CENTER + radius * 0.52).toFixed(2)}" rx="${(radius * 0.84).toFixed(2)}" ry="${(radius * 0.52).toFixed(2)}" fill="${planet.colorC}" fill-opacity="0.44"/>
      </g>
      ${renderPlanetBands(planet)}
    </g>
    <circle cx="${CENTER}" cy="${CENTER}" r="${radius.toFixed(2)}" fill="url(#orbital-avatar-shadow-${hashHex})"/>
    <circle cx="${CENTER}" cy="${CENTER}" r="${radius.toFixed(2)}" fill="url(#orbital-avatar-highlight-${hashHex})"/>
    <circle cx="${CENTER}" cy="${CENTER}" r="${radius.toFixed(2)}" fill="none" stroke="${planet.rimColor}" stroke-width="1.6" stroke-opacity="0.16"/>
  `;
}

function buildArcStrokeAttributes(flare: OrbitalAvatarFlare) {
  if (flare.sweepDegrees >= 359.5) {
    return "";
  }

  const circumference = 2 * Math.PI * flare.radius;
  const visibleLength = circumference * (flare.sweepDegrees / 360);
  const hiddenLength = Math.max(0, circumference - visibleLength);

  return ` stroke-dasharray="${visibleLength.toFixed(2)} ${hiddenLength.toFixed(2)}"`;
}

function renderFlare(flare: OrbitalAvatarFlare, hashHex: string) {
  const arcAttributes = buildArcStrokeAttributes(flare);
  const rotation = flare.rotationDegrees.toFixed(2);
  const head = flare.sweepDegrees >= 359.5 ? null : polarToPoint(flare.radius, flare.headAngleDegrees);

  return `
    <g filter="url(#orbital-avatar-flare-blur-${hashHex})">
      <circle cx="${CENTER}" cy="${CENTER}" r="${flare.radius.toFixed(2)}" fill="none" stroke="${flare.glowColor}" stroke-width="${flare.glowWidth.toFixed(2)}" stroke-opacity="${(flare.opacity * 0.38).toFixed(3)}" stroke-linecap="round"${arcAttributes} transform="rotate(${rotation} ${CENTER} ${CENTER})"/>
    </g>
    <circle cx="${CENTER}" cy="${CENTER}" r="${flare.radius.toFixed(2)}" fill="none" stroke="#6D352A" stroke-width="${(flare.width + 2).toFixed(2)}" stroke-opacity="${(flare.opacity * 0.45).toFixed(3)}" stroke-linecap="round"${arcAttributes} transform="rotate(${rotation} ${CENTER} ${CENTER})"/>
    <circle cx="${CENTER}" cy="${CENTER}" r="${flare.radius.toFixed(2)}" fill="none" stroke="url(#orbital-avatar-flare-${hashHex})" stroke-width="${flare.width.toFixed(2)}" stroke-opacity="${flare.opacity.toFixed(3)}" stroke-linecap="round"${arcAttributes} transform="rotate(${rotation} ${CENTER} ${CENTER})"/>
    <circle cx="${CENTER}" cy="${CENTER}" r="${flare.radius.toFixed(2)}" fill="none" stroke="url(#orbital-avatar-flare-core-${hashHex})" stroke-width="${Math.max(2.4, flare.width * 0.28).toFixed(2)}" stroke-opacity="${Math.min(1, flare.opacity + 0.08).toFixed(3)}" stroke-linecap="round"${arcAttributes} transform="rotate(${rotation} ${CENTER} ${CENTER})"/>
    ${
      head
        ? `
      <circle cx="${head.x.toFixed(2)}" cy="${head.y.toFixed(2)}" r="${(flare.headRadius * 1.85).toFixed(2)}" fill="${flare.glowColor}" fill-opacity="${(flare.opacity * 0.18).toFixed(3)}"/>
      <circle cx="${head.x.toFixed(2)}" cy="${head.y.toFixed(2)}" r="${flare.headRadius.toFixed(2)}" fill="#FFF3DF"/>
    `
        : ""
    }
  `;
}

function renderOrbitalDefs(hashHex: string, model: OrbitalAvatarModel) {
  const defs: string[] = [
    `<filter id="orbital-avatar-band-blur-${hashHex}" x="0" y="0" width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="14"/></filter>`,
    `<filter id="orbital-avatar-flare-blur-${hashHex}" x="0" y="0" width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="12"/></filter>`,
  ];

  if (model.planet) {
    defs.push(
      `<linearGradient id="orbital-avatar-body-${hashHex}" x1="0.18" y1="0.12" x2="0.86" y2="0.88" gradientUnits="objectBoundingBox" gradientTransform="rotate(${model.compositionRotation.toFixed(2)} 0.5 0.5)">
        <stop stop-color="${model.planet.colorA}"/>
        <stop offset="0.34" stop-color="${model.planet.colorB}"/>
        <stop offset="1" stop-color="${model.planet.colorC}"/>
      </linearGradient>`,
    );
    defs.push(
      `<radialGradient id="orbital-avatar-atmosphere-${hashHex}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${model.planet.glowColor}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="${model.planet.glowColor}" stop-opacity="0"/>
      </radialGradient>`,
    );
    defs.push(
      `<radialGradient id="orbital-avatar-highlight-${hashHex}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(0.66 0.28) scale(0.5 0.34)">
        <stop stop-color="#FFF6E8" stop-opacity="0.56"/>
        <stop offset="0.48" stop-color="#FFF6E8" stop-opacity="0.18"/>
        <stop offset="1" stop-color="#FFF6E8" stop-opacity="0"/>
      </radialGradient>`,
    );
    defs.push(
      `<radialGradient id="orbital-avatar-shadow-${hashHex}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(0.28 0.76) scale(0.54 0.32)">
        <stop stop-color="#07111D" stop-opacity="0.72"/>
        <stop offset="1" stop-color="#07111D" stop-opacity="0"/>
      </radialGradient>`,
    );
    defs.push(
      `<clipPath id="orbital-avatar-clip-${hashHex}">
        <circle cx="${CENTER}" cy="${CENTER}" r="${model.planet.radius.toFixed(2)}"/>
      </clipPath>`,
    );
  }

  if (model.flare) {
    defs.push(
      `<linearGradient id="orbital-avatar-flare-${hashHex}" x1="0.24" y1="0.08" x2="0.84" y2="0.92" gradientUnits="objectBoundingBox">
        <stop stop-color="${model.flare.startColor}"/>
        <stop offset="0.56" stop-color="${model.flare.middleColor}"/>
        <stop offset="1" stop-color="${model.flare.endColor}"/>
      </linearGradient>`,
    );
    defs.push(
      `<linearGradient id="orbital-avatar-flare-core-${hashHex}" x1="0.3" y1="0.12" x2="0.74" y2="0.88" gradientUnits="objectBoundingBox">
        <stop stop-color="#FF9E78"/>
        <stop offset="0.52" stop-color="#FFF0CF"/>
        <stop offset="1" stop-color="#FFF8ED"/>
      </linearGradient>`,
    );
  }

  return defs.join("");
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
  ${model.orbit ? renderOrbitTrack(model.orbit) : ""}
  ${model.flare ? renderFlare(model.flare, hashHex) : ""}
  ${model.shellOrbit ? renderShellOrbit(model.shellOrbit) : ""}
  ${model.planet ? renderPlanet(model.planet, hashHex) : ""}
</svg>`;
}
