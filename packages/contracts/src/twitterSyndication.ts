const BASE36_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const BASE36 = 36n;
const PI_FIXED = 3_141_592_653_589_793_238n;
const PI_SCALE = 1_000_000_000_000_000_000n;
const TWEET_ID_DIVISOR = 1_000_000_000_000_000n;
const DEFAULT_FRACTIONAL_DIGITS = 20;

function normalizeToken(value: string): string {
  return value.replace(/(0+|\.)/g, "");
}

function encodeBase36FixedPoint(numerator: bigint, denominator: bigint, fractionalDigits: number): string {
  const integerPart = numerator / denominator;
  let remainder = numerator % denominator;
  let encoded = integerPart.toString(36);

  if (fractionalDigits > 0 && remainder > 0n) {
    let fraction = "";

    for (let index = 0; index < fractionalDigits && remainder > 0n; index++) {
      remainder *= BASE36;
      const digit = Number(remainder / denominator);
      remainder %= denominator;
      fraction += BASE36_DIGITS[digit];
    }

    if (fraction.length > 0) {
      encoded += `.${fraction}`;
    }
  }

  return normalizeToken(encoded);
}

export function getLegacyTwitterSyndicationToken(id: string): string {
  return normalizeToken(((Number(id) / 1e15) * Math.PI).toString(36));
}

export function getPreciseTwitterSyndicationToken(
  id: string,
  fractionalDigits = DEFAULT_FRACTIONAL_DIGITS,
): string {
  const numerator = BigInt(id) * PI_FIXED;
  const denominator = TWEET_ID_DIVISOR * PI_SCALE;
  return encodeBase36FixedPoint(numerator, denominator, fractionalDigits);
}

export function getTwitterSyndicationTokens(id: string): string[] {
  const tokens = [
    getPreciseTwitterSyndicationToken(id),
    getLegacyTwitterSyndicationToken(id),
  ].filter(Boolean);

  return [...new Set(tokens)];
}
