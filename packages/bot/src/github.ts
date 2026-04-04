const RESERVED_GITHUB_OWNERS = new Set([
  "about",
  "apps",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "explore",
  "features",
  "issues",
  "join",
  "login",
  "marketplace",
  "new",
  "notifications",
  "organizations",
  "orgs",
  "pricing",
  "pulls",
  "security",
  "settings",
  "signup",
  "sponsors",
  "topics",
  "trending",
]);

interface GitHubRepoRef {
  fullName: string;
  owner: string;
  repo: string;
}

export interface GitHubRepoMetadata {
  archived?: boolean;
  default_branch?: string;
  description?: string | null;
  disabled?: boolean;
  fork?: boolean;
  forks_count?: number;
  full_name: string;
  homepage?: string | null;
  html_url: string;
  language?: string | null;
  license?: { key?: string | null; spdx_id?: string | null } | null;
  name?: string;
  pushed_at?: string | null;
  stargazers_count?: number;
  topics?: string[];
}

const GITHUB_CLASSIFICATION_RULES: readonly { keywords: readonly string[]; subcategory: string }[] = [
  {
    keywords: ["tutorial", "course", "example", "examples", "learn", "guide", "workshop", "awesome"],
    subcategory: "Education",
  },
  {
    keywords: [
      "artificial intelligence",
      "machine learning",
      "deep learning",
      "ai ",
      " ai",
      "ml",
      "llm",
      "agent",
      "agents",
      "model",
      "transformer",
      "diffusion",
    ],
    subcategory: "AI/ML",
  },
  {
    keywords: ["web3", "defi", "ethereum", "solidity", "blockchain", "wallet", "smart contract", "layer 2"],
    subcategory: "DeFi/Web3",
  },
  {
    keywords: ["security", "auth", "oauth", "scanner", "vulnerability", "encryption", "cryptography", "jwt"],
    subcategory: "Security",
  },
  {
    keywords: [
      "kubernetes",
      "terraform",
      "docker",
      "cloud",
      "infra",
      "infrastructure",
      "devops",
      "platform",
      "observability",
      "monitoring",
      "deployment",
    ],
    subcategory: "Infrastructure",
  },
  {
    keywords: [
      "framework",
      "react",
      "nextjs",
      "next.js",
      "vue",
      "nuxt",
      "svelte",
      "angular",
      "django",
      "rails",
      "laravel",
      "starter",
    ],
    subcategory: "Frameworks",
  },
  {
    keywords: [
      "developer tool",
      "tooling",
      "devtools",
      "cli",
      "linter",
      "formatter",
      "compiler",
      "bundler",
      "build system",
      "test runner",
    ],
    subcategory: "Developer Tools",
  },
  {
    keywords: ["library", "sdk", "client", "package", "module", "toolkit", "utilities", "utility"],
    subcategory: "Libraries",
  },
];

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function collectGitHubRepoKeywords(repo: GitHubRepoMetadata): string {
  return [
    repo.full_name,
    repo.name,
    repo.description,
    repo.language,
    repo.homepage,
    ...(repo.topics ?? []),
  ]
    .filter(hasText)
    .join(" ")
    .toLowerCase();
}

function parseDaysSince(dateString: string | null | undefined, now: Date): number | null {
  if (!hasText(dateString)) {
    return null;
  }

  const timestamp = Date.parse(dateString);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, (now.getTime() - timestamp) / (1000 * 60 * 60 * 24));
}

export function extractGitHubRepo(url: string): GitHubRepoRef | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "github.com") {
      return null;
    }

    const match = parsed.pathname.match(/^\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
    if (!match) {
      return null;
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/i, "");
    if (!owner || !repo || RESERVED_GITHUB_OWNERS.has(owner.toLowerCase())) {
      return null;
    }

    return {
      fullName: `${owner}/${repo}`,
      owner,
      repo,
    };
  } catch {
    return null;
  }
}

export function createGitHubApiHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export function classifyGitHubRepo(repo: GitHubRepoMetadata): string {
  const haystack = collectGitHubRepoKeywords(repo);

  for (const rule of GITHUB_CLASSIFICATION_RULES) {
    if (rule.keywords.some(keyword => haystack.includes(keyword))) {
      return rule.subcategory;
    }
  }

  return "Libraries";
}

export function formatGitHubRepoDescription(repo: GitHubRepoMetadata): string {
  const parts: string[] = [];
  const description = repo.description?.trim();
  if (description) {
    parts.push(description);
  }

  const stats: string[] = [];
  if (typeof repo.stargazers_count === "number") {
    stats.push(`${repo.stargazers_count} stars`);
  }
  if (typeof repo.forks_count === "number") {
    stats.push(`${repo.forks_count} forks`);
  }
  if (hasText(repo.language)) {
    stats.push(repo.language);
  }
  if (stats.length > 0) {
    parts.push(stats.join(" • "));
  }

  return parts.join(" • ") || repo.full_name;
}

export function calculateGitHubRepoScore(repo: GitHubRepoMetadata, now = new Date()): number {
  const stars = Math.max(repo.stargazers_count ?? 0, 0);
  const forks = Math.max(repo.forks_count ?? 0, 0);

  let score = 0;
  score += Math.min(Math.log10(stars + 1) * 1.8, 4.5);
  score += Math.min(Math.log10(forks + 1) * 1.0, 2.0);

  const daysSincePush = parseDaysSince(repo.pushed_at, now);
  if (daysSincePush !== null) {
    if (daysSincePush <= 30) {
      score += 2.5;
    } else if (daysSincePush <= 90) {
      score += 2.0;
    } else if (daysSincePush <= 180) {
      score += 1.5;
    } else if (daysSincePush <= 365) {
      score += 0.75;
    } else if (daysSincePush > 730) {
      score -= 1.0;
    }
  }

  if (hasText(repo.description)) {
    score += 0.5;
  }
  if (repo.license?.spdx_id || repo.license?.key) {
    score += 0.5;
  }
  if (hasText(repo.homepage)) {
    score += 0.25;
  }
  if (hasText(repo.language)) {
    score += 0.25;
  }
  if (repo.fork) {
    score -= 1.5;
  }
  if (repo.archived) {
    score -= 4.0;
  }
  if (repo.disabled) {
    score -= 6.0;
  }

  return Math.min(Math.max(score, 0), 10);
}
