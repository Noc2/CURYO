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
  opacity: number;
}

interface OrbitalAvatarOrbit {
  radius: number;
  opacity: number;
  strokeWidth: number;
  color: string;
}

interface OrbitalAvatarSatellite extends Point {
  radius: number;
  color: string;
  glowColor: string;
  opacity: number;
}

export interface OrbitalAvatarModel {
  progress: number;
  compositionRotation: number;
  coreOrb: OrbitalAvatarOrb | null;
  shellOrbit: OrbitalAvatarOrbit | null;
  accuracyOrbit: OrbitalAvatarOrbit | null;
  categorySatellites: OrbitalAvatarSatellite[];
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

function getVisibleCategories(payload: ReputationAvatarPayload, nowSeconds: number) {
  return payload.categories90d
    .map(category => {
      if (category.settledVotes90d < 3) return null;

      const activityScore = clamp(category.settledVotes90d / 12, 0, 1);
      const confidence = clamp(category.settledVotes90d / 8, 0, 1);
      const accuracyScore = clamp((category.winRate90d - 0.45) / 0.3, 0, 1) * confidence;
      const totalStakeCrep = Number(BigInt(category.totalStake90d)) / 1e6;
      const convictionScore = logScore(totalStakeCrep, 3000);
      const categoryScore = 0.5 * activityScore + 0.35 * accuracyScore + 0.15 * convictionScore;
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

function getCategoryPalette(categoryId: string) {
  const hue = Number(BigInt(categoryId) % 360n);
  return {
    color: hslToHex(hue, 82, 68),
    glowColor: hslToHex(hue + 14, 92, 62),
  };
}

function getAddressVariant(address: string) {
  const hashed = (salt: string) => unitHash(`${address}:${salt}`);
  const seedHex = getAddressColorSeed(address);
  const seedValue = Number.parseInt(seedHex, 16);
  const { r, g, b } = hexToRgb(seedHex);
  const seedHsl = rgbToHsl(r, g, b);
  const hue = seedHsl.saturation < 0.18 ? seedValue % 360 : seedHsl.hue;
  const saturation = Math.max(seedHsl.saturation * 100, 64);
  const progress = hashed("orbital-progress");

  return {
    hue,
    saturation,
    progress,
    compositionRotation: progress * 360,
    orbColorA: hslToHex(hue + 32, Math.min(saturation + 10, 96), 66),
    orbColorB: hslToHex(hue - 10, Math.min(saturation + 8, 94), 46),
    orbColorC: hslToHex(hue + 118, Math.min(saturation + 6, 90), 34),
    orbGlowColor: hslToHex(hue + 24, Math.min(saturation + 12, 98), 60),
  };
}

function buildCoreOrb(
  payload: ReputationAvatarPayload,
  variant: ReturnType<typeof getAddressVariant>,
): OrbitalAvatarOrb | null {
  if (!payload.voterId) return null;

  const [balanceScore] = getTriadScores(payload);
  return {
    x: CENTER,
    y: CENTER,
    radius: 70 + 42 * balanceScore,
    colorA: variant.orbColorA,
    colorB: variant.orbColorB,
    colorC: variant.orbColorC,
    glowColor: variant.orbGlowColor,
    opacity: 1,
  };
}

function buildAccuracyOrbit(
  payload: ReputationAvatarPayload,
  coreOrb: OrbitalAvatarOrb | null,
): OrbitalAvatarOrbit | null {
  if (!coreOrb || !payload.stats) return null;

  const [, accuracyScore] = getTriadScores(payload);
  return {
    radius: coreOrb.radius + 34,
    opacity: 0.2 + accuracyScore * 0.55,
    strokeWidth: 2.5 + accuracyScore * 5,
    color: "#FFFFFF",
  };
}

function buildShellOrbit(): OrbitalAvatarOrbit {
  return {
    radius: 134,
    opacity: 0.18,
    strokeWidth: 2.4,
    color: "rgba(255,255,255,0.72)",
  };
}

function buildCategorySatellites(
  payload: ReputationAvatarPayload,
  coreOrb: OrbitalAvatarOrb | null,
  nowSeconds: number,
  progress: number,
): OrbitalAvatarSatellite[] {
  if (!coreOrb) return [];

  return getVisibleCategories(payload, nowSeconds).map((category, index, categories) => {
    const seed = unitHash(`${payload.address}:${category.categoryId}:orbital-category`);
    const angle = progress * 360 + (360 / categories.length) * index + seed * 26;
    const radius = coreOrb.radius + 116 + (1 - category.categoryScore) * 18 + (index % 2) * 10;
    const point = polarToCartesian(angle, radius);
    const palette = getCategoryPalette(category.categoryId);

    return {
      x: point.x,
      y: point.y,
      radius: 6 + category.categoryScore * 10,
      color: palette.color,
      glowColor: palette.glowColor,
      opacity: category.opacity,
    };
  });
}

export function buildOrbitalAvatarModel(
  payload: ReputationAvatarPayload,
  options?: { nowSeconds?: number },
): OrbitalAvatarModel {
  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const variant = getAddressVariant(payload.address);
  const coreOrb = buildCoreOrb(payload, variant);
  const accuracyOrbit = buildAccuracyOrbit(payload, coreOrb);
  const categorySatellites = buildCategorySatellites(payload, coreOrb, nowSeconds, variant.progress);

  return {
    progress: variant.progress,
    compositionRotation: variant.compositionRotation,
    coreOrb,
    shellOrbit: coreOrb ? null : buildShellOrbit(),
    accuracyOrbit,
    categorySatellites,
  };
}

function renderOrbitalDefs(hashHex: string, model: OrbitalAvatarModel) {
  const defs: string[] = [];
  const bodies = [model.coreOrb, ...model.categorySatellites].filter(
    (body): body is OrbitalAvatarOrb | OrbitalAvatarSatellite => body !== null,
  );

  for (const [index, body] of bodies.entries()) {
    const bodyId = `orbital-avatar-body-${hashHex}-${index}`;
    const glowId = `orbital-avatar-body-glow-${hashHex}-${index}`;

    if ("colorA" in body) {
      defs.push(
        `<linearGradient id="${bodyId}" x1="0.15" y1="0.1" x2="0.85" y2="0.9" gradientUnits="objectBoundingBox" gradientTransform="rotate(${model.compositionRotation.toFixed(2)} 0.5 0.5)">
          <stop stop-color="${body.colorA}"/>
          <stop offset="0.52" stop-color="${body.colorB}"/>
          <stop offset="1" stop-color="${body.colorC}"/>
        </linearGradient>`,
      );
      defs.push(
        `<radialGradient id="${glowId}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${body.glowColor}" stop-opacity="0.24"/>
          <stop offset="100%" stop-color="${body.glowColor}" stop-opacity="0"/>
        </radialGradient>`,
      );
      defs.push(
        `<radialGradient id="orbital-avatar-highlight-${hashHex}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(0.38 0.3) scale(0.42 0.34)">
          <stop stop-color="#FFFFFF" stop-opacity="0.52"/>
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
        </radialGradient>`,
      );
    } else {
      defs.push(
        `<radialGradient id="${bodyId}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="0.54" stop-color="${body.color}"/>
          <stop offset="1" stop-color="${body.glowColor}"/>
        </radialGradient>`,
      );
      defs.push(
        `<radialGradient id="${glowId}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${body.glowColor}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${body.glowColor}" stop-opacity="0"/>
        </radialGradient>`,
      );
    }
  }

  return { markup: defs.join("") };
}

function renderOrbit(orbit: OrbitalAvatarOrbit) {
  return `<circle cx="${CENTER}" cy="${CENTER}" r="${orbit.radius.toFixed(2)}" fill="none" stroke="${orbit.color}" stroke-width="${orbit.strokeWidth.toFixed(2)}" stroke-opacity="${orbit.opacity.toFixed(3)}"/>`;
}

function renderSatellite(body: OrbitalAvatarSatellite, hashHex: string, index: number) {
  const bodyId = `orbital-avatar-body-${hashHex}-${index}`;
  const glowId = `orbital-avatar-body-glow-${hashHex}-${index}`;
  return `
    <circle cx="${body.x.toFixed(2)}" cy="${body.y.toFixed(2)}" r="${(body.radius * 2.25).toFixed(2)}" fill="url(#${glowId})" fill-opacity="${Math.min(0.28, body.opacity * 0.26).toFixed(3)}"/>
    <circle cx="${body.x.toFixed(2)}" cy="${body.y.toFixed(2)}" r="${body.radius.toFixed(2)}" fill="url(#${bodyId})" fill-opacity="${body.opacity.toFixed(3)}"/>`;
}

function renderCoreOrb(coreOrb: OrbitalAvatarOrb, hashHex: string) {
  return `
    <circle cx="${coreOrb.x.toFixed(2)}" cy="${coreOrb.y.toFixed(2)}" r="${(coreOrb.radius * 1.82).toFixed(2)}" fill="url(#orbital-avatar-body-glow-${hashHex}-0)" fill-opacity="0.7"/>
    <circle cx="${coreOrb.x.toFixed(2)}" cy="${coreOrb.y.toFixed(2)}" r="${coreOrb.radius.toFixed(2)}" fill="url(#orbital-avatar-body-${hashHex}-0)"/>
    <circle cx="${coreOrb.x.toFixed(2)}" cy="${coreOrb.y.toFixed(2)}" r="${(coreOrb.radius * 0.78).toFixed(2)}" fill="url(#orbital-avatar-highlight-${hashHex})"/>`;
}

export function renderOrbitalAvatarSvg(
  payload: ReputationAvatarPayload,
  options?: { size?: number; nowSeconds?: number },
) {
  const size = clamp(Number(options?.size ?? 96), 16, 512);
  const model = buildOrbitalAvatarModel(payload, { nowSeconds: options?.nowSeconds });
  const hashHex = hashString(payload.address).toString(16);
  const { markup } = renderOrbitalDefs(hashHex, model);

  const shellMarkup = model.shellOrbit ? renderOrbit(model.shellOrbit) : "";
  const accuracyMarkup = model.accuracyOrbit ? renderOrbit(model.accuracyOrbit) : "";
  const categoryMarkup = model.categorySatellites
    .map((body, index) => renderSatellite(body, hashHex, (model.coreOrb ? 1 : 0) + index))
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" fill="none">
  <defs>${markup}</defs>
  <g transform="rotate(${model.compositionRotation.toFixed(2)} ${CENTER} ${CENTER})">
    ${accuracyMarkup}
    ${shellMarkup}
    ${categoryMarkup}
    ${model.coreOrb ? renderCoreOrb(model.coreOrb, hashHex) : ""}
  </g>
</svg>`;
}
