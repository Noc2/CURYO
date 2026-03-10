export type PlatformType =
  | "youtube"
  | "twitch"
  | "scryfall"
  | "tmdb"
  | "wikipedia"
  | "rawg"
  | "openlibrary"
  | "coingecko"
  | "huggingface"
  | "spotify"
  | "twitter"
  | "github"
  | "generic";

export interface PlatformInfo {
  type: PlatformType;
  id: string | null;
  url: string;
  thumbnailUrl: string | null;
  embedUrl: string | null;
  metadata?: Record<string, unknown>;
}

export interface EmbedOptions {
  autoplay?: boolean;
  muted?: boolean;
  noCookie?: boolean;
  compact?: boolean;
}

export interface PlatformHandler {
  /** Check if this handler can process the URL */
  matches(url: string): boolean;

  /** Extract platform info from URL */
  extract(url: string): PlatformInfo;

  /** Get thumbnail URL */
  getThumbnail(info: PlatformInfo, quality?: string): string | null;

  /** Get embed URL for iframe embedding */
  getEmbedUrl(info: PlatformInfo, options?: EmbedOptions): string | null;

  /** Return a deterministic canonical URL for deduplication */
  getCanonicalUrl(url: string): string;
}
