import type { ReputationAvatarPayload } from "~~/lib/avatar/reputationConstellation";

interface Point {
  x: number;
  y: number;
}

export interface PlanetAvatarBody extends Point {
  radius: number;
  lightColor: string;
  midColor: string;
  darkColor: string;
  glowColor: string;
  rotation: number;
  opacity: number;
}

export interface PlanetAvatarRing {
  x: number;
  y: number;
  rx: number;
  ry: number;
  tilt: number;
  thickness: number;
  color: string;
  glowColor: string;
  opacity: number;
  glowOpacity: number;
}

export interface PlanetAvatarCategoryBody extends Point {
  categoryId: string;
  radius: number;
  lightColor: string;
  midColor: string;
  darkColor: string;
  glowColor: string;
  opacity: number;
}

export interface PlanetAvatarModel {
  backgroundBase: string;
  backgroundShadow: string;
  backgroundAngle: number;
  backgroundStart: string;
  backgroundMid: string;
  backgroundEnd: string;
  compositionRotation: number;
  mainPlanet: PlanetAvatarBody | null;
  subPlanet: PlanetAvatarBody | null;
  accuracyRing: PlanetAvatarRing | null;
  shellRing: PlanetAvatarRing | null;
  categoryBodies: PlanetAvatarCategoryBody[];
}

const VIEWBOX_SIZE = 512;
const CENTER = VIEWBOX_SIZE / 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(angle: number) {
  return angle * (Math.PI / 180);
}

function polarToCartesian(angle: number, radius: number): Point {
  const radians = toRadians(angle);
  return {
    x: CENTER + Math.cos(radians) * radius,
    y: CENTER + Math.sin(radians) * radius,
  };
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

function getPlanetPalette(baseHex: string, hueOffset: number) {
  const { r, g, b } = hexToRgb(baseHex);
  const { hue, saturation, lightness } = rgbToHsl(r, g, b);
  const sat = Math.max(saturation * 100, 66);
  const baseHue = hue + hueOffset;

  return {
    lightColor: hslToHex(baseHue + 8, Math.min(96, sat + 8), 72),
    midColor: hslToHex(baseHue - 4, Math.min(90, sat + 2), 52),
    darkColor: hslToHex(baseHue - 18, Math.max(54, sat - 8), 24),
    glowColor: hslToHex(baseHue + 12, Math.min(92, sat + 4), 58),
  };
}

function getCategoryPalette(categoryId: string) {
  const hue = Number(BigInt(categoryId) % 360n);
  return {
    lightColor: hslToHex(hue + 14, 88, 74),
    midColor: hslToHex(hue, 82, 54),
    darkColor: hslToHex(hue - 18, 70, 28),
    glowColor: hslToHex(hue + 18, 84, 60),
  };
}

function getAddressVariant(address: string) {
  const hashed = (salt: string) => unitHash(`${address}:${salt}`);
  const seedHex = getAddressColorSeed(address);
  const seedValue = Number.parseInt(seedHex, 16);
  const { r, g, b } = hexToRgb(seedHex);
  const seedHsl = rgbToHsl(r, g, b);
  const hue = seedHsl.saturation < 0.18 ? seedValue % 360 : seedHsl.hue;
  const saturation = Math.max(seedHsl.saturation * 100, 66);
  const backgroundBase = hslToHex(hue, Math.max(saturation - 16, 44), 8);

  return {
    compositionRotation: hashed("composition-rotation") * 360,
    planetRotation: hashed("planet-rotation") * 360,
    ringTilt: -28 + hashed("ring-tilt") * 56,
    subPlanetAngle: hashed("sub-planet-angle") * 360,
    subPlanetRotation: hashed("sub-planet-rotation") * 360,
    subPlanetOrbitRadius: 126 + hashed("sub-planet-orbit") * 30,
    backgroundAngle: 18 + hashed("background-angle") * 144,
    backgroundBase,
    backgroundShadow: hslToHex(hue + 6, Math.max(saturation - 22, 40), 3),
    backgroundStart: hslToHex(hue + 26, saturation, 26),
    backgroundMid: hslToHex(hue - 22, Math.max(saturation - 6, 56), 18),
    backgroundEnd: hslToHex(hue + 62, Math.max(saturation - 4, 58), 20),
    planetPalette: getPlanetPalette(backgroundBase, 10),
    subPlanetPalette: getPlanetPalette(backgroundBase, -22),
    ringColor: hslToHex(hue + 46, 86, 72),
    ringGlowColor: hslToHex(hue + 54, 90, 62),
  };
}

function getTriadScores(payload: ReputationAvatarPayload) {
  const balanceCrep = Number(BigInt(payload.balance || "0")) / 1e6;
  const stats = payload.stats;

  const balanceScore = logScore(balanceCrep, 100000);
  const totalSettledVotes = stats?.totalSettledVotes ?? 0;
  const accuracyConfidence = clamp(totalSettledVotes / 25, 0, 1);
  const accuracyWinRate = stats?.winRate ?? 0;
  const accuracyScore = clamp((accuracyWinRate - 0.45) / 0.3, 0, 1) * accuracyConfidence;
  const participationScore = logScore(totalSettledVotes, 200);

  return [balanceScore, accuracyScore, participationScore] as const;
}

function getVisibleCategories(payload: ReputationAvatarPayload, nowSeconds: number) {
  return payload.categories90d
    .map(category => {
      if (category.settledVotes90d < 3) return null;

      const activityScore = clamp(category.settledVotes90d / 12, 0, 1);
      const categoryAccuracyConfidence = clamp(category.settledVotes90d / 8, 0, 1);
      const categoryAccuracyScore = clamp((category.winRate90d - 0.45) / 0.3, 0, 1) * categoryAccuracyConfidence;
      const totalStakeCrep = Number(BigInt(category.totalStake90d)) / 1e6;
      const convictionScore = logScore(totalStakeCrep, 3000);
      const categoryScore = 0.5 * activityScore + 0.35 * categoryAccuracyScore + 0.15 * convictionScore;
      const daysSinceLastSettledVote = Math.max(
        0,
        (nowSeconds - Number(BigInt(category.lastSettledAt || "0"))) / (24 * 60 * 60),
      );

      if (daysSinceLastSettledVote > 90) return null;

      let opacity = 1;
      if (daysSinceLastSettledVote > 45) {
        const t = clamp((daysSinceLastSettledVote - 45) / 45, 0, 1);
        opacity = 0.42 - t * 0.28;
      } else if (daysSinceLastSettledVote > 14) {
        const t = clamp((daysSinceLastSettledVote - 14) / 31, 0, 1);
        opacity = 1 - t * 0.5;
      }

      return {
        ...category,
        categoryScore,
        opacity,
      };
    })
    .filter((category): category is NonNullable<typeof category> => category !== null)
    .sort((a, b) => {
      if (b.categoryScore !== a.categoryScore) return b.categoryScore - a.categoryScore;
      if (b.settledVotes90d !== a.settledVotes90d) return b.settledVotes90d - a.settledVotes90d;
      if (BigInt(a.categoryId) < BigInt(b.categoryId)) return -1;
      if (BigInt(a.categoryId) > BigInt(b.categoryId)) return 1;
      return 0;
    })
    .slice(0, 5);
}

function buildMainPlanet(
  payload: ReputationAvatarPayload,
  variant: ReturnType<typeof getAddressVariant>,
): PlanetAvatarBody | null {
  if (!payload.voterId) return null;

  const [balanceScore] = getTriadScores(payload);
  return {
    x: CENTER,
    y: CENTER,
    radius: 58 + 46 * balanceScore,
    opacity: 1,
    rotation: variant.planetRotation,
    ...variant.planetPalette,
  };
}

function buildAccuracyRing(
  payload: ReputationAvatarPayload,
  mainPlanet: PlanetAvatarBody | null,
  variant: ReturnType<typeof getAddressVariant>,
): PlanetAvatarRing | null {
  if (!mainPlanet || !payload.stats) return null;

  const [, accuracyScore] = getTriadScores(payload);
  return {
    x: CENTER,
    y: CENTER,
    rx: mainPlanet.radius + 30,
    ry: (mainPlanet.radius + 30) * 0.34,
    tilt: variant.ringTilt,
    thickness: 2.5 + accuracyScore * 6,
    color: variant.ringColor,
    glowColor: variant.ringGlowColor,
    opacity: 0.24 + accuracyScore * 0.58,
    glowOpacity: 0.08 + accuracyScore * 0.28,
  };
}

function buildShellRing(variant: ReturnType<typeof getAddressVariant>): PlanetAvatarRing {
  return {
    x: CENTER,
    y: CENTER,
    rx: 86,
    ry: 34,
    tilt: variant.ringTilt,
    thickness: 3,
    color: hslToHex(variant.backgroundAngle, 34, 70),
    glowColor: hslToHex(variant.backgroundAngle + 18, 44, 58),
    opacity: 0.26,
    glowOpacity: 0.08,
  };
}

function buildSubPlanet(
  payload: ReputationAvatarPayload,
  mainPlanet: PlanetAvatarBody | null,
  variant: ReturnType<typeof getAddressVariant>,
): PlanetAvatarBody | null {
  if (!mainPlanet || !payload.stats) return null;

  const [, , participationScore] = getTriadScores(payload);
  const position = polarToCartesian(variant.subPlanetAngle, variant.subPlanetOrbitRadius);

  return {
    x: position.x,
    y: position.y,
    radius: 12 + 22 * participationScore,
    opacity: 0.98,
    rotation: variant.subPlanetRotation,
    ...variant.subPlanetPalette,
  };
}

function buildCategoryBodies(
  payload: ReputationAvatarPayload,
  mainPlanet: PlanetAvatarBody | null,
  nowSeconds: number,
): PlanetAvatarCategoryBody[] {
  if (!mainPlanet) return [];

  return getVisibleCategories(payload, nowSeconds).map((category, index, categories) => {
    const seed = unitHash(`${payload.address}:${category.categoryId}:planet-category`);
    const baseAngle = (360 / categories.length) * index + seed * 26;
    const orbitRadius = mainPlanet.radius + 92 + (1 - category.categoryScore) * 28 + (index % 2) * 14;
    const point = polarToCartesian(baseAngle, orbitRadius);
    const palette = getCategoryPalette(category.categoryId);

    return {
      categoryId: category.categoryId,
      x: point.x,
      y: point.y,
      radius: 8 + 12 * category.categoryScore,
      opacity: category.opacity,
      ...palette,
    };
  });
}

export function buildPlanetAvatarModel(
  payload: ReputationAvatarPayload,
  options?: { nowSeconds?: number },
): PlanetAvatarModel {
  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const variant = getAddressVariant(payload.address);
  const mainPlanet = buildMainPlanet(payload, variant);
  const accuracyRing = buildAccuracyRing(payload, mainPlanet, variant);
  const subPlanet = buildSubPlanet(payload, mainPlanet, variant);
  const categoryBodies = buildCategoryBodies(payload, mainPlanet, nowSeconds);

  return {
    backgroundBase: variant.backgroundBase,
    backgroundShadow: variant.backgroundShadow,
    backgroundAngle: variant.backgroundAngle,
    backgroundStart: variant.backgroundStart,
    backgroundMid: variant.backgroundMid,
    backgroundEnd: variant.backgroundEnd,
    compositionRotation: variant.compositionRotation,
    mainPlanet,
    subPlanet,
    accuracyRing,
    shellRing: mainPlanet ? null : buildShellRing(variant),
    categoryBodies,
  };
}

function renderPlanetDefs(hashHex: string, model: PlanetAvatarModel) {
  const bgId = `planet-avatar-bg-${hashHex}`;
  const shadowId = `planet-avatar-shadow-${hashHex}`;
  const nebulaAId = `planet-avatar-nebula-a-${hashHex}`;
  const nebulaBId = `planet-avatar-nebula-b-${hashHex}`;
  const ringGlowId = `planet-avatar-ring-glow-${hashHex}`;
  const defs: string[] = [
    `<linearGradient id="${bgId}" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox" gradientTransform="rotate(${model.backgroundAngle.toFixed(2)} 0.5 0.5)">
      <stop stop-color="${model.backgroundBase}"/>
      <stop offset="1" stop-color="${model.backgroundBase}"/>
    </linearGradient>`,
    `<radialGradient id="${shadowId}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(0 0) scale(1.1 1.1)">
      <stop stop-color="${model.backgroundShadow}" stop-opacity="0.9"/>
      <stop offset="0.95" stop-color="${model.backgroundShadow}" stop-opacity="0"/>
    </radialGradient>`,
    `<radialGradient id="${nebulaAId}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(1.04 -0.06) scale(1.55 0.95)">
      <stop stop-color="${model.backgroundStart}" stop-opacity="0.82"/>
      <stop offset="0.5" stop-color="${model.backgroundMid}" stop-opacity="0.46"/>
      <stop offset="0.95" stop-color="${model.backgroundEnd}" stop-opacity="0"/>
    </radialGradient>`,
    `<radialGradient id="${nebulaBId}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(0.38 0.64) scale(1.55 1.0)">
      <stop stop-color="${model.backgroundEnd}" stop-opacity="0.64"/>
      <stop offset="0.95" stop-color="${model.backgroundEnd}" stop-opacity="0"/>
    </radialGradient>`,
    `<radialGradient id="${ringGlowId}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFF0B0" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#FFF0B0" stop-opacity="0"/>
    </radialGradient>`,
  ];

  const bodies = [model.mainPlanet, model.subPlanet, ...model.categoryBodies].filter(
    (body): body is PlanetAvatarBody | PlanetAvatarCategoryBody => body !== null,
  );
  for (const [index, body] of bodies.entries()) {
    const gradientId = `planet-avatar-body-${hashHex}-${index}`;
    const glowId = `planet-avatar-body-glow-${hashHex}-${index}`;
    defs.push(
      `<radialGradient id="${gradientId}" cx="36%" cy="34%" r="72%">
        <stop offset="0%" stop-color="${body.lightColor}" stop-opacity="0.98"/>
        <stop offset="48%" stop-color="${body.midColor}" stop-opacity="0.98"/>
        <stop offset="100%" stop-color="${body.darkColor}" stop-opacity="1"/>
      </radialGradient>`,
    );
    defs.push(
      `<radialGradient id="${glowId}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${body.glowColor}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${body.glowColor}" stop-opacity="0"/>
      </radialGradient>`,
    );
  }

  defs.push(
    `<clipPath id="planet-avatar-ring-front-${hashHex}">
      <rect x="0" y="${CENTER}" width="${VIEWBOX_SIZE}" height="${CENTER}"/>
    </clipPath>`,
  );
  defs.push(
    `<clipPath id="planet-avatar-ring-back-${hashHex}">
      <rect x="0" y="0" width="${VIEWBOX_SIZE}" height="${CENTER}"/>
    </clipPath>`,
  );

  return { bgId, shadowId, nebulaAId, nebulaBId, ringGlowId, markup: defs.join("") };
}

function renderBody(body: PlanetAvatarBody | PlanetAvatarCategoryBody, hashHex: string, index: number) {
  const gradientId = `planet-avatar-body-${hashHex}-${index}`;
  const glowId = `planet-avatar-body-glow-${hashHex}-${index}`;
  return `
    <circle cx="${body.x.toFixed(2)}" cy="${body.y.toFixed(2)}" r="${(body.radius * 2.1).toFixed(2)}" fill="url(#${glowId})" fill-opacity="${Math.min(0.34, body.opacity * 0.28).toFixed(3)}"/>
    <circle cx="${body.x.toFixed(2)}" cy="${body.y.toFixed(2)}" r="${body.radius.toFixed(2)}" fill="url(#${gradientId})" fill-opacity="${body.opacity.toFixed(3)}"/>`;
}

function renderRing(ring: PlanetAvatarRing, hashHex: string, clipId: string) {
  return `
    <ellipse cx="${ring.x.toFixed(2)}" cy="${ring.y.toFixed(2)}" rx="${(ring.rx + ring.thickness * 1.9).toFixed(2)}" ry="${(ring.ry + ring.thickness * 1.2).toFixed(2)}" transform="rotate(${ring.tilt.toFixed(2)} ${ring.x.toFixed(2)} ${ring.y.toFixed(2)})" fill="none" stroke="url(#planet-avatar-ring-glow-${hashHex})" stroke-width="${(ring.thickness * 3.4).toFixed(2)}" stroke-opacity="${ring.glowOpacity.toFixed(3)}" clip-path="url(#${clipId})"/>
    <ellipse cx="${ring.x.toFixed(2)}" cy="${ring.y.toFixed(2)}" rx="${ring.rx.toFixed(2)}" ry="${ring.ry.toFixed(2)}" transform="rotate(${ring.tilt.toFixed(2)} ${ring.x.toFixed(2)} ${ring.y.toFixed(2)})" fill="none" stroke="${ring.color}" stroke-width="${ring.thickness.toFixed(2)}" stroke-opacity="${ring.opacity.toFixed(3)}" clip-path="url(#${clipId})"/>`;
}

export function renderPlanetAvatarSvg(
  payload: ReputationAvatarPayload,
  options?: { size?: number; nowSeconds?: number },
) {
  const size = clamp(Number(options?.size ?? 96), 16, 512);
  const model = buildPlanetAvatarModel(payload, { nowSeconds: options?.nowSeconds });
  const hashHex = hashString(payload.address).toString(16);
  const { bgId, shadowId, nebulaAId, nebulaBId, markup } = renderPlanetDefs(hashHex, model);
  const categoryMarkup = model.categoryBodies
    .map((body, index) => renderBody(body, hashHex, (model.mainPlanet ? 1 : 0) + (model.subPlanet ? 1 : 0) + index))
    .join("");
  const subPlanetMarkup = model.subPlanet ? renderBody(model.subPlanet, hashHex, model.mainPlanet ? 1 : 0) : "";
  const mainPlanetMarkup = model.mainPlanet ? renderBody(model.mainPlanet, hashHex, 0) : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" fill="none">
  <defs>${markup}</defs>
  <rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" rx="108" fill="url(#${bgId})"/>
  <rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" rx="108" fill="url(#${shadowId})"/>
  <rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" rx="108" fill="url(#${nebulaAId})"/>
  <rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" rx="108" fill="url(#${nebulaBId})"/>
  <g transform="rotate(${model.compositionRotation.toFixed(2)} ${CENTER} ${CENTER})">
    ${model.accuracyRing ? renderRing(model.accuracyRing, hashHex, `planet-avatar-ring-back-${hashHex}`) : ""}
    ${model.shellRing ? renderRing(model.shellRing, hashHex, `planet-avatar-ring-back-${hashHex}`) : ""}
    ${categoryMarkup}
    ${subPlanetMarkup}
    ${mainPlanetMarkup}
    ${model.accuracyRing ? renderRing(model.accuracyRing, hashHex, `planet-avatar-ring-front-${hashHex}`) : ""}
    ${model.shellRing ? renderRing(model.shellRing, hashHex, `planet-avatar-ring-front-${hashHex}`) : ""}
  </g>
</svg>`;
}
