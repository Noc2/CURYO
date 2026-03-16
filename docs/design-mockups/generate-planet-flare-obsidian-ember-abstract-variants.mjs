#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const variants = [
  {
    id: "gradient-core",
    label: "Gradient Core",
    caption: "Warmer ember gradient, flatter than the current planet.",
    shape: "gradient",
    flareDasharray: "944 1782",
    flareRotation: -92,
    flareRadius: 404,
    coreStops: [
      { color: "#FFF2DD" },
      { offset: "0.16", color: "#FFBC7D" },
      { offset: "0.34", color: "#FF7F46" },
      { offset: "0.56", color: "#D33F24" },
      { offset: "0.78", color: "#561A18" },
      { offset: "1", color: "#120F14" },
    ],
  },
  {
    id: "abstract-eclipse",
    label: "Abstract Eclipse",
    caption: "Keeps the flare, but turns the core into an eclipse-like mark.",
    shape: "eclipse",
    flareDasharray: "1016 1710",
    flareRotation: -94,
    flareRadius: 410,
    coreStops: [
      { color: "#FFF4E6" },
      { offset: "0.18", color: "#FFB36B" },
      { offset: "0.38", color: "#FF6E3D" },
      { offset: "0.58", color: "#C83722" },
      { offset: "0.8", color: "#431717" },
      { offset: "1", color: "#100E13" },
    ],
  },
  {
    id: "abstract-lens",
    label: "Abstract Lens",
    caption: "More emblem-like and less planetary through an elongated ember core.",
    shape: "lens",
    flareDasharray: "980 1766",
    flareRotation: -90,
    flareRadius: 414,
    coreStops: [
      { color: "#FFF4E8" },
      { offset: "0.18", color: "#FFB877" },
      { offset: "0.4", color: "#FF7445" },
      { offset: "0.62", color: "#D33B24" },
      { offset: "0.84", color: "#4A1B19" },
      { offset: "1", color: "#120F15" },
    ],
  },
  {
    id: "abstract-signal",
    label: "Abstract Signal",
    caption: "Most abstract of the set, with the ember treated more like a signal source.",
    shape: "signal",
    flareDasharray: "922 1820",
    flareRotation: -92,
    flareRadius: 404,
    coreStops: [
      { color: "#FFF6EC" },
      { offset: "0.18", color: "#FFC284" },
      { offset: "0.38", color: "#FF8852" },
      { offset: "0.58", color: "#DD4A28" },
      { offset: "0.8", color: "#5B1E1A" },
      { offset: "1", color: "#131016" },
    ],
  },
];

function gradientStops(stops) {
  return stops
    .map(stop => {
      const offset = stop.offset ? ` offset="${stop.offset}"` : "";
      return `      <stop${offset} stop-color="${stop.color}"/>`;
    })
    .join("\n");
}

function renderDefs(prefix, variant) {
  return `
  <defs>
    <radialGradient id="${prefix}-bg-left" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(244 236) rotate(50) scale(286 334)">
      <stop stop-color="#28426F" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#28426F" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${prefix}-bg-right" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(804 248) rotate(144) scale(322 254)">
      <stop stop-color="#F36D72" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#F36D72" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${prefix}-bg-bottom" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(704 876) rotate(161) scale(414 180)">
      <stop stop-color="#FF7A47" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#FF7A47" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="${prefix}-core-base" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(632 348) rotate(132) scale(492 468)">
${gradientStops(variant.coreStops)}
    </radialGradient>
    <radialGradient id="${prefix}-core-shadow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(370 664) rotate(-26) scale(250 166)">
      <stop stop-color="#06070A" stop-opacity="0.84"/>
      <stop offset="1" stop-color="#06070A" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${prefix}-core-highlight" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(650 326) rotate(142) scale(206 134)">
      <stop stop-color="#FFF6E9" stop-opacity="0.56"/>
      <stop offset="0.48" stop-color="#FFF6E9" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#FFF6E9" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${prefix}-flare-gradient" x1="674" y1="146" x2="906" y2="704" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F45C4D"/>
      <stop offset="0.24" stop-color="#FF8A5D"/>
      <stop offset="0.56" stop-color="#FFC37A"/>
      <stop offset="0.82" stop-color="#FFE1A7"/>
      <stop offset="1" stop-color="#FFF4DB"/>
    </linearGradient>
    <linearGradient id="${prefix}-flare-core" x1="684" y1="160" x2="892" y2="690" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FF9E78"/>
      <stop offset="0.48" stop-color="#FFF0CF"/>
      <stop offset="1" stop-color="#FFF8ED"/>
    </linearGradient>
    <filter id="${prefix}-blur-18" x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <filter id="${prefix}-blur-24" x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="24"/>
    </filter>
    <filter id="${prefix}-blur-34" x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="34"/>
    </filter>
    <clipPath id="${prefix}-circle-clip">
      <circle cx="512" cy="512" r="308"/>
    </clipPath>
    <clipPath id="${prefix}-lens-clip">
      <ellipse cx="512" cy="512" rx="258" ry="312"/>
    </clipPath>
  </defs>`;
}

function renderBackground(prefix) {
  return `
  <rect width="1024" height="1024" rx="40" fill="#080B12"/>
  <rect width="1024" height="1024" rx="40" fill="url(#${prefix}-bg-left)"/>
  <rect width="1024" height="1024" rx="40" fill="url(#${prefix}-bg-right)"/>
  <rect width="1024" height="1024" rx="40" fill="url(#${prefix}-bg-bottom)"/>`;
}

function renderFlare(prefix, variant) {
  return `
  <circle cx="512" cy="512" r="${(variant.flareRadius + 18).toFixed(0)}" stroke="#FFFFFF" stroke-opacity="0.028" stroke-width="2"/>
  <g filter="url(#${prefix}-blur-24)">
    <circle cx="512" cy="512" r="${variant.flareRadius}" stroke="#FF6B4A" stroke-opacity="0.48" stroke-width="30" stroke-linecap="round" stroke-dasharray="${variant.flareDasharray}" transform="rotate(${variant.flareRotation} 512 512)"/>
  </g>
  <circle cx="512" cy="512" r="${variant.flareRadius}" stroke="#6C3328" stroke-opacity="0.44" stroke-width="14" stroke-linecap="round" stroke-dasharray="${variant.flareDasharray}" transform="rotate(${variant.flareRotation} 512 512)"/>
  <circle cx="512" cy="512" r="${variant.flareRadius}" stroke="url(#${prefix}-flare-gradient)" stroke-width="11" stroke-linecap="round" stroke-dasharray="${variant.flareDasharray}" transform="rotate(${variant.flareRotation} 512 512)"/>
  <circle cx="512" cy="512" r="${variant.flareRadius}" stroke="url(#${prefix}-flare-core)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${variant.flareDasharray}" transform="rotate(${variant.flareRotation} 512 512)"/>`;
}

function renderGradientCore(prefix) {
  return `
  <g clip-path="url(#${prefix}-circle-clip)">
    <circle cx="512" cy="512" r="308" fill="url(#${prefix}-core-base)"/>
    <g filter="url(#${prefix}-blur-18)">
      <ellipse cx="328" cy="414" rx="214" ry="164" fill="#C5301E" fill-opacity="0.22"/>
      <ellipse cx="610" cy="324" rx="238" ry="174" fill="#FF7B44" fill-opacity="0.32"/>
      <ellipse cx="708" cy="442" rx="224" ry="152" fill="#FFD3AC" fill-opacity="0.22"/>
      <ellipse cx="622" cy="650" rx="262" ry="154" fill="#5F211A" fill-opacity="0.18"/>
      <ellipse cx="358" cy="716" rx="286" ry="170" fill="#111015" fill-opacity="0.72"/>
    </g>
    <path d="M190 418C284 374 392 374 502 400C596 422 684 432 788 426" stroke="#FFF4E2" stroke-opacity="0.08" stroke-width="18" stroke-linecap="round"/>
    <path d="M186 568C286 530 398 538 516 564C608 584 694 594 792 586" stroke="#E07A53" stroke-opacity="0.12" stroke-width="22" stroke-linecap="round"/>
  </g>
  <circle cx="512" cy="512" r="308" fill="url(#${prefix}-core-shadow)"/>
  <g filter="url(#${prefix}-blur-24)">
    <ellipse cx="642" cy="334" rx="142" ry="98" fill="#FFF3E2" fill-opacity="0.24"/>
  </g>
  <circle cx="512" cy="512" r="308" fill="url(#${prefix}-core-highlight)"/>
  <circle cx="512" cy="512" r="308" fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="1.4"/>`;
}

function renderEclipseCore(prefix) {
  return `
  <g clip-path="url(#${prefix}-circle-clip)">
    <circle cx="512" cy="512" r="304" fill="url(#${prefix}-core-base)"/>
    <g filter="url(#${prefix}-blur-18)">
      <ellipse cx="630" cy="330" rx="182" ry="122" fill="#FFD7B1" fill-opacity="0.24"/>
      <ellipse cx="694" cy="474" rx="212" ry="150" fill="#FF8750" fill-opacity="0.16"/>
      <circle cx="374" cy="626" r="214" fill="#08090D" fill-opacity="0.56"/>
      <ellipse cx="334" cy="734" rx="236" ry="126" fill="#08090D" fill-opacity="0.72"/>
    </g>
    <circle cx="390" cy="608" r="214" fill="#0A0A0E" fill-opacity="0.58"/>
  </g>
  <g filter="url(#${prefix}-blur-34)">
    <ellipse cx="656" cy="312" rx="148" ry="104" fill="#FFF3E2" fill-opacity="0.22"/>
  </g>
  <circle cx="512" cy="512" r="304" fill="none" stroke="#FFFFFF" stroke-opacity="0.1" stroke-width="1.4"/>`;
}

function renderLensCore(prefix) {
  return `
  <g clip-path="url(#${prefix}-lens-clip)">
    <ellipse cx="512" cy="512" rx="258" ry="312" fill="url(#${prefix}-core-base)"/>
    <g filter="url(#${prefix}-blur-18)">
      <ellipse cx="376" cy="404" rx="164" ry="212" fill="#C63220" fill-opacity="0.22"/>
      <ellipse cx="640" cy="334" rx="174" ry="188" fill="#FF7E47" fill-opacity="0.3"/>
      <ellipse cx="686" cy="540" rx="160" ry="182" fill="#FFD2A4" fill-opacity="0.16"/>
      <ellipse cx="402" cy="714" rx="202" ry="126" fill="#0E0E13" fill-opacity="0.72"/>
    </g>
    <rect x="262" y="308" width="470" height="112" rx="56" fill="#FFF4E6" fill-opacity="0.07" transform="rotate(-18 262 308)"/>
  </g>
  <ellipse cx="512" cy="512" rx="258" ry="312" fill="url(#${prefix}-core-shadow)"/>
  <g filter="url(#${prefix}-blur-24)">
    <ellipse cx="628" cy="322" rx="120" ry="130" fill="#FFF3DF" fill-opacity="0.22"/>
  </g>
  <ellipse cx="512" cy="512" rx="258" ry="312" fill="url(#${prefix}-core-highlight)"/>
  <ellipse cx="512" cy="512" rx="258" ry="312" fill="none" stroke="#FFFFFF" stroke-opacity="0.1" stroke-width="1.4"/>`;
}

function renderSignalCore(prefix) {
  return `
  <g filter="url(#${prefix}-blur-34)">
    <circle cx="512" cy="512" r="348" fill="#FF834D" fill-opacity="0.08"/>
  </g>
  <circle cx="512" cy="512" r="278" fill="url(#${prefix}-core-base)"/>
  <g filter="url(#${prefix}-blur-18)">
    <circle cx="512" cy="512" r="198" fill="#FFC78A" fill-opacity="0.18"/>
    <circle cx="512" cy="512" r="146" fill="#FF7444" fill-opacity="0.16"/>
  </g>
  <circle cx="512" cy="512" r="216" fill="none" stroke="#FFF4E4" stroke-opacity="0.08" stroke-width="16"/>
  <circle cx="512" cy="512" r="168" fill="none" stroke="#FF8A57" stroke-opacity="0.12" stroke-width="18"/>
  <circle cx="512" cy="512" r="278" fill="url(#${prefix}-core-shadow)"/>
  <g filter="url(#${prefix}-blur-24)">
    <ellipse cx="622" cy="328" rx="120" ry="92" fill="#FFF4E6" fill-opacity="0.22"/>
  </g>
  <circle cx="512" cy="512" r="278" fill="url(#${prefix}-core-highlight)"/>
  <circle cx="512" cy="512" r="278" fill="none" stroke="#FFFFFF" stroke-opacity="0.1" stroke-width="1.4"/>`;
}

function renderCore(prefix, variant) {
  switch (variant.shape) {
    case "gradient":
      return renderGradientCore(prefix);
    case "eclipse":
      return renderEclipseCore(prefix);
    case "lens":
      return renderLensCore(prefix);
    case "signal":
      return renderSignalCore(prefix);
    default:
      throw new Error(`Unknown variant shape: ${variant.shape}`);
  }
}

function renderVariantSvg(prefix, variant) {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
${renderDefs(prefix, variant)}
${renderBackground(prefix)}
${renderFlare(prefix, variant)}
${renderCore(prefix, variant)}
</svg>`;
}

function renderBoardSvg() {
  const cardWidth = 1000;
  const cardHeight = 610;
  const scale = 0.42;
  const cards = variants
    .map((variant, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 80 + column * 1060;
      const y = 140 + row * 650;
      const markX = x + 286;
      const markY = y + 26;

      return `
  <g>
    <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="42" fill="#0A0D14"/>
    <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="42" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/>
    <g transform="translate(${markX} ${markY}) scale(${scale})">
      ${renderDefs(`board-${variant.id}`, variant)}
      ${renderBackground(`board-${variant.id}`)}
      ${renderFlare(`board-${variant.id}`, variant)}
      ${renderCore(`board-${variant.id}`, variant)}
    </g>
    <text x="${x + 88}" y="${y + 514}" fill="#FFFFFF" font-size="40" font-weight="700" font-family="'Avenir Next', Avenir, 'Helvetica Neue', Arial, sans-serif">${variant.label}</text>
    <text x="${x + 88}" y="${y + 556}" fill="#AAB2C8" font-size="22" font-weight="500" font-family="'Avenir Next', Avenir, 'Helvetica Neue', Arial, sans-serif">${variant.caption}</text>
  </g>`;
    })
    .join("\n");

  return `<svg width="2220" height="1440" viewBox="0 0 2220 1440" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="2220" height="1440" fill="#07090E"/>
  <rect width="2220" height="1440" fill="url(#board-bg-left)"/>
  <rect width="2220" height="1440" fill="url(#board-bg-right)"/>
  <defs>
    <radialGradient id="board-bg-left" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(460 280) rotate(40) scale(620 720)">
      <stop stop-color="#22365C" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#22365C" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="board-bg-right" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1730 304) rotate(154) scale(620 520)">
      <stop stop-color="#E86863" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#E86863" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <text x="80" y="72" fill="#FFFFFF" font-size="44" font-weight="700" font-family="'Avenir Next', Avenir, 'Helvetica Neue', Arial, sans-serif">Planet Flare Obsidian Ember — Abstract Ember Round</text>
  <text x="80" y="110" fill="#AAB2C8" font-size="24" font-weight="500" font-family="'Avenir Next', Avenir, 'Helvetica Neue', Arial, sans-serif">Warmer orange-red gradients and flatter, more abstract cores than the current ember-core logo.</text>
${cards}
</svg>`;
}

async function main() {
  for (const variant of variants) {
    const filename = `planet-flare-logo-obsidian-ember-${variant.id}.svg`;
    await fs.writeFile(path.join(__dirname, filename), renderVariantSvg(variant.id, variant));
  }

  await fs.writeFile(
    path.join(__dirname, "planet-flare-logo-obsidian-ember-abstract-variants.svg"),
    renderBoardSvg(),
  );
}

await main();
