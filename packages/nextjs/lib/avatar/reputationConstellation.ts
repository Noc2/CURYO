export interface ReputationAvatarStats {
  totalSettledVotes: number;
  totalWins: number;
  totalLosses: number;
  currentStreak: number;
  bestWinStreak: number;
  winRate: number;
}

export interface ReputationAvatarStreak {
  currentDailyStreak: number;
  bestDailyStreak: number;
  totalActiveDays: number;
  lastActiveDate: string | null;
  lastMilestoneDay: number;
}

export interface ReputationAvatarVoterId {
  tokenId: string;
  mintedAt: string;
}

export interface ReputationAvatarCategory {
  categoryId: string;
  categoryName: string | null;
  settledVotes90d: number;
  wins90d: number;
  losses90d: number;
  stakeWon90d: string;
  stakeLost90d: string;
  totalStake90d: string;
  winRate90d: number;
  lastSettledAt: string;
}

export interface ReputationAvatarPayload {
  address: string;
  balance: string;
  voterId: ReputationAvatarVoterId | null;
  stats: ReputationAvatarStats | null;
  streak: ReputationAvatarStreak | null;
  categories90d: ReputationAvatarCategory[];
}

interface Point {
  x: number;
  y: number;
}

interface Node extends Point {
  id: string;
  radius: number;
  fill: string;
  opacity: number;
  glowOpacity: number;
}

interface Edge {
  from: string;
  to: string;
  stroke: string;
  opacity: number;
  width: number;
}

interface CategoryNode extends Node {
  categoryId: string;
  anchorId: string;
}

export interface ReputationConstellationModel {
  coreNodes: Node[];
  categoryNodes: CategoryNode[];
  edges: Edge[];
  backgroundBase: string;
  backgroundShadow: string;
  backgroundAngle: number;
  backgroundStart: string;
  backgroundMid: string;
  backgroundEnd: string;
}

const VIEWBOX_SIZE = 512;
const CENTER = VIEWBOX_SIZE / 2;
const CORE_COLORS = ["#55A8FF", "#20DFC1", "#C59CFF"] as const;
const CATEGORY_COLORS = [
  "#55A8FF",
  "#20DFC1",
  "#7BE96D",
  "#F4C15D",
  "#C59CFF",
  "#FF8AB0",
  "#6CE7F8",
  "#94F36B",
] as const;
const CORE_ANGLES = [210, 330, 90] as const;

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

function getCategoryColor(categoryId: string) {
  const index = Number(BigInt(categoryId) % BigInt(CATEGORY_COLORS.length));
  return CATEGORY_COLORS[index];
}

function getAddressVariant(address: string) {
  const hashed = (salt: string) => unitHash(`${address}:${salt}`);
  const seedHex = getAddressColorSeed(address);
  const seedValue = Number.parseInt(seedHex, 16);
  const { r, g, b } = hexToRgb(seedHex);
  const seedHsl = rgbToHsl(r, g, b);
  const hue = seedHsl.saturation < 0.18 ? seedValue % 360 : seedHsl.hue;
  const saturation = Math.max(seedHsl.saturation * 100, 68);
  const angleSeed = ((seedValue >> 8) & 0xff) / 255;

  return {
    coreAngleOffset: (hashed("core-angle") - 0.5) * 28,
    coreOrbitScale: 0.92 + hashed("core-orbit") * 0.18,
    coreRadiusScale: 0.94 + hashed("core-radius") * 0.14,
    coreMicroOffsets: CORE_ANGLES.map((_, index) => (hashed(`core-micro-${index}`) - 0.5) * 10),
    backgroundAngle: 18 + angleSeed * 144,
    backgroundBase: hslToHex(hue, Math.max(saturation - 14, 52), 8),
    backgroundShadow: hslToHex(hue + 6, Math.max(saturation - 18, 44), 3),
    backgroundStart: hslToHex(hue + 24, saturation, 24),
    backgroundMid: hslToHex(hue - 18, Math.max(saturation - 8, 58), 20),
    backgroundEnd: hslToHex(hue + 62, Math.max(saturation - 4, 60), 22),
  };
}

function getNodeGradientColors(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const { hue, saturation, lightness } = rgbToHsl(r, g, b);
  const saturationPct = saturation * 100;
  const lightnessPct = lightness * 100;

  return {
    coreCenter: hslToHex(hue + 1, Math.max(40, saturationPct - 22), Math.min(74, lightnessPct + 16)),
    coreMid: hslToHex(hue, Math.min(92, saturationPct + 4), Math.min(62, lightnessPct + 8)),
    coreEdge: hslToHex(hue - 3, Math.max(50, saturationPct - 2), Math.max(24, lightnessPct - 2)),
    glowCenter: hslToHex(hue + 3, Math.min(92, saturationPct + 5), Math.min(52, lightnessPct + 2)),
    glowEdge: hslToHex(hue + 8, Math.max(40, saturationPct - 10), Math.max(20, lightnessPct - 4)),
  };
}

function getVisibleCategories(payload: ReputationAvatarPayload, nowSeconds: number) {
  return payload.categories90d
    .map(category => {
      const settledVotes90d = category.settledVotes90d;
      if (settledVotes90d < 3) return null;

      const activityScore = clamp(settledVotes90d / 12, 0, 1);
      const categoryAccuracyConfidence = clamp(settledVotes90d / 8, 0, 1);
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
      let glowOpacity = 1;
      let scale = 1;

      if (daysSinceLastSettledVote > 45) {
        const t = clamp((daysSinceLastSettledVote - 45) / 45, 0, 1);
        opacity = 0.45 - t * 0.31;
        glowOpacity = 0.35 - t * 0.35;
        scale = 0.88 - t * 0.12;
      } else if (daysSinceLastSettledVote > 14) {
        const t = clamp((daysSinceLastSettledVote - 14) / 31, 0, 1);
        opacity = 1 - t * 0.55;
        glowOpacity = 1 - t * 0.65;
        scale = 1 - t * 0.12;
      }

      return {
        ...category,
        categoryScore,
        opacity,
        glowOpacity,
        scale,
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

function getRefinement(payload: ReputationAvatarPayload) {
  const stats = payload.stats;
  if (!stats) return 0;
  return clamp((stats.winRate - 0.5) / 0.25, 0, 1) * clamp(stats.totalSettledVotes / 40, 0, 1);
}

function getCoreNodes(payload: ReputationAvatarPayload, variant: ReturnType<typeof getAddressVariant>) {
  const [balanceScore, accuracyScore, participationScore] = getTriadScores(payload);
  const average = (balanceScore + accuracyScore + participationScore) / 3;
  const orbit = (78 + 18 * average) * variant.coreOrbitScale;
  const scores = [balanceScore, accuracyScore, participationScore];

  return scores.map((score, index) => {
    const point = polarToCartesian(
      CORE_ANGLES[index] + variant.coreAngleOffset + variant.coreMicroOffsets[index],
      orbit,
    );
    return {
      id: `core-${index}`,
      x: point.x,
      y: point.y,
      radius: (17 + 12 * score) * variant.coreRadiusScale,
      fill: CORE_COLORS[index],
      opacity: 0.96,
      glowOpacity: 0.22 + 0.48 * score,
    };
  });
}

function getAnchorOffsets(count: number) {
  switch (count) {
    case 0:
      return [];
    case 1:
      return [0];
    case 2:
      return [-40, 40];
    case 3:
      return [-56, 0, 56];
    case 4:
      return [-72, -24, 24, 72];
    default:
      return [-84, -42, 0, 42, 84];
  }
}

export function buildReputationConstellationModel(
  payload: ReputationAvatarPayload,
  options?: { nowSeconds?: number },
): ReputationConstellationModel {
  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const variant = getAddressVariant(payload.address);
  const hasClaimedVoterId = payload.voterId !== null;
  const refinement = getRefinement(payload);
  const coreNodes = hasClaimedVoterId ? getCoreNodes(payload, variant) : [];
  const visibleCategories = getVisibleCategories(payload, nowSeconds);
  const categoryNodes: CategoryNode[] = [];
  const edges: Edge[] = [];

  if (coreNodes.length === 3) {
    edges.push(
      {
        from: coreNodes[0].id,
        to: coreNodes[1].id,
        stroke: "#6AB8FF",
        opacity: 0.55,
        width: 3.2,
      },
      {
        from: coreNodes[1].id,
        to: coreNodes[2].id,
        stroke: "#5BE0C7",
        opacity: 0.55,
        width: 3.2,
      },
      {
        from: coreNodes[2].id,
        to: coreNodes[0].id,
        stroke: "#C9A7FF",
        opacity: 0.55,
        width: 3.2,
      },
    );
  }

  if (coreNodes.length === 3) {
    const grouped = new Map<number, typeof visibleCategories>();
    for (const category of visibleCategories) {
      const anchorIndex = Number(BigInt(category.categoryId) % 3n);
      const group = grouped.get(anchorIndex) ?? [];
      group.push(category);
      grouped.set(anchorIndex, group);
    }

    for (const [anchorIndex, categories] of grouped) {
      const offsets = getAnchorOffsets(categories.length);
      categories.forEach((category, index) => {
        const snappedAngle = CORE_ANGLES[anchorIndex] + variant.coreAngleOffset + offsets[index];
        const noise = (unitHash(`${payload.address}:${category.categoryId}`) - 0.5) * 34;
        const looseAngle = snappedAngle + noise;
        const displayAngle = looseAngle + (snappedAngle - looseAngle) * refinement;
        const orbitRadius = 228 - 30 * category.categoryScore + (1 - refinement) * 24;
        const position = polarToCartesian(displayAngle, orbitRadius);
        const color = getCategoryColor(category.categoryId);
        const node: CategoryNode = {
          id: `category-${category.categoryId}`,
          categoryId: category.categoryId,
          anchorId: coreNodes[anchorIndex].id,
          x: position.x,
          y: position.y,
          radius: (11 + 15 * category.categoryScore) * category.scale,
          fill: color,
          opacity: category.opacity,
          glowOpacity: (0.15 + 0.55 * category.categoryScore) * category.glowOpacity,
        };
        categoryNodes.push(node);
        edges.push({
          from: node.id,
          to: node.anchorId,
          stroke: color,
          opacity: (0.25 + 0.5 * category.categoryScore) * category.opacity,
          width: (1.5 + 2.5 * category.categoryScore) * category.scale,
        });
      });
    }
  }

  return {
    coreNodes,
    categoryNodes,
    edges,
    backgroundBase: variant.backgroundBase,
    backgroundShadow: variant.backgroundShadow,
    backgroundAngle: variant.backgroundAngle,
    backgroundStart: variant.backgroundStart,
    backgroundMid: variant.backgroundMid,
    backgroundEnd: variant.backgroundEnd,
  };
}

export function renderReputationConstellationSvg(
  payload: ReputationAvatarPayload,
  options?: { size?: number; nowSeconds?: number },
) {
  const size = clamp(Number(options?.size ?? 96), 16, 512);
  const model = buildReputationConstellationModel(payload, { nowSeconds: options?.nowSeconds });
  const hashHex = hashString(payload.address).toString(16);
  const bgId = `avatar-bg-${hashHex}`;
  const shadowId = `avatar-shadow-${hashHex}`;
  const nebulaAId = `avatar-nebula-a-${hashHex}`;
  const nebulaBId = `avatar-nebula-b-${hashHex}`;
  const nebulaCId = `avatar-nebula-c-${hashHex}`;
  const allNodes = [...model.categoryNodes, ...model.coreNodes];
  const nodeGradientDefs = allNodes
    .map(node => {
      const colors = getNodeGradientColors(node.fill);
      const glowGradientId = `avatar-node-glow-${hashHex}-${node.id}`;
      const coreGradientId = `avatar-node-core-${hashHex}-${node.id}`;

      return `
    <radialGradient id="${glowGradientId}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${colors.glowCenter}" stop-opacity="${Math.min(0.72, 0.34 + node.glowOpacity * 0.38).toFixed(3)}"/>
      <stop offset="58%" stop-color="${colors.glowEdge}" stop-opacity="${Math.min(0.34, 0.1 + node.glowOpacity * 0.18).toFixed(3)}"/>
      <stop offset="100%" stop-color="${colors.glowEdge}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${coreGradientId}" cx="50%" cy="50%" r="58%">
      <stop offset="0%" stop-color="${colors.coreCenter}" stop-opacity="0.98"/>
      <stop offset="18%" stop-color="${colors.coreCenter}" stop-opacity="0.94"/>
      <stop offset="56%" stop-color="${colors.coreMid}" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="${colors.coreEdge}" stop-opacity="1"/>
    </radialGradient>`;
    })
    .join("");

  const categoryGlowMarkup = model.categoryNodes
    .map(node => {
      const glowGradientId = `avatar-node-glow-${hashHex}-${node.id}`;
      return `<circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${(node.radius * 2.55).toFixed(2)}" fill="url(#${glowGradientId})" fill-opacity="${Math.min(1, node.glowOpacity * 1.08).toFixed(3)}" />`;
    })
    .join("");

  const categoryNodeMarkup = model.categoryNodes
    .map(node => {
      const coreGradientId = `avatar-node-core-${hashHex}-${node.id}`;
      return `<circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${node.radius.toFixed(2)}" fill="url(#${coreGradientId})" fill-opacity="${node.opacity.toFixed(3)}" />`;
    })
    .join("");

  const coreGlowMarkup = model.coreNodes
    .map(node => {
      const glowGradientId = `avatar-node-glow-${hashHex}-${node.id}`;
      return `<circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${(node.radius * 2.85).toFixed(2)}" fill="url(#${glowGradientId})" fill-opacity="${Math.min(1, node.glowOpacity * 1.12).toFixed(3)}" />`;
    })
    .join("");

  const coreNodeMarkup = model.coreNodes
    .map(node => {
      const coreGradientId = `avatar-node-core-${hashHex}-${node.id}`;
      return `<circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${node.radius.toFixed(2)}" fill="url(#${coreGradientId})" fill-opacity="${node.opacity.toFixed(3)}" />`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" fill="none">
  <defs>
    <linearGradient id="${bgId}" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox" gradientTransform="rotate(${model.backgroundAngle.toFixed(2)} 0.5 0.5)">
      <stop stop-color="${model.backgroundBase}"/>
      <stop offset="1" stop-color="${model.backgroundBase}"/>
    </linearGradient>
    <radialGradient id="${shadowId}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(0 0) scale(1.1 1.1)">
      <stop stop-color="${model.backgroundShadow}" stop-opacity="0.9"/>
      <stop offset="0.95" stop-color="${model.backgroundShadow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${nebulaAId}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(1.08 -0.08) scale(1.55 0.95)">
      <stop stop-color="${model.backgroundStart}" stop-opacity="0.82"/>
      <stop offset="0.5" stop-color="${model.backgroundMid}" stop-opacity="0.46"/>
      <stop offset="0.95" stop-color="${model.backgroundEnd}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${nebulaBId}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(0.48 0.52) scale(1.75 0.98)">
      <stop stop-color="${model.backgroundEnd}" stop-opacity="0.72"/>
      <stop offset="0.95" stop-color="${model.backgroundEnd}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${nebulaCId}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(0 0) scale(1.25 1.25)">
      <stop stop-color="${model.backgroundShadow}" stop-opacity="0.88"/>
      <stop offset="0.95" stop-color="${model.backgroundShadow}" stop-opacity="0"/>
    </radialGradient>
    ${nodeGradientDefs}
  </defs>
  <rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" rx="108" fill="url(#${bgId})"/>
  <rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" rx="108" fill="url(#${shadowId})"/>
  <rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" rx="108" fill="url(#${nebulaAId})"/>
  <rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" rx="108" fill="url(#${nebulaBId})"/>
  <rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" rx="108" fill="url(#${nebulaCId})"/>
  ${categoryGlowMarkup}
  ${coreGlowMarkup}
  ${categoryNodeMarkup}
  ${coreNodeMarkup}
</svg>`;
}
