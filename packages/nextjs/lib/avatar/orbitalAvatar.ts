import type { ReputationAvatarPayload } from "~~/lib/avatar/avatarPayload";

interface Point {
  x: number;
  y: number;
}

interface OrbitalAvatarPlanet {
  radius: number;
  highlightColor: string;
  lightColor: string;
  midColor: string;
  warmColor: string;
  deepColor: string;
  rimColor: string;
  bloomColor: string;
  pocketColor: string;
  emberPocketColor: string;
  foldColor: string;
  foldStrokeColor: string;
  shadowColor: string;
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
const AVATAR_FLARE_WIDTH = 17.5;
const AVATAR_FLARE_GLOW_WIDTH = 22;
const AVATAR_FLARE_HEAD_RADIUS = 8.4;
const AVATAR_BASE_PLANET_RADIUS = 98;
const AVATAR_PLANET_RADIUS_GAIN = 40;
const AVATAR_ORBIT_GAP = 82;

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

function describeArcPath(radius: number, startDegrees: number, sweepDegrees: number) {
  const clampedSweep = Math.max(0, Math.min(sweepDegrees, 359.9));
  const startPoint = polarToPoint(radius, startDegrees);
  const endPoint = polarToPoint(radius, startDegrees + clampedSweep);
  const largeArcFlag = clampedSweep > 180 ? 1 : 0;

  return [
    `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)}`,
    `A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArcFlag} 1 ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`,
  ].join(" ");
}

function getAddressColorSeed(address: string) {
  return address.toLowerCase().replace(/^0x/, "").slice(-6).padStart(6, "0");
}

function getPaletteSeedHex(payload: ReputationAvatarPayload) {
  return payload.avatarAccentHex?.replace(/^#/, "") || getAddressColorSeed(payload.address);
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

function getAvatarVariant(payload: ReputationAvatarPayload) {
  const seedHex = getPaletteSeedHex(payload);
  const seedValue = Number.parseInt(seedHex, 16);
  const { r, g, b } = hexToRgb(seedHex);
  const seedHsl = rgbToHsl(r, g, b);
  const baseHue = seedHsl.saturation < 0.18 ? seedValue % 360 : seedHsl.hue;
  const saturation = Math.max(seedHsl.saturation * 100, 70);
  const orbHue = baseHue - 8;
  const warmHue = baseHue + 18;
  const deepHue = baseHue + 74;
  const pocketHue = baseHue + 108;

  return {
    compositionRotation: unitHash(`${payload.address}:orb-rotation`) * 360,
    orbHighlightColor: "#F5F0EB",
    orbLightColor: hslToHex(warmHue, Math.min(saturation - 6, 88), 84),
    orbMidColor: hslToHex(orbHue, Math.min(saturation + 8, 94), 64),
    orbWarmColor: hslToHex(warmHue, Math.min(saturation + 4, 92), 50),
    orbDeepColor: hslToHex(deepHue, Math.min(saturation - 8, 74), 34),
    rimColor: hslToHex(baseHue + 182, 28, 66),
    bloomColor: "#F26426",
    pocketColor: hslToHex(pocketHue, Math.min(saturation - 6, 82), 42),
    emberPocketColor: hslToHex(warmHue, Math.min(saturation - 12, 78), 46),
    foldColor: "#F5E3D2",
    foldStrokeColor: "#F5F0EB",
    shadowColor: hslToHex(baseHue + 56, 34, 26),
    accentColor: hslToHex(warmHue, Math.min(saturation + 2, 90), 78),
  };
}

function buildPlanet(
  payload: ReputationAvatarPayload,
  variant: ReturnType<typeof getAvatarVariant>,
): OrbitalAvatarPlanet | null {
  if (!payload.voterId) return null;

  const { balanceScore } = getSignalScores(payload);
  const radius = AVATAR_BASE_PLANET_RADIUS + AVATAR_PLANET_RADIUS_GAIN * balanceScore;

  return {
    radius,
    highlightColor: variant.orbHighlightColor,
    lightColor: variant.orbLightColor,
    midColor: variant.orbMidColor,
    warmColor: variant.orbWarmColor,
    deepColor: variant.orbDeepColor,
    rimColor: variant.rimColor,
    bloomColor: variant.bloomColor,
    pocketColor: variant.pocketColor,
    emberPocketColor: variant.emberPocketColor,
    foldColor: variant.foldColor,
    foldStrokeColor: variant.foldStrokeColor,
    shadowColor: variant.shadowColor,
  };
}

function buildOrbit(
  planet: OrbitalAvatarPlanet | null,
  variant: ReturnType<typeof getAvatarVariant>,
): OrbitalAvatarOrbit | null {
  if (!planet) return null;

  return {
    radius: planet.radius + AVATAR_ORBIT_GAP,
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
    startColor: "#B3341B",
    middleColor: "#F26426",
    endColor: "#F5F0EB",
    glowColor: "#F26426",
  };
}

function buildShellOrbit(): OrbitalAvatarShell {
  return {
    orbitRadii: [150, 186, 220],
    orbitOpacity: 0.18,
    strokeWidth: 12,
    orbitStroke: "rgba(255,255,255,0.14)",
    planetRadius: 126,
    planetStroke: "rgba(255,255,255,0.12)",
  };
}

export function buildOrbitalAvatarModel(
  payload: ReputationAvatarPayload,
  _options?: { nowSeconds?: number },
): OrbitalAvatarModel {
  void _options;
  const variant = getAvatarVariant(payload);
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

function scaleReferenceValue(value: number, radius: number) {
  return (value * radius) / 360;
}

function scaleReferenceX(value: number, radius: number) {
  return CENTER + (value - 700) * (radius / 360);
}

function scaleReferenceY(value: number, radius: number) {
  return CENTER + (value - 700) * (radius / 360);
}

function scaleReferencePoint(x: number, y: number, radius: number) {
  return `${scaleReferenceX(x, radius).toFixed(2)} ${scaleReferenceY(y, radius).toFixed(2)}`;
}

function renderPlanet(planet: OrbitalAvatarPlanet, hashHex: string) {
  const radius = planet.radius;
  const foldSheenPath = `M ${scaleReferencePoint(330, 822, radius)}C ${scaleReferencePoint(464, 734, radius)} ${scaleReferencePoint(582, 684, radius)} ${scaleReferencePoint(704, 670, radius)}C ${scaleReferencePoint(810, 658, radius)} ${scaleReferencePoint(902, 686, radius)} ${scaleReferencePoint(1018, 760, radius)}C ${scaleReferencePoint(944, 812, radius)} ${scaleReferencePoint(868, 844, radius)} ${scaleReferencePoint(788, 858, radius)}C ${scaleReferencePoint(680, 876, radius)} ${scaleReferencePoint(560, 868, radius)} ${scaleReferencePoint(442, 840, radius)}C ${scaleReferencePoint(404, 832, radius)} ${scaleReferencePoint(368, 826, radius)} ${scaleReferencePoint(330, 822, radius)}Z`;
  const foldBodyPath = `M ${scaleReferencePoint(350, 838, radius)}C ${scaleReferencePoint(466, 760, radius)} ${scaleReferencePoint(574, 724, radius)} ${scaleReferencePoint(694, 714, radius)}C ${scaleReferencePoint(808, 704, radius)} ${scaleReferencePoint(906, 726, radius)} ${scaleReferencePoint(1012, 776, radius)}C ${scaleReferencePoint(932, 814, radius)} ${scaleReferencePoint(852, 838, radius)} ${scaleReferencePoint(766, 848, radius)}C ${scaleReferencePoint(642, 864, radius)} ${scaleReferencePoint(520, 858, radius)} ${scaleReferencePoint(402, 840, radius)}C ${scaleReferencePoint(384, 838, radius)} ${scaleReferencePoint(366, 838, radius)} ${scaleReferencePoint(350, 838, radius)}Z`;
  const upperFoldStrokePath = `M ${scaleReferencePoint(404, 542, radius)}C ${scaleReferencePoint(518, 494, radius)} ${scaleReferencePoint(634, 492, radius)} ${scaleReferencePoint(752, 530, radius)}C ${scaleReferencePoint(842, 560, radius)} ${scaleReferencePoint(938, 626, radius)} ${scaleReferencePoint(1038, 724, radius)}`;
  const lowerFoldStrokePath = `M ${scaleReferencePoint(344, 930, radius)}C ${scaleReferencePoint(456, 908, radius)} ${scaleReferencePoint(574, 916, radius)} ${scaleReferencePoint(706, 956, radius)}C ${scaleReferencePoint(820, 990, radius)} ${scaleReferencePoint(910, 1040, radius)} ${scaleReferencePoint(988, 1110, radius)}`;

  return `
    <circle cx="${CENTER}" cy="${CENTER}" r="${radius.toFixed(2)}" fill="url(#orbital-avatar-body-${hashHex})"/>
    <circle cx="${CENTER}" cy="${CENTER}" r="${radius.toFixed(2)}" fill="url(#orbital-avatar-rim-${hashHex})"/>
    <g clip-path="url(#orbital-avatar-clip-${hashHex})">
      <g filter="url(#orbital-avatar-band-blur-${hashHex})">
        <ellipse cx="${scaleReferenceX(672, radius).toFixed(2)}" cy="${scaleReferenceY(538, radius).toFixed(2)}" rx="${scaleReferenceValue(280, radius).toFixed(2)}" ry="${scaleReferenceValue(184, radius).toFixed(2)}" fill="url(#orbital-avatar-soft-white-${hashHex})"/>
        <ellipse cx="${scaleReferenceX(930, radius).toFixed(2)}" cy="${scaleReferenceY(640, radius).toFixed(2)}" rx="${scaleReferenceValue(246, radius).toFixed(2)}" ry="${scaleReferenceValue(214, radius).toFixed(2)}" fill="url(#orbital-avatar-gold-bloom-${hashHex})"/>
        <ellipse cx="${scaleReferenceX(508, radius).toFixed(2)}" cy="${scaleReferenceY(904, radius).toFixed(2)}" rx="${scaleReferenceValue(286, radius).toFixed(2)}" ry="${scaleReferenceValue(218, radius).toFixed(2)}" fill="url(#orbital-avatar-pocket-${hashHex})"/>
        <ellipse cx="${scaleReferenceX(662, radius).toFixed(2)}" cy="${scaleReferenceY(774, radius).toFixed(2)}" rx="${scaleReferenceValue(316, radius).toFixed(2)}" ry="${scaleReferenceValue(176, radius).toFixed(2)}" fill="url(#orbital-avatar-ember-pocket-${hashHex})"/>
      </g>
      <path d="${foldSheenPath}" fill="url(#orbital-avatar-fold-sheen-${hashHex})"/>
      <path d="${foldBodyPath}" fill="${planet.foldColor}" fill-opacity="0.11"/>
      <path d="${upperFoldStrokePath}" stroke="${planet.foldStrokeColor}" stroke-opacity="0.16" stroke-width="${scaleReferenceValue(22, radius).toFixed(2)}" stroke-linecap="round"/>
      <path d="${lowerFoldStrokePath}" stroke="${planet.emberPocketColor}" stroke-opacity="0.1" stroke-width="${scaleReferenceValue(24, radius).toFixed(2)}" stroke-linecap="round"/>
      <circle cx="${scaleReferenceX(1118, radius).toFixed(2)}" cy="${scaleReferenceY(490, radius).toFixed(2)}" r="${scaleReferenceValue(50, radius).toFixed(2)}" fill="${planet.highlightColor}" fill-opacity="0.9"/>
      <circle cx="${scaleReferenceX(664, radius).toFixed(2)}" cy="${scaleReferenceY(556, radius).toFixed(2)}" r="${scaleReferenceValue(190, radius).toFixed(2)}" fill="url(#orbital-avatar-soft-white-${hashHex})"/>
    </g>
    <circle cx="${CENTER}" cy="${CENTER}" r="${radius.toFixed(2)}" fill="none" stroke="${planet.highlightColor}" stroke-width="1.6" stroke-opacity="0.14"/>
  `;
}

function renderFlare(flare: OrbitalAvatarFlare, hashHex: string) {
  const flarePath = describeArcPath(flare.radius, flare.rotationDegrees, flare.sweepDegrees);

  return `
    <path d="${flarePath}" fill="none" stroke="#6D352A" stroke-width="${(flare.width + 2.2).toFixed(2)}" stroke-opacity="${(flare.opacity * 0.22).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision"/>
    <path d="${flarePath}" fill="none" stroke="url(#orbital-avatar-flare-${hashHex})" stroke-width="${flare.width.toFixed(2)}" stroke-opacity="${flare.opacity.toFixed(3)}" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision"/>
    <path d="${flarePath}" fill="none" stroke="url(#orbital-avatar-flare-core-${hashHex})" stroke-width="${Math.max(2.4, flare.width * 0.24).toFixed(2)}" stroke-opacity="${Math.min(1, flare.opacity + 0.08).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision"/>
  `;
}

function renderOrbitalDefs(hashHex: string, model: OrbitalAvatarModel) {
  const defs: string[] = [
    `<filter id="orbital-avatar-band-blur-${hashHex}" x="0" y="0" width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${model.planet ? Math.max(8, scaleReferenceValue(40, model.planet.radius)).toFixed(2) : "14"}"/></filter>`,
  ];

  if (model.planet) {
    defs.push(
      `<radialGradient id="orbital-avatar-body-${hashHex}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${scaleReferenceX(856, model.planet.radius).toFixed(2)} ${scaleReferenceY(450, model.planet.radius).toFixed(2)}) rotate(${(136 + model.compositionRotation * 0.08).toFixed(2)}) scale(${scaleReferenceValue(720, model.planet.radius).toFixed(2)} ${scaleReferenceValue(702, model.planet.radius).toFixed(2)})">
        <stop stop-color="${model.planet.highlightColor}"/>
        <stop offset="0.18" stop-color="${model.planet.lightColor}"/>
        <stop offset="0.34" stop-color="${model.planet.midColor}"/>
        <stop offset="0.56" stop-color="${model.planet.warmColor}"/>
        <stop offset="0.78" stop-color="${model.planet.emberPocketColor}"/>
        <stop offset="1" stop-color="${model.planet.deepColor}"/>
      </radialGradient>`,
    );
    defs.push(
      `<radialGradient id="orbital-avatar-rim-${hashHex}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${scaleReferenceX(438, model.planet.radius).toFixed(2)} ${scaleReferenceY(516, model.planet.radius).toFixed(2)}) rotate(30) scale(${scaleReferenceValue(240, model.planet.radius).toFixed(2)} ${scaleReferenceValue(540, model.planet.radius).toFixed(2)})">
        <stop stop-color="${model.planet.rimColor}" stop-opacity="0.82"/>
        <stop offset="0.22" stop-color="${model.planet.rimColor}" stop-opacity="0.34"/>
        <stop offset="1" stop-color="${model.planet.rimColor}" stop-opacity="0"/>
      </radialGradient>`,
    );
    defs.push(
      `<radialGradient id="orbital-avatar-soft-white-${hashHex}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${scaleReferenceX(710, model.planet.radius).toFixed(2)} ${scaleReferenceY(520, model.planet.radius).toFixed(2)}) rotate(128) scale(${scaleReferenceValue(330, model.planet.radius).toFixed(2)} ${scaleReferenceValue(260, model.planet.radius).toFixed(2)})">
        <stop stop-color="${model.planet.highlightColor}" stop-opacity="0.74"/>
        <stop offset="0.52" stop-color="${model.planet.highlightColor}" stop-opacity="0.2"/>
        <stop offset="1" stop-color="${model.planet.highlightColor}" stop-opacity="0"/>
      </radialGradient>`,
    );
    defs.push(
      `<radialGradient id="orbital-avatar-gold-bloom-${hashHex}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${scaleReferenceX(930, model.planet.radius).toFixed(2)} ${scaleReferenceY(612, model.planet.radius).toFixed(2)}) rotate(166) scale(${scaleReferenceValue(270, model.planet.radius).toFixed(2)} ${scaleReferenceValue(220, model.planet.radius).toFixed(2)})">
        <stop stop-color="${model.planet.bloomColor}" stop-opacity="0.82"/>
        <stop offset="1" stop-color="${model.planet.bloomColor}" stop-opacity="0"/>
      </radialGradient>`,
    );
    defs.push(
      `<radialGradient id="orbital-avatar-pocket-${hashHex}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${scaleReferenceX(500, model.planet.radius).toFixed(2)} ${scaleReferenceY(866, model.planet.radius).toFixed(2)}) rotate(-26) scale(${scaleReferenceValue(334, model.planet.radius).toFixed(2)} ${scaleReferenceValue(244, model.planet.radius).toFixed(2)})">
        <stop stop-color="${model.planet.pocketColor}" stop-opacity="0.54"/>
        <stop offset="1" stop-color="${model.planet.pocketColor}" stop-opacity="0"/>
      </radialGradient>`,
    );
    defs.push(
      `<radialGradient id="orbital-avatar-ember-pocket-${hashHex}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${scaleReferenceX(620, model.planet.radius).toFixed(2)} ${scaleReferenceY(760, model.planet.radius).toFixed(2)}) rotate(8) scale(${scaleReferenceValue(320, model.planet.radius).toFixed(2)} ${scaleReferenceValue(180, model.planet.radius).toFixed(2)})">
        <stop stop-color="${model.planet.shadowColor}" stop-opacity="0.36"/>
        <stop offset="0.58" stop-color="${model.planet.emberPocketColor}" stop-opacity="0.22"/>
        <stop offset="1" stop-color="${model.planet.emberPocketColor}" stop-opacity="0"/>
      </radialGradient>`,
    );
    defs.push(
      `<linearGradient id="orbital-avatar-fold-sheen-${hashHex}" x1="${scaleReferenceX(290, model.planet.radius).toFixed(2)}" y1="${scaleReferenceY(820, model.planet.radius).toFixed(2)}" x2="${scaleReferenceX(1036, model.planet.radius).toFixed(2)}" y2="${scaleReferenceY(650, model.planet.radius).toFixed(2)}" gradientUnits="userSpaceOnUse">
        <stop stop-color="${model.planet.foldStrokeColor}" stop-opacity="0"/>
        <stop offset="0.3" stop-color="${model.planet.foldStrokeColor}" stop-opacity="0.08"/>
        <stop offset="0.56" stop-color="${model.planet.foldStrokeColor}" stop-opacity="0.34"/>
        <stop offset="0.82" stop-color="${model.planet.foldColor}" stop-opacity="0.18"/>
        <stop offset="1" stop-color="${model.planet.foldColor}" stop-opacity="0"/>
      </linearGradient>`,
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
        <stop stop-color="#F26426"/>
        <stop offset="1" stop-color="#F5F0EB"/>
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
