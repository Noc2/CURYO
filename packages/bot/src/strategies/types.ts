export interface RatingStrategy {
  name: string;
  canRate(url: string): boolean;
  getScore(url: string): Promise<number | null>; // 0-10 normalized, null if unavailable
}
