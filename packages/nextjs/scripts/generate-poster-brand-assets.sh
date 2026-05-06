#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PUBLIC_DIR="$REPO_ROOT/packages/nextjs/public"
HERO_SOURCE="$PUBLIC_DIR/launch/curyo-human-loop-orange-orbits-neutral-ai.png"
HERO_WEBP="$PUBLIC_DIR/launch/curyo-human-loop-orange-orbits-neutral-ai.webp"
FAVICON_SVG="$PUBLIC_DIR/favicon.svg"
TMP_DIR="$(mktemp -d)"

trap 'rm -rf "$TMP_DIR"' EXIT

BOLD_FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REGULAR_FONT="/System/Library/Fonts/Supplemental/Arial.ttf"

HERO_SOCIAL="$TMP_DIR/hero-social.png"
HERO_BANNER="$TMP_DIR/hero-banner.png"
OG_CANVAS="$TMP_DIR/og-image.png"
BANNER_CANVAS="$TMP_DIR/banner.png"

if [[ ! -f "$HERO_SOURCE" ]]; then
  echo "Human loop hero source not found: $HERO_SOURCE" >&2
  exit 1
fi

if [[ ! -f "$FAVICON_SVG" ]]; then
  echo "Favicon source not found: $FAVICON_SVG" >&2
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' binary is required to generate brand assets." >&2
  exit 1
fi

if command -v cwebp >/dev/null 2>&1; then
  cwebp -q 92 -m 6 -alpha_q 98 "$HERO_SOURCE" -o "$HERO_WEBP" >/dev/null
else
  magick "$HERO_SOURCE" -strip -quality 92 "$HERO_WEBP"
fi

magick -size 512x512 xc:none \
  -fill none \
  -stroke "#ffffff" \
  -strokewidth 36.4 \
  -draw "path 'M 412.3,104.6 C 328.8,29.2 199.9,36 124.6,119.7 C 49.2,203.2 56,332.1 139.7,407.4 C 217.2,477.3 334.8,477.3 412.3,407.4'" \
  -fill "#ffffff" \
  -stroke none \
  -draw "circle 412.3,104.6 430.5,104.6" \
  -draw "circle 412.3,407.4 430.5,407.4" \
  -fill "#CC490F" \
  -stroke none \
  -draw "circle 276,256 400,256" \
  "$PUBLIC_DIR/favicon.png"
magick "$HERO_SOURCE" -resize 900x506 "$HERO_SOCIAL"
magick "$HERO_SOURCE" -resize 900x506 "$HERO_BANNER"

magick -size 1200x630 xc:"#000000" \
  \( "$HERO_SOCIAL" \) \
  -gravity east \
  -geometry -36+92 \
  -compose over \
  -composite \
  -fill "rgba(0,0,0,0.72)" \
  -draw "rectangle 0,0 548,630" \
  -font "$BOLD_FONT" \
  -fill "#F7F2EE" \
  -pointsize 72 \
  -gravity northwest \
  -annotate +76+190 "AI Asks," \
  -annotate +76+270 "Humans Earn" \
  -font "$REGULAR_FONT" \
  -fill "#C9C0BA" \
  -pointsize 30 \
  -annotate +82+382 "Verified, Staked Human Feedback" \
  -annotate +82+424 "for AI Agents" \
  "$OG_CANVAS"

magick "$OG_CANVAS" -strip -quality 92 "$PUBLIC_DIR/og-image.png"
magick "$OG_CANVAS" -strip -quality 90 "$PUBLIC_DIR/og-image.jpg"

magick "$OG_CANVAS" \
  -gravity center \
  -crop 1200x600+0+0 \
  +repage \
  "$PUBLIC_DIR/twitter-image.png"

magick "$PUBLIC_DIR/twitter-image.png" -strip -quality 90 "$PUBLIC_DIR/twitter-image.jpg"

magick -size 1600x520 xc:"#000000" \
  \( "$HERO_BANNER" \) \
  -gravity east \
  -geometry +18+68 \
  -compose over \
  -composite \
  -fill "rgba(0,0,0,0.74)" \
  -draw "rectangle 0,0 650,520" \
  -font "$BOLD_FONT" \
  -fill "#F7F2EE" \
  -pointsize 88 \
  -gravity northwest \
  -annotate +88+160 "AI Asks," \
  -annotate +88+260 "Humans Earn" \
  -font "$REGULAR_FONT" \
  -fill "#C9C0BA" \
  -pointsize 30 \
  -annotate +94+358 "Verified, Staked Human Feedback" \
  -annotate +94+396 "for AI Agents" \
  "$BANNER_CANVAS"

magick "$BANNER_CANVAS" -strip -quality 90 "$PUBLIC_DIR/banner.jpg"
