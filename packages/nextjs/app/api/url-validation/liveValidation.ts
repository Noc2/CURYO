import { detectPlatform } from "~~/utils/platforms";

export function shouldPerformLiveValidation(url: string): boolean {
  return detectPlatform(url).type !== "generic";
}
