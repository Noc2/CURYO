/**
 * Backward compatibility layer for existing YouTube utilities.
 * These functions now delegate to the platform detection system.
 */
import { detectPlatform, youtubeHandler } from "./platforms";

/**
 * Get a YouTube thumbnail URL from a video URL.
 * Returns null if not a YouTube URL.
 */
export function getYouTubeThumbnail(
  url: string,
  quality: "default" | "mqdefault" | "hqdefault" | "maxresdefault" = "mqdefault",
): string | null {
  const info = detectPlatform(url);
  if (info.type !== "youtube") return null;
  return youtubeHandler.getThumbnail(info, quality);
}

/**
 * Extract YouTube video ID from a URL.
 * Supports youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
 */
export function extractYouTubeId(url: string): string | null {
  const info = detectPlatform(url);
  if (info.type !== "youtube") return null;
  return info.id;
}
