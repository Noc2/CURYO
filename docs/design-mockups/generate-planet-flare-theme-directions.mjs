#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sans = "'Sora', 'Avenir Next', 'Helvetica Neue', Arial, sans-serif";
const mono = "'IBM Plex Mono', 'SFMono-Regular', Menlo, monospace";

const sharedFlare = {
  outer: "#F45D4F",
  dark: "#6D3428",
  glowOpacity: 0.54,
  stops: [
    { color: "#F45D4F" },
    { offset: "0.24", color: "#FF8C5F" },
    { offset: "0.56", color: "#FFC37A" },
    { offset: "0.82", color: "#FFE0A1" },
    { offset: "1", color: "#FFF3D9" },
  ],
  coreStops: [
    { color: "#FF9B75" },
    { offset: "0.52", color: "#FFF0CF" },
    { offset: "1", color: "#FFF8ED" },
  ],
};

const themeDirections = [
  {
    id: "ember-orbit",
    name: "Ember Orbit",
    tag: "Warm confidence",
    body: "Keeps the coral flare emotional while the planet leans sunset-gold to deep navy. Strongest match if the site should feel human and editorial.",
    bgFrom: "#0A1220",
    bgTo: "#111B2E",
    panelGlow: "#F37A57",
    panelGlowSoft: "#244768",
    surface: "#101A2B",
    surfaceAlt: "#15243B",
    surfaceStroke: "#FFFFFF14",
    text: "#F8F2E9",
    muted: "#AAB7C7",
    accent: "#FF855F",
    accentSoft: "#FFD2A5",
    accentText: "#07111C",
    chip: "#1A2A43",
    chipText: "#FFD9B8",
    swatches: ["#FFF0D1", "#FFB47B", "#F36F73", "#4EA0EB", "#0D2234"],
    logo: {
      baseStops: [
        { color: "#FFF0D1" },
        { offset: "0.14", color: "#FFC08B" },
        { offset: "0.33", color: "#F36F73" },
        { offset: "0.56", color: "#C06FF3" },
        { offset: "0.78", color: "#489DEB" },
        { offset: "1", color: "#0D2234" },
      ],
      shadowColor: "#07111C",
      shadowOpacity: 0.78,
      highlightColor: "#FFF7E9",
      highlightOpacity: 0.72,
      atmosphereColor: "#FFE2BD",
      atmosphereOpacity: 0.22,
      edgeStroke: "#FFFFFF",
      edgeOpacity: 0.17,
      warmDash: "#F5A470",
      warmDashOpacity: 0.11,
      outerRing: "#1A1F2B",
      ringShadow: "#3A242B",
      ringShadowOpacity: 0.64,
      glows: [
        { cx: 340, cy: 394, rx: 214, ry: 164, color: "#3EA2F1", opacity: 0.42 },
        { cx: 604, cy: 320, rx: 244, ry: 170, color: "#F37F84", opacity: 0.34 },
        { cx: 704, cy: 446, rx: 232, ry: 152, color: "#FFD59B", opacity: 0.26 },
        { cx: 612, cy: 650, rx: 260, ry: 150, color: "#11C7A5", opacity: 0.2 },
        { cx: 350, cy: 698, rx: 282, ry: 176, color: "#11273B", opacity: 0.64 },
      ],
      darkBand: "#2E4D70",
      darkBandOpacity: 0.28,
      warmBand: "#F5A07A",
      warmBandOpacity: 0.14,
    },
  },
  {
    id: "tidal-signal",
    name: "Tidal Signal",
    tag: "Cool precision",
    body: "Shifts the planet toward seafoam, aqua, and cobalt while leaving the flare warm. Best if the product theme should feel analytical and trustworthy.",
    bgFrom: "#07161B",
    bgTo: "#0D2530",
    panelGlow: "#31B8C7",
    panelGlowSoft: "#183454",
    surface: "#0E2129",
    surfaceAlt: "#122C36",
    surfaceStroke: "#FFFFFF12",
    text: "#EAF7F7",
    muted: "#9FB8BF",
    accent: "#2AD1D2",
    accentSoft: "#A7FFF0",
    accentText: "#051418",
    chip: "#12343E",
    chipText: "#B8FFF0",
    swatches: ["#EFFFF8", "#8EE7D2", "#45B9D7", "#2E6FB7", "#081D28"],
    logo: {
      baseStops: [
        { color: "#EFFEF6" },
        { offset: "0.15", color: "#9AE6D4" },
        { offset: "0.34", color: "#53C0D4" },
        { offset: "0.57", color: "#3A82D5" },
        { offset: "0.8", color: "#17487E" },
        { offset: "1", color: "#081D28" },
      ],
      shadowColor: "#051318",
      shadowOpacity: 0.76,
      highlightColor: "#F2FFFB",
      highlightOpacity: 0.66,
      atmosphereColor: "#9CEBE1",
      atmosphereOpacity: 0.2,
      edgeStroke: "#E7FFFC",
      edgeOpacity: 0.16,
      warmDash: "#87E8D7",
      warmDashOpacity: 0.1,
      outerRing: "#102127",
      ringShadow: "#1D2B31",
      ringShadowOpacity: 0.62,
      glows: [
        { cx: 332, cy: 386, rx: 208, ry: 160, color: "#30D7D2", opacity: 0.32 },
        { cx: 602, cy: 314, rx: 236, ry: 168, color: "#95F5DE", opacity: 0.22 },
        { cx: 710, cy: 438, rx: 246, ry: 162, color: "#4AA0E8", opacity: 0.28 },
        { cx: 604, cy: 652, rx: 264, ry: 150, color: "#1E4E7D", opacity: 0.28 },
        { cx: 338, cy: 700, rx: 278, ry: 174, color: "#091B27", opacity: 0.6 },
      ],
      darkBand: "#1B4D6A",
      darkBandOpacity: 0.26,
      warmBand: "#9CEBE1",
      warmBandOpacity: 0.1,
    },
  },
  {
    id: "solar-brass",
    name: "Solar Brass",
    tag: "Premium signal",
    body: "Pulls the palette toward brass, amber, and volcanic rust. Best if the site wants a more premium editorial direction without losing the warm flare.",
    bgFrom: "#17120D",
    bgTo: "#241A13",
    panelGlow: "#E3A151",
    panelGlowSoft: "#4D2316",
    surface: "#201710",
    surfaceAlt: "#2B2018",
    surfaceStroke: "#FFFFFF12",
    text: "#F8F0E5",
    muted: "#C4B09D",
    accent: "#E9A551",
    accentSoft: "#F7D5A5",
    accentText: "#161109",
    chip: "#3A271A",
    chipText: "#FAD9A7",
    swatches: ["#FFF2D8", "#E8B36E", "#B85B3E", "#6E3F31", "#1D1612"],
    logo: {
      baseStops: [
        { color: "#FFF2D8" },
        { offset: "0.16", color: "#F4C37C" },
        { offset: "0.34", color: "#D8794D" },
        { offset: "0.58", color: "#8D4A38" },
        { offset: "0.8", color: "#3B2A27" },
        { offset: "1", color: "#17120F" },
      ],
      shadowColor: "#130E0B",
      shadowOpacity: 0.82,
      highlightColor: "#FFF7E6",
      highlightOpacity: 0.66,
      atmosphereColor: "#FFD6A8",
      atmosphereOpacity: 0.18,
      edgeStroke: "#FFF4E0",
      edgeOpacity: 0.14,
      warmDash: "#F3B16F",
      warmDashOpacity: 0.12,
      outerRing: "#231A15",
      ringShadow: "#422D24",
      ringShadowOpacity: 0.64,
      glows: [
        { cx: 338, cy: 388, rx: 206, ry: 160, color: "#E8B469", opacity: 0.28 },
        { cx: 594, cy: 316, rx: 240, ry: 168, color: "#F9D6A3", opacity: 0.22 },
        { cx: 700, cy: 438, rx: 238, ry: 152, color: "#B76546", opacity: 0.24 },
        { cx: 610, cy: 654, rx: 264, ry: 150, color: "#59342B", opacity: 0.28 },
        { cx: 344, cy: 706, rx: 284, ry: 176, color: "#16120F", opacity: 0.64 },
      ],
      darkBand: "#5B3E30",
      darkBandOpacity: 0.26,
      warmBand: "#F2BC77",
      warmBandOpacity: 0.12,
    },
  },
  {
    id: "horizon-nova",
    name: "Horizon Nova",
    tag: "Social energy",
    body: "Leans brighter and more optimistic with sky blue, apricot, and sunrise coral. Best if the site wants momentum and accessibility without going flat.",
    bgFrom: "#091522",
    bgTo: "#11243C",
    panelGlow: "#5A9CFF",
    panelGlowSoft: "#FF9A62",
    surface: "#102032",
    surfaceAlt: "#17304A",
    surfaceStroke: "#FFFFFF14",
    text: "#F6FBFF",
    muted: "#A4B8CC",
    accent: "#5AA4FF",
    accentSoft: "#FFE0B6",
    accentText: "#061221",
    chip: "#1A3250",
    chipText: "#D9E9FF",
    swatches: ["#FFF0D6", "#FFB87A", "#FF7D66", "#5AA4FF", "#0A1E31"],
    logo: {
      baseStops: [
        { color: "#FFF0D6" },
        { offset: "0.14", color: "#FFBC82" },
        { offset: "0.32", color: "#FF816C" },
        { offset: "0.56", color: "#8F9AF9" },
        { offset: "0.79", color: "#5AA6FF" },
        { offset: "1", color: "#0A1E31" },
      ],
      shadowColor: "#07111C",
      shadowOpacity: 0.8,
      highlightColor: "#FFF9ED",
      highlightOpacity: 0.72,
      atmosphereColor: "#B1CCFF",
      atmosphereOpacity: 0.18,
      edgeStroke: "#FFFFFF",
      edgeOpacity: 0.18,
      warmDash: "#FFBE84",
      warmDashOpacity: 0.12,
      outerRing: "#152434",
      ringShadow: "#35252A",
      ringShadowOpacity: 0.62,
      glows: [
        { cx: 340, cy: 388, rx: 214, ry: 164, color: "#58A8FF", opacity: 0.4 },
        { cx: 604, cy: 318, rx: 242, ry: 170, color: "#FF8C77", opacity: 0.26 },
        { cx: 704, cy: 440, rx: 240, ry: 154, color: "#FFDCA8", opacity: 0.24 },
        { cx: 610, cy: 650, rx: 262, ry: 150, color: "#3D6DA1", opacity: 0.22 },
        { cx: 346, cy: 704, rx: 282, ry: 176, color: "#0A2032", opacity: 0.62 },
      ],
      darkBand: "#335C85",
      darkBandOpacity: 0.28,
      warmBand: "#FFAA83",
      warmBandOpacity: 0.14,
    },
  },
];

const gradientTreatments = [
  {
    id: "atmospheric-bloom",
    name: "Atmospheric Bloom",
    note: "Soft upper-right bloom with a warmer atmosphere layer. Most cinematic of the four.",
    strength: "Cinematic / soft",
    swatches: ["#FFF1DA", "#FFBA88", "#F26F76", "#4E9EEB"],
    bgFrom: "#08111B",
    bgTo: "#0D1826",
    panelGlow: "#FF8B62",
    logo: {
      ...themeDirections[0].logo,
      baseStops: [
        { color: "#FFF1DA" },
        { offset: "0.14", color: "#FFC08B" },
        { offset: "0.31", color: "#F26F76" },
        { offset: "0.54", color: "#A57FF0" },
        { offset: "0.77", color: "#4E9EEB" },
        { offset: "1", color: "#0A2133" },
      ],
      atmosphereColor: "#FFE5C4",
      atmosphereOpacity: 0.28,
      highlightOpacity: 0.76,
    },
  },
  {
    id: "terminator-cut",
    name: "Terminator Cut",
    note: "Sharper warm-to-cool transition through the equator. Strongest sense of a lit sphere at small sizes.",
    strength: "Sharper / graphic",
    swatches: ["#FFF3E0", "#FF9E7C", "#B86558", "#204E88"],
    bgFrom: "#0A1220",
    bgTo: "#101826",
    panelGlow: "#78A9FF",
    logo: {
      ...themeDirections[3].logo,
      baseStops: [
        { color: "#FFF3E0" },
        { offset: "0.18", color: "#FFB17F" },
        { offset: "0.33", color: "#D27061" },
        { offset: "0.5", color: "#6E5FA9" },
        { offset: "0.66", color: "#366DB8" },
        { offset: "1", color: "#081E31" },
      ],
      warmBandOpacity: 0.2,
      darkBandOpacity: 0.34,
    },
  },
  {
    id: "mineral-depth",
    name: "Mineral Depth",
    note: "Adds deeper shadow pockets and heavier internal color pools. Feels premium and slightly less playful.",
    strength: "Deep / premium",
    swatches: ["#FFF2D8", "#E6BB7C", "#B15E48", "#0E2E49"],
    bgFrom: "#130F0C",
    bgTo: "#1E1510",
    panelGlow: "#E0A55C",
    logo: {
      ...themeDirections[2].logo,
      glows: [
        { cx: 332, cy: 380, rx: 198, ry: 152, color: "#E8B46B", opacity: 0.24 },
        { cx: 610, cy: 320, rx: 248, ry: 170, color: "#D66B4C", opacity: 0.24 },
        { cx: 708, cy: 456, rx: 254, ry: 164, color: "#FFD7A1", opacity: 0.18 },
        { cx: 610, cy: 656, rx: 278, ry: 154, color: "#704134", opacity: 0.3 },
        { cx: 332, cy: 710, rx: 298, ry: 182, color: "#120F0D", opacity: 0.72 },
      ],
      shadowOpacity: 0.86,
      warmBandOpacity: 0.1,
    },
  },
  {
    id: "polar-sheen",
    name: "Polar Sheen",
    note: "Pushes a cooler top light and a cleaner highlight cap. Best if you want the planet to feel glossy and modern.",
    strength: "Glossy / modern",
    swatches: ["#F1FDFF", "#7FDBE6", "#5BA2F7", "#0A2234"],
    bgFrom: "#07141E",
    bgTo: "#0F2432",
    panelGlow: "#2AD0D3",
    logo: {
      ...themeDirections[1].logo,
      baseStops: [
        { color: "#F0FFFF" },
        { offset: "0.16", color: "#A5F1E8" },
        { offset: "0.34", color: "#62C2E4" },
        { offset: "0.56", color: "#5A95ED" },
        { offset: "0.78", color: "#18507F" },
        { offset: "1", color: "#08202E" },
      ],
      highlightColor: "#F4FFFF",
      highlightOpacity: 0.8,
      atmosphereColor: "#A4F0EC",
      atmosphereOpacity: 0.24,
    },
  },
];

function stopMarkup(stops) {
  return stops
    .map(stop => {
      const offset = stop.offset ? ` offset="${stop.offset}"` : "";
      const opacity = stop.opacity !== undefined ? ` stop-opacity="${stop.opacity}"` : "";
      return `<stop${offset} stop-color="${stop.color}"${opacity}/>`;
    })
    .join("");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderLogoDefs(theme, prefix) {
  const { logo } = theme;
  const blur20 = `${prefix}-soft-blur-20`;
  const blur28 = `${prefix}-soft-blur-28`;
  return `
    <radialGradient id="${prefix}-planet-base" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(636 360) rotate(130) scale(514 494)">
      ${stopMarkup(logo.baseStops)}
    </radialGradient>
    <radialGradient id="${prefix}-planet-shadow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(382 664) rotate(-28) scale(248 162)">
      <stop stop-color="${logo.shadowColor}" stop-opacity="${logo.shadowOpacity}"/>
      <stop offset="1" stop-color="${logo.shadowColor}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${prefix}-planet-highlight" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(668 336) rotate(138) scale(198 132)">
      <stop stop-color="${logo.highlightColor}" stop-opacity="${logo.highlightOpacity}"/>
      <stop offset="0.5" stop-color="${logo.highlightColor}" stop-opacity="${Math.max(0.12, logo.highlightOpacity * 0.34).toFixed(2)}"/>
      <stop offset="1" stop-color="${logo.highlightColor}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${prefix}-planet-atmosphere" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(740 292) rotate(150) scale(228 92)">
      <stop stop-color="${logo.atmosphereColor}" stop-opacity="${logo.atmosphereOpacity}"/>
      <stop offset="1" stop-color="${logo.atmosphereColor}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${prefix}-flare-gradient" x1="674" y1="146" x2="906" y2="704" gradientUnits="userSpaceOnUse">
      ${stopMarkup(sharedFlare.stops)}
    </linearGradient>
    <linearGradient id="${prefix}-flare-core" x1="684" y1="160" x2="892" y2="690" gradientUnits="userSpaceOnUse">
      ${stopMarkup(sharedFlare.coreStops)}
    </linearGradient>
    <filter id="${blur20}" x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="20"/>
    </filter>
    <filter id="${blur28}" x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="28"/>
    </filter>
    <clipPath id="${prefix}-planet-clip">
      <circle cx="512" cy="512" r="344"/>
    </clipPath>
  `;
}

function renderLogo(theme, prefix, x, y, size) {
  const scale = size / 1024;
  const { logo } = theme;
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <circle cx="512" cy="512" r="458" stroke="#FFFFFF" stroke-opacity="0.03" stroke-width="2"/>
      <circle cx="512" cy="512" r="434" stroke="${logo.ringShadow}" stroke-opacity="${logo.ringShadowOpacity}" stroke-width="12"/>
      <circle cx="512" cy="512" r="420" stroke="${logo.outerRing}" stroke-opacity="0.96" stroke-width="20"/>
      <circle cx="512" cy="512" r="406" stroke="#FFFFFF" stroke-opacity="0.055" stroke-width="2"/>
      <circle cx="512" cy="512" r="394" stroke="#FFFFFF" stroke-opacity="0.038" stroke-width="1.4"/>
      <circle cx="512" cy="512" r="434" stroke="${logo.warmDash}" stroke-opacity="${logo.warmDashOpacity}" stroke-width="6" stroke-linecap="round" stroke-dasharray="580 2147" transform="rotate(-136 512 512)"/>
      <circle cx="512" cy="512" r="420" stroke="#FFFFFF" stroke-opacity="0.04" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="520 2119" transform="rotate(-136 512 512)"/>

      <g filter="url(#${prefix}-soft-blur-28)">
        <circle cx="512" cy="512" r="406" stroke="${sharedFlare.outer}" stroke-opacity="${sharedFlare.glowOpacity}" stroke-width="28" stroke-linecap="round" stroke-dasharray="666 1885" transform="rotate(-66 512 512)"/>
      </g>
      <circle cx="512" cy="512" r="406" stroke="${sharedFlare.dark}" stroke-opacity="0.42" stroke-width="10" stroke-linecap="round" stroke-dasharray="666 1885" transform="rotate(-66 512 512)"/>
      <circle cx="512" cy="512" r="406" stroke="url(#${prefix}-flare-gradient)" stroke-width="8" stroke-linecap="round" stroke-dasharray="666 1885" transform="rotate(-66 512 512)"/>
      <circle cx="512" cy="512" r="406" stroke="url(#${prefix}-flare-core)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="666 1885" transform="rotate(-66 512 512)"/>
      <circle cx="871" cy="703" r="23" fill="#FF8D65" fill-opacity="0.18"/>
      <circle cx="871" cy="703" r="9" fill="#FFF3DF"/>

      <circle cx="512" cy="512" r="344" fill="url(#${prefix}-planet-base)"/>
      <g clip-path="url(#${prefix}-planet-clip)">
        <g filter="url(#${prefix}-soft-blur-20)">
          ${logo.glows
            .map(
              glow =>
                `<ellipse cx="${glow.cx}" cy="${glow.cy}" rx="${glow.rx}" ry="${glow.ry}" fill="${glow.color}" fill-opacity="${glow.opacity}"/>`,
            )
            .join("")}
        </g>

        <path d="M132 312C242 264 356 264 476 290C578 312 678 322 814 316" stroke="#FFFFFF" stroke-opacity="0.11" stroke-width="16" stroke-linecap="round"/>
        <path d="M120 418C236 372 354 378 474 406C578 430 676 440 810 434" stroke="#FFFFFF" stroke-opacity="0.1" stroke-width="13" stroke-linecap="round"/>
        <path d="M118 522C236 478 356 486 478 516C582 542 676 552 806 546" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="11" stroke-linecap="round"/>
        <path d="M132 648C236 612 356 614 478 642C584 668 680 678 810 668" stroke="#FFFFFF" stroke-opacity="0.075" stroke-width="14" stroke-linecap="round"/>
        <path d="M110 760C224 724 350 724 482 748C590 768 684 778 816 770" stroke="${logo.darkBand}" stroke-opacity="${logo.darkBandOpacity}" stroke-width="24" stroke-linecap="round"/>
        <path d="M94 578C206 536 320 538 438 564C540 586 638 604 768 594C828 590 874 578 910 554" stroke="${logo.warmBand}" stroke-opacity="${logo.warmBandOpacity}" stroke-width="24" stroke-linecap="round"/>

        <circle cx="640" cy="430" r="18" fill="#FFF2E2" fill-opacity="0.14"/>
        <circle cx="332" cy="414" r="14" fill="#FFF2E2" fill-opacity="0.08"/>
        <circle cx="596" cy="570" r="20" fill="#FFF2E2" fill-opacity="0.1"/>
        <circle cx="370" cy="804" r="16" fill="#FFF2E2" fill-opacity="0.05"/>
      </g>

      <circle cx="512" cy="512" r="344" fill="url(#${prefix}-planet-shadow)"/>
      <g filter="url(#${prefix}-soft-blur-28)">
        <ellipse cx="644" cy="340" rx="154" ry="106" fill="${logo.highlightColor}" fill-opacity="${Math.min(0.28, logo.highlightOpacity * 0.38).toFixed(2)}"/>
      </g>
      <circle cx="512" cy="512" r="344" fill="url(#${prefix}-planet-atmosphere)"/>
      <circle cx="512" cy="512" r="344" fill="url(#${prefix}-planet-highlight)"/>
      <circle cx="512" cy="512" r="344" fill="none" stroke="${logo.edgeStroke}" stroke-opacity="${logo.edgeOpacity}" stroke-width="1.4"/>
    </g>
  `;
}

function renderSwatches(colors, x, y, gap = 42, radius = 13) {
  return colors
    .map((color, index) => `<circle cx="${x + index * gap}" cy="${y}" r="${radius}" fill="${color}"/>`)
    .join("");
}

function renderThemePanel(theme, index) {
  const col = index % 2;
  const row = Math.floor(index / 2);
  const x = 80 + col * 830;
  const y = 120 + row * 520;
  const prefix = `${theme.id}-panel`;
  return {
    defs: `
      <linearGradient id="${prefix}-panel-bg" x1="${x}" y1="${y}" x2="${x + 760}" y2="${y + 480}" gradientUnits="userSpaceOnUse">
        <stop stop-color="${theme.bgFrom}"/>
        <stop offset="1" stop-color="${theme.bgTo}"/>
      </linearGradient>
      <radialGradient id="${prefix}-panel-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${x + 168} ${y + 170}) rotate(28) scale(188 148)">
        <stop stop-color="${theme.panelGlow}" stop-opacity="0.24"/>
        <stop offset="1" stop-color="${theme.panelGlow}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="${prefix}-panel-glow-soft" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${x + 610} ${y + 108}) rotate(154) scale(216 138)">
        <stop stop-color="${theme.panelGlowSoft}" stop-opacity="0.3"/>
        <stop offset="1" stop-color="${theme.panelGlowSoft}" stop-opacity="0"/>
      </radialGradient>
      ${renderLogoDefs(theme, prefix)}
    `,
    content: `
      <g>
        <rect x="${x}" y="${y}" width="760" height="460" rx="34" fill="url(#${prefix}-panel-bg)"/>
        <rect x="${x}" y="${y}" width="760" height="460" rx="34" fill="url(#${prefix}-panel-glow)"/>
        <rect x="${x}" y="${y}" width="760" height="460" rx="34" fill="url(#${prefix}-panel-glow-soft)"/>
        <rect x="${x}" y="${y}" width="760" height="460" rx="34" stroke="${theme.surfaceStroke}" stroke-width="2"/>

        <text x="${x + 36}" y="${y + 54}" fill="${theme.accentSoft}" font-size="15" letter-spacing="2.2" font-family="${mono}">${escapeXml(theme.tag.toUpperCase())}</text>
        <text x="${x + 36}" y="${y + 98}" fill="${theme.text}" font-size="36" font-weight="700" font-family="${sans}">${escapeXml(theme.name)}</text>
        <text x="${x + 36}" y="${y + 132}" fill="${theme.muted}" font-size="18" font-family="${sans}">${escapeXml(theme.body)}</text>

        ${renderLogo(theme, prefix, x + 28, y + 132, 302)}

        <rect x="${x + 380}" y="${y + 122}" width="332" height="204" rx="26" fill="${theme.surface}"/>
        <rect x="${x + 380}" y="${y + 122}" width="332" height="204" rx="26" stroke="${theme.surfaceStroke}" stroke-width="1.5"/>
        <text x="${x + 406}" y="${y + 164}" fill="${theme.text}" font-size="20" font-weight="600" font-family="${sans}">Trust signals for the human web</text>
        <text x="${x + 406}" y="${y + 194}" fill="${theme.muted}" font-size="14" font-family="${sans}">Logo, buttons, chips, and cards share the same palette.</text>

        <rect x="${x + 406}" y="${y + 222}" width="152" height="42" rx="21" fill="${theme.accent}"/>
        <text x="${x + 482}" y="${y + 249}" fill="${theme.accentText}" text-anchor="middle" font-size="15" font-weight="700" font-family="${sans}">Vote With Conviction</text>

        <rect x="${x + 572}" y="${y + 222}" width="118" height="42" rx="21" fill="${theme.chip}"/>
        <text x="${x + 631}" y="${y + 249}" fill="${theme.chipText}" text-anchor="middle" font-size="14" font-weight="600" font-family="${sans}">Explore Signals</text>

        <rect x="${x + 406}" y="${y + 282}" width="126" height="26" rx="13" fill="${theme.surfaceAlt}"/>
        <rect x="${x + 544}" y="${y + 282}" width="148" height="26" rx="13" fill="${theme.surfaceAlt}"/>
        <rect x="${x + 406}" y="${y + 318}" width="286" height="64" rx="20" fill="${theme.surfaceAlt}"/>
        <path d="M${x + 430} ${y + 355}C${x + 470} ${y + 340} ${x + 516} ${y + 340} ${x + 560} ${y + 354}C${x + 598} ${y + 366} ${x + 628} ${y + 364} ${x + 672} ${y + 338}" stroke="${theme.accent}" stroke-width="6" stroke-linecap="round"/>
        <circle cx="${x + 672}" cy="${y + 338}" r="7" fill="${theme.accentSoft}"/>

        <text x="${x + 36}" y="${y + 398}" fill="${theme.text}" font-size="16" font-weight="700" font-family="${sans}">Palette</text>
        ${renderSwatches(theme.swatches, x + 44, y + 430)}
      </g>
    `,
  };
}

function renderGradientPanel(theme, index) {
  const col = index % 2;
  const row = Math.floor(index / 2);
  const x = 80 + col * 830;
  const y = 120 + row * 460;
  const prefix = `${theme.id}-gradient`;
  return {
    defs: `
      <linearGradient id="${prefix}-panel-bg" x1="${x}" y1="${y}" x2="${x + 760}" y2="${y + 420}" gradientUnits="userSpaceOnUse">
        <stop stop-color="${theme.bgFrom}"/>
        <stop offset="1" stop-color="${theme.bgTo}"/>
      </linearGradient>
      <radialGradient id="${prefix}-panel-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${x + 180} ${y + 128}) rotate(32) scale(192 140)">
        <stop stop-color="${theme.panelGlow}" stop-opacity="0.22"/>
        <stop offset="1" stop-color="${theme.panelGlow}" stop-opacity="0"/>
      </radialGradient>
      ${renderLogoDefs(theme, prefix)}
    `,
    content: `
      <g>
        <rect x="${x}" y="${y}" width="760" height="400" rx="34" fill="url(#${prefix}-panel-bg)"/>
        <rect x="${x}" y="${y}" width="760" height="400" rx="34" fill="url(#${prefix}-panel-glow)"/>
        <rect x="${x}" y="${y}" width="760" height="400" rx="34" stroke="#FFFFFF12" stroke-width="2"/>

        <text x="${x + 34}" y="${y + 56}" fill="#FFFFFF" font-size="30" font-weight="700" font-family="${sans}">${escapeXml(theme.name)}</text>
        <text x="${x + 34}" y="${y + 88}" fill="#D8E0EA" fill-opacity="0.72" font-size="15" font-family="${sans}">${escapeXml(theme.strength)}</text>
        <text x="${x + 34}" y="${y + 352}" fill="#D8E0EA" fill-opacity="0.8" font-size="17" font-family="${sans}">${escapeXml(theme.note)}</text>

        ${renderLogo(theme, prefix, x + 228, y + 68, 304)}

        ${renderSwatches(theme.swatches, x + 46, y + 304, 42, 12)}
      </g>
    `,
  };
}

function buildThemeBoard() {
  const panels = themeDirections.map(renderThemePanel);
  return `
<svg width="1740" height="1160" viewBox="0 0 1740 1160" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="theme-board-bg" x1="70" y1="40" x2="1670" y2="1120" gradientUnits="userSpaceOnUse">
      <stop stop-color="#05080F"/>
      <stop offset="0.55" stop-color="#09111B"/>
      <stop offset="1" stop-color="#070B12"/>
    </linearGradient>
    <radialGradient id="theme-board-left" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(220 180) rotate(42) scale(340 260)">
      <stop stop-color="#264B72" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#264B72" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="theme-board-right" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1490 180) rotate(144) scale(360 240)">
      <stop stop-color="#F57A58" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#F57A58" stop-opacity="0"/>
    </radialGradient>
    ${panels.map(panel => panel.defs).join("")}
  </defs>

  <rect width="1740" height="1160" fill="url(#theme-board-bg)"/>
  <rect width="1740" height="1160" fill="url(#theme-board-left)"/>
  <rect width="1740" height="1160" fill="url(#theme-board-right)"/>

  <text x="80" y="62" fill="#FFFFFF" font-size="44" font-weight="700" font-family="${sans}">Planet + Flare Theme Directions</text>
  <text x="80" y="100" fill="#D8E0EA" fill-opacity="0.72" font-size="18" font-family="${sans}">Four site-wide color systems mapped back into the current logo geometry, with the planet pushed toward a stronger 3D read.</text>

  ${panels.map(panel => panel.content).join("")}
</svg>
`.trim();
}

function buildGradientBoard() {
  const panels = gradientTreatments.map(renderGradientPanel);
  return `
<svg width="1740" height="1000" viewBox="0 0 1740 1000" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradient-board-bg" x1="90" y1="40" x2="1660" y2="980" gradientUnits="userSpaceOnUse">
      <stop stop-color="#06090F"/>
      <stop offset="0.52" stop-color="#0A121B"/>
      <stop offset="1" stop-color="#070B11"/>
    </linearGradient>
    <radialGradient id="gradient-board-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1420 188) rotate(150) scale(360 220)">
      <stop stop-color="#F4815C" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#F4815C" stop-opacity="0"/>
    </radialGradient>
    ${panels.map(panel => panel.defs).join("")}
  </defs>

  <rect width="1740" height="1000" fill="url(#gradient-board-bg)"/>
  <rect width="1740" height="1000" fill="url(#gradient-board-glow)"/>

  <text x="80" y="62" fill="#FFFFFF" font-size="42" font-weight="700" font-family="${sans}">3D Planet Gradient Tests</text>
  <text x="80" y="98" fill="#D8E0EA" fill-opacity="0.72" font-size="18" font-family="${sans}">Same mark, different planet-lighting strategies. These isolate how far the sphere can go toward depth before it stops feeling like the current brand.</text>

  ${panels.map(panel => panel.content).join("")}
</svg>
`.trim();
}

async function main() {
  const outputs = [
    ["planet-flare-theme-directions.svg", buildThemeBoard()],
    ["planet-flare-3d-gradient-tests.svg", buildGradientBoard()],
  ];

  await Promise.all(
    outputs.map(([filename, contents]) =>
      fs.writeFile(path.join(__dirname, filename), `${contents}\n`, "utf8"),
    ),
  );

  console.log(`Wrote ${outputs.map(([filename]) => filename).join(", ")}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
