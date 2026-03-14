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
const BACKGROUND_GRADIENT_FAMILIES = [
  { start: "#2A5FA8", mid: "#15305E", end: "#060D1D" },
  { start: "#18847A", mid: "#0D4D4A", end: "#061817" },
  { start: "#2F7A32", mid: "#19421F", end: "#09140B" },
  { start: "#6A44B5", mid: "#392268", end: "#14091F" },
  { start: "#9B3D8E", mid: "#5A2153", end: "#1D0918" },
  { start: "#A53C52", mid: "#5F1F32", end: "#1D0910" },
  { start: "#A46A24", mid: "#624015", end: "#201407" },
  { start: "#2A8AA3", mid: "#165264", end: "#09161D" },
  { start: "#4E7F9F", mid: "#294564", end: "#0B121B" },
] as const;

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

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (value: number) =>
    Math.round(clamp(value, 0, 255))
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function tintHex(hex: string, factor: number) {
  const { r, g, b } = hexToRgb(hex);
  const scale = 1 + factor;
  return rgbToHex(r * scale, g * scale, b * scale);
}

function getCategoryColor(categoryId: string) {
  const index = Number(BigInt(categoryId) % BigInt(CATEGORY_COLORS.length));
  return CATEGORY_COLORS[index];
}

function getAddressVariant(address: string) {
  const hashed = (salt: string) => unitHash(`${address}:${salt}`);
  const familyIndex =
    Math.floor(hashed("bg-family") * BACKGROUND_GRADIENT_FAMILIES.length) % BACKGROUND_GRADIENT_FAMILIES.length;
  const family = BACKGROUND_GRADIENT_FAMILIES[familyIndex];
  const tint = (hashed("bg-tint") - 0.5) * 0.18;

  return {
    coreAngleOffset: (hashed("core-angle") - 0.5) * 28,
    coreOrbitScale: 0.92 + hashed("core-orbit") * 0.18,
    coreRadiusScale: 0.94 + hashed("core-radius") * 0.14,
    coreMicroOffsets: CORE_ANGLES.map((_, index) => (hashed(`core-micro-${index}`) - 0.5) * 10),
    backgroundAngle: 26 + hashed("bg-angle") * 108,
    backgroundStart: tintHex(family.start, tint + hashed("bg-start-tint") * 0.06),
    backgroundMid: tintHex(family.mid, tint * 0.5 + (hashed("bg-mid-tint") - 0.5) * 0.08),
    backgroundEnd: tintHex(family.end, tint * 0.25 + (hashed("bg-end-tint") - 0.5) * 0.05),
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
  const orbit = (26 + 8 * average) * variant.coreOrbitScale;
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
      radius: (10 + 8 * score) * variant.coreRadiusScale,
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
      return [-18, 18];
    case 3:
      return [-26, 0, 26];
    case 4:
      return [-34, -12, 12, 34];
    default:
      return [-40, -20, 0, 20, 40];
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
        const orbitRadius = 132 - 18 * category.categoryScore + (1 - refinement) * 10;
        const position = polarToCartesian(displayAngle, orbitRadius);
        const color = getCategoryColor(category.categoryId);
        const node: CategoryNode = {
          id: `category-${category.categoryId}`,
          categoryId: category.categoryId,
          anchorId: coreNodes[anchorIndex].id,
          x: position.x,
          y: position.y,
          radius: (6 + 10 * category.categoryScore) * category.scale,
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
    backgroundAngle: variant.backgroundAngle,
    backgroundStart: variant.backgroundStart,
    backgroundMid: variant.backgroundMid,
    backgroundEnd: variant.backgroundEnd,
  };
}

function resolveNode(model: ReputationConstellationModel, id: string) {
  return [...model.coreNodes, ...model.categoryNodes].find(node => node.id === id);
}

export function renderReputationConstellationSvg(
  payload: ReputationAvatarPayload,
  options?: { size?: number; nowSeconds?: number },
) {
  const size = clamp(Number(options?.size ?? 96), 16, 512);
  const model = buildReputationConstellationModel(payload, { nowSeconds: options?.nowSeconds });
  const glowId = `avatar-glow-${hashString(payload.address).toString(16)}`;

  const edgeMarkup = model.edges
    .map(edge => {
      const from = resolveNode(model, edge.from);
      const to = resolveNode(model, edge.to);
      if (!from || !to) return "";
      return `<line x1="${from.x.toFixed(2)}" y1="${from.y.toFixed(2)}" x2="${to.x.toFixed(2)}" y2="${to.y.toFixed(2)}" stroke="${edge.stroke}" stroke-opacity="${edge.opacity.toFixed(3)}" stroke-width="${edge.width.toFixed(2)}" stroke-linecap="round" />`;
    })
    .join("");

  const categoryGlowMarkup = model.categoryNodes
    .map(
      node =>
        `<circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${(node.radius * 2.1).toFixed(2)}" fill="${node.fill}" fill-opacity="${node.glowOpacity.toFixed(3)}" filter="url(#${glowId})" />`,
    )
    .join("");

  const categoryNodeMarkup = model.categoryNodes
    .map(
      node =>
        `<circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${node.radius.toFixed(2)}" fill="${node.fill}" fill-opacity="${node.opacity.toFixed(3)}" />`,
    )
    .join("");

  const coreGlowMarkup = model.coreNodes
    .map(
      node =>
        `<circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${(node.radius * 2.2).toFixed(2)}" fill="${node.fill}" fill-opacity="${node.glowOpacity.toFixed(3)}" filter="url(#${glowId})" />`,
    )
    .join("");

  const coreNodeMarkup = model.coreNodes
    .map(
      node =>
        `<circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${node.radius.toFixed(2)}" fill="${node.fill}" fill-opacity="${node.opacity.toFixed(3)}" />`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox" gradientTransform="rotate(${model.backgroundAngle.toFixed(2)} 0.5 0.5)">
      <stop stop-color="${model.backgroundStart}"/>
      <stop offset="0.58" stop-color="${model.backgroundMid}"/>
      <stop offset="1" stop-color="${model.backgroundEnd}"/>
    </linearGradient>
    <filter id="${glowId}" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>
  <rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" rx="108" fill="url(#bg)"/>
  ${edgeMarkup}
  ${categoryGlowMarkup}
  ${coreGlowMarkup}
  ${categoryNodeMarkup}
  ${coreNodeMarkup}
</svg>`;
}
