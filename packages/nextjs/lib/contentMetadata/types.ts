export interface ContentMetadataResult {
  thumbnailUrl: string | null;
  title?: string;
  description?: string;
  imageUrl?: string;
  authors?: string[];
  releaseYear?: string;
  symbol?: string;
  stars?: number;
  forks?: number;
  language?: string;
}
