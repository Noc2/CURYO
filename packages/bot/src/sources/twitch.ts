import { config, log } from "../config.js";
import { truncateContentDescription, truncateContentTitle } from "../contentLimits.js";
import { fetchWithTimeout } from "../utils.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 8n;

// Map Twitch game/category names to on-chain subcategory names
const GAME_TO_SUBCATEGORY: Record<string, string> = {
  "Just Chatting": "Talk Shows",
  "Music": "Music",
  "Sports": "Sports",
  "Art": "Creative",
  "Makers & Crafting": "Creative",
  "Science & Technology": "Creative",
};

async function getTwitchGameNames(gameIds: string[], token: string): Promise<Map<string, string>> {
  const uniqueGameIds = [...new Set(gameIds.filter(Boolean))];
  if (uniqueGameIds.length === 0) {
    return new Map();
  }

  const query = new URLSearchParams();
  for (const gameId of uniqueGameIds) {
    query.append("id", gameId);
  }

  try {
    const res = await fetchWithTimeout(`https://api.twitch.tv/helix/games?${query.toString()}`, 15_000, {
      headers: {
        "Client-Id": config.twitchClientId!,
        "Authorization": `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      log.warn(`Twitch games API error: ${res.status} ${res.statusText}`);
      return new Map();
    }

    const data = await res.json();
    return new Map((data.data ?? []).map((game: { id: string; name: string }) => [game.id, game.name]));
  } catch (err: any) {
    log.warn(`Twitch games lookup error: ${err.message}`);
    return new Map();
  }
}

async function getTwitchToken(): Promise<string | null> {
  if (!config.twitchClientId || !config.twitchClientSecret) return null;

  try {
    const res = await fetchWithTimeout("https://id.twitch.tv/oauth2/token", 15_000, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.twitchClientId,
        client_secret: config.twitchClientSecret,
        grant_type: "client_credentials",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token;
  } catch {
    return null;
  }
}

export const twitchSource: ContentSource = {
  name: "twitch",
  categoryId: CATEGORY_ID,
  categoryName: "Media and Images",

  async fetchTrending(limit: number): Promise<ContentItem[]> {
    if (!config.twitchClientId || !config.twitchClientSecret) {
      log.debug("Twitch source skipped: TWITCH_CLIENT_ID/SECRET not set");
      return [];
    }

    const token = await getTwitchToken();
    if (!token) {
      log.warn("Twitch source: failed to get OAuth token");
      return [];
    }

    try {
      // Get top clips from the past day
      const res = await fetchWithTimeout(
        `https://api.twitch.tv/helix/clips?first=${limit}&started_at=${new Date(Date.now() - 86400000).toISOString()}`,
        15_000,
        {
          headers: {
            "Client-Id": config.twitchClientId,
            "Authorization": `Bearer ${token}`,
          },
        },
      );
      if (!res.ok) {
        log.warn(`Twitch API error: ${res.status} ${res.statusText}`);
        return [];
      }

      const data = await res.json();
      const gameNames = await getTwitchGameNames(
        (data.data ?? []).map((clip: { game_id?: string }) => clip.game_id ?? "").filter(Boolean),
        token,
      );
      const items: ContentItem[] = [];

      for (const clip of data.data ?? []) {
        const gameName = clip.game_id ? gameNames.get(clip.game_id) : undefined;
        const tag = gameName ? GAME_TO_SUBCATEGORY[gameName] || "Gaming" : "Talk Shows";
        const title = truncateContentTitle(clip.title);

        items.push({
          url: clip.url,
          title,
          description: truncateContentDescription(`${title} — clipped from ${clip.broadcaster_name}`),
          tags: tag,
          categoryId: CATEGORY_ID,
        });
      }

      return items;
    } catch (err: any) {
      log.warn(`Twitch source error: ${err.message}`);
      return [];
    }
  },
};
