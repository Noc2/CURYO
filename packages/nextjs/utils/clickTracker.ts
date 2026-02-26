const CLICK_STORAGE_KEY = "curyo_content_clicks";
const MAX_CLICKS_STORED = 500;

export interface ContentClick {
  contentId: string;
  categoryId: string;
  timestamp: number;
}

export function trackContentClick(contentId: bigint, categoryId: bigint): void {
  if (typeof window === "undefined") return;

  try {
    const clicks = getContentClicks();
    const idStr = contentId.toString();
    const existing = clicks.findIndex(c => c.contentId === idStr);

    if (existing !== -1) {
      clicks[existing].timestamp = Date.now();
      clicks[existing].categoryId = categoryId.toString();
    } else {
      clicks.push({
        contentId: idStr,
        categoryId: categoryId.toString(),
        timestamp: Date.now(),
      });
    }

    // Keep only the most recent entries
    const trimmed = clicks.length > MAX_CLICKS_STORED ? clicks.slice(-MAX_CLICKS_STORED) : clicks;

    localStorage.setItem(CLICK_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage may be unavailable or full
  }
}

export function getContentClicks(): ContentClick[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(CLICK_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ContentClick[];
  } catch {
    return [];
  }
}
