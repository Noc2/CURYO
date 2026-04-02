export interface ContentItem {
  url: string;
  title: string; // max 72 chars
  description: string; // max 280 chars
  tags: string; // comma-separated subcategory strings, max 256 chars
  categoryId: bigint; // on-chain category ID
}

export interface ContentSource {
  name: string;
  categoryId: bigint;
  categoryName: string;
  fetchTrending(limit: number): Promise<ContentItem[]>;
}
