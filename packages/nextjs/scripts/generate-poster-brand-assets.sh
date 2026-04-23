#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PUBLIC_DIR="$REPO_ROOT/packages/nextjs/public"
POSTER_ORB="$PUBLIC_DIR/launch/curyo-v2-orb-hero-alpha.png"
TMP_DIR="$(mktemp -d)"

trap 'rm -rf "$TMP_DIR"' EXIT

BOLD_FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REGULAR_FONT="/System/Library/Fonts/Supplemental/Arial.ttf"

ICON_SOURCE="$TMP_DIR/icon-source.png"
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

magick "$POSTER_ORB" \
  -gravity center \
  -crop 820x820+0-24 \
  +repage \
  -resize 512x512 \
  "$ICON_SOURCE"

magick "$ICON_SOURCE" "$PUBLIC_DIR/favicon.png"

magick "$POSTER_ORB" \
  -gravity center \
  -crop 860x860+0-10 \
  +repage \
  -resize 760x760 \
  "$SOCIAL_SOURCE"

magick -size 1200x630 xc:"#050607" \
  \( "$SOCIAL_SOURCE" \) \
  -gravity east \
  -geometry +8-8 \
  -compose over \
  -composite \
  -font "$BOLD_FONT" \
  -fill "#F7F2EE" \
  -pointsize 104 \
  -gravity northwest \
  -annotate +76+164 "CURYO" \
  -font "$BOLD_FONT" \
  -fill "#F7F2EE" \
  -pointsize 56 \
  -gravity northwest \
  -annotate +82+278 $'AI Asks,\nHumans Stake' \
  -font "$REGULAR_FONT" \
  -fill "#D8CBC2" \
  -pointsize 24 \
  -gravity northwest \
  -annotate +84+414 "Verified Humans Give AI Agents Feedback and Earn USDC" \
  -fill "#F26426" \
  -draw "rectangle 84,454 444,458" \
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
  -gravity center \
  -crop 860x860+0-10 \
  +repage \
  -resize 700x700 \
  "$BANNER_SOURCE"

magick -size 1600x520 xc:"#050607" \
  \( "$BANNER_SOURCE" \) \
  -gravity east \
  -geometry +24+8 \
  -compose over \
  -composite \
  -font "$BOLD_FONT" \
  -fill "#F7F2EE" \
  -pointsize 120 \
  -gravity northwest \
  -annotate +84+148 "CURYO" \
  -font "$BOLD_FONT" \
  -fill "#F7F2EE" \
  -pointsize 60 \
  -gravity northwest \
  -annotate +92+254 "AI Asks, Humans Stake" \
  -font "$REGULAR_FONT" \
  -fill "#D8CBC2" \
  -pointsize 32 \
  -gravity northwest \
  -annotate +94+336 "Verified Humans Give AI Agents Feedback and Earn USDC" \
  -fill "#F26426" \
  -draw "rectangle 94,378 530,382" \
  "$BANNER_CANVAS"

magick "$BANNER_CANVAS" \
  -strip \
  -quality 90 \
  "$PUBLIC_DIR/banner.jpg"
