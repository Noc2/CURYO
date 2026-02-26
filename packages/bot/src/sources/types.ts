export interface ContentItem {
  url: string;
  title: string;
  goal: string; // description, max 500 chars
  tags: string; // comma-separated subcategory strings, max 256 chars
  categoryId: bigint; // on-chain category ID
}

export interface ContentSource {
  name: string;
  categoryId: bigint;
  fetchTrending(limit: number): Promise<ContentItem[]>;
}
