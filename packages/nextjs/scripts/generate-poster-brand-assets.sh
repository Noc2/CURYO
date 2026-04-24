#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PUBLIC_DIR="$REPO_ROOT/packages/nextjs/public"
POSTER_ORB="$PUBLIC_DIR/launch/curyo-v2-orb-hero-alpha.png"
POSTER_ORB_WEBP="$PUBLIC_DIR/launch/curyo-v2-orb-hero-alpha.webp"
TMP_DIR="$(mktemp -d)"

trap 'rm -rf "$TMP_DIR"' EXIT

BOLD_FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REGULAR_FONT="/System/Library/Fonts/Supplemental/Arial.ttf"

ICON_SOURCE="$TMP_DIR/icon-source.png"
ICON_MASK="$TMP_DIR/icon-mask.png"
SOCIAL_SOURCE="$TMP_DIR/social-source.png"
BANNER_SOURCE="$TMP_DIR/banner-source.png"
OG_CANVAS="$TMP_DIR/og-image.png"
BANNER_CANVAS="$TMP_DIR/banner.png"

if [[ ! -f "$POSTER_ORB" ]]; then
  echo "Poster orb source not found: $POSTER_ORB" >&2
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' binary is required to generate poster brand assets." >&2
  exit 1
fi

if command -v cwebp >/dev/null 2>&1; then
  cwebp -q 90 -m 6 -alpha_q 98 "$POSTER_ORB" -o "$POSTER_ORB_WEBP" >/dev/null
else
  magick "$POSTER_ORB" -strip -quality 90 "$POSTER_ORB_WEBP"
fi

magick "$POSTER_ORB" \
  -crop 540x540+130+8 \
  +repage \
  -resize 512x512 \
  "$ICON_SOURCE"

magick -size 512x512 xc:none \
  -fill white \
  -draw "circle 256,256 256,16" \
  -blur 0x2 \
  "$ICON_MASK"

magick "$ICON_SOURCE" "$ICON_MASK" \
  -compose copyopacity \
  -composite \
  "$PUBLIC_DIR/favicon.png"

magick "$POSTER_ORB" \
  -resize 560x560 \
  "$SOCIAL_SOURCE"

magick -size 1200x630 xc:"#050607" \
  \( "$SOCIAL_SOURCE" \) \
  -gravity east \
  -geometry -48+98 \
  -compose over \
  -composite \
  -font "$BOLD_FONT" \
  -fill "#F7F2EE" \
  -pointsize 104 \
  -gravity northwest \
  -annotate +76+164 "CURYO" \
  -font "$BOLD_FONT" \
  -fill "#F7F2EE" \
  -pointsize 50 \
  -gravity northwest \
  -annotate +82+310 "AI asks, Humans Earn" \
  "$OG_CANVAS"

magick "$OG_CANVAS" \
  -strip \
  -quality 90 \
  "$PUBLIC_DIR/og-image.jpg"

magick "$OG_CANVAS" \
  -gravity center \
  -crop 1200x600+0+0 \
  +repage \
  -strip \
  -quality 90 \
  "$PUBLIC_DIR/twitter-image.jpg"

magick "$POSTER_ORB" \
  -resize 560x560 \
  "$BANNER_SOURCE"

magick -size 1600x520 xc:"#050607" \
  \( "$BANNER_SOURCE" \) \
  -gravity east \
  -geometry +36+100 \
  -compose over \
  -composite \
  -font "$BOLD_FONT" \
  -fill "#F7F2EE" \
  -pointsize 120 \
  -gravity northwest \
  -annotate +84+148 "CURYO" \
  -font "$BOLD_FONT" \
  -fill "#F7F2EE" \
  -pointsize 58 \
  -gravity northwest \
  -annotate +92+290 "AI asks, Humans Earn" \
  "$BANNER_CANVAS"

magick "$BANNER_CANVAS" \
  -strip \
  -quality 90 \
  "$PUBLIC_DIR/banner.jpg"
