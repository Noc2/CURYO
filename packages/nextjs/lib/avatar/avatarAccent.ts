const AVATAR_ACCENT_HEX_REGEX = /^#?([0-9a-fA-F]{6})$/;

export function normalizeAvatarAccentHex(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(AVATAR_ACCENT_HEX_REGEX);
  if (!match) {
    return null;
  }

  return `#${match[1].toLowerCase()}`;
}

export function avatarAccentHexToRgb(value: string | null | undefined): number | null {
  const normalized = normalizeAvatarAccentHex(value);
  if (!normalized) {
    return null;
  }

  return Number.parseInt(normalized.slice(1), 16);
}

export function avatarAccentRgbToHex(value: number | bigint | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue > 0xffffff) {
    return null;
  }

  return `#${numericValue.toString(16).padStart(6, "0")}`;
}
