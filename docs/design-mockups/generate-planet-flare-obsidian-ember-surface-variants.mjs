#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const basePath = path.join(__dirname, "planet-flare-logo-single.svg");

const variants = [
  {
    id: "ember-core",
    label: "Ember Core",
    waves: true,
    baseStops: [
      { color: "#FFF0E0" },
      { offset: "0.15", color: "#F6A05D" },
      { offset: "0.34", color: "#E55A27" },
      { offset: "0.58", color: "#A6321D" },
      { offset: "0.8", color: "#43201A" },
      { offset: "1", color: "#0F0F12" },
    ],
    shadowColor: "#08090B",
    shadowOpacity: "0.86",
    highlightColor: "#FFF7EF",
    highlightOpacity: "0.68",
    surfaceGlows: [
      { cx: 330, cy: 392, rx: 204, ry: 154, color: "#B52E1B", opacity: "0.32" },
      { cx: 604, cy: 320, rx: 246, ry: 172, color: "#F16A2D", opacity: "0.28" },
      { cx: 706, cy: 444, rx: 234, ry: 154, color: "#FFD2AE", opacity: "0.2" },
      { cx: 612, cy: 656, rx: 268, ry: 154, color: "#4C261D", opacity: "0.28" },
      { cx: 344, cy: 706, rx: 286, ry: 176, color: "#0D0D10", opacity: "0.72" },
    ],
    darkBand: { color: "#4B261D", opacity: "0.3" },
    warmBand: { color: "#E59A66", opacity: "0.14" },
  },
  {
    id: "charred-dusk",
    label: "Charred Dusk",
    waves: true,
    baseStops: [
      { color: "#F7E6D7" },
      { offset: "0.14", color: "#D97D49" },
      { offset: "0.34", color: "#A94424" },
      { offset: "0.58", color: "#632719" },
      { offset: "0.8", color: "#231417" },
      { offset: "1", color: "#090A0D" },
    ],
    shadowColor: "#06070A",
    shadowOpacity: "0.9",
    highlightColor: "#FFF3E8",
    highlightOpacity: "0.52",
    surfaceGlows: [
      { cx: 334, cy: 388, rx: 198, ry: 150, color: "#7F2318", opacity: "0.28" },
      { cx: 596, cy: 320, rx: 240, ry: 168, color: "#C25428", opacity: "0.22" },
      { cx: 700, cy: 438, rx: 228, ry: 148, color: "#EAB68D", opacity: "0.15" },
      { cx: 604, cy: 652, rx: 264, ry: 152, color: "#351B18", opacity: "0.36" },
      { cx: 342, cy: 706, rx: 288, ry: 178, color: "#06070A", opacity: "0.78" },
    ],
    darkBand: { color: "#311A18", opacity: "0.4" },
    warmBand: { color: "#B86A45", opacity: "0.1" },
  },
  {
    id: "molten-signal",
    label: "Molten Signal",
    waves: true,
    baseStops: [
      { color: "#FFF4E7" },
      { offset: "0.16", color: "#FFB166" },
      { offset: "0.34", color: "#F46A2E" },
      { offset: "0.56", color: "#C13B1F" },
      { offset: "0.78", color: "#561F1A" },
      { offset: "1", color: "#131014" },
    ],
    shadowColor: "#08080C",
    shadowOpacity: "0.84",
    highlightColor: "#FFF9F1",
    highlightOpacity: "0.76",
    surfaceGlows: [
      { cx: 334, cy: 392, rx: 210, ry: 158, color: "#C7331C", opacity: "0.28" },
      { cx: 612, cy: 312, rx: 252, ry: 174, color: "#FF7A31", opacity: "0.34" },
      { cx: 718, cy: 438, rx: 242, ry: 158, color: "#FFD9B5", opacity: "0.26" },
      { cx: 610, cy: 652, rx: 272, ry: 154, color: "#68271D", opacity: "0.22" },
      { cx: 344, cy: 700, rx: 284, ry: 174, color: "#111116", opacity: "0.68" },
    ],
    darkBand: { color: "#6B2F1F", opacity: "0.24" },
    warmBand: { color: "#F0A26F", opacity: "0.16" },
  },
  {
    id: "ash-copper",
    label: "Ash Copper",
    waves: true,
    baseStops: [
      { color: "#F2ECE6" },
      { offset: "0.15", color: "#C58A65" },
      { offset: "0.34", color: "#9B593B" },
      { offset: "0.58", color: "#5E3B32" },
      { offset: "0.8", color: "#242127" },
      { offset: "1", color: "#0C0D10" },
    ],
    shadowColor: "#08090D",
    shadowOpacity: "0.88",
    highlightColor: "#FFF6F0",
    highlightOpacity: "0.58",
    surfaceGlows: [
      { cx: 330, cy: 390, rx: 204, ry: 156, color: "#8B4A34", opacity: "0.22" },
      { cx: 602, cy: 316, rx: 244, ry: 170, color: "#D48A60", opacity: "0.2" },
      { cx: 708, cy: 442, rx: 238, ry: 154, color: "#EBD4C5", opacity: "0.16" },
      { cx: 612, cy: 654, rx: 270, ry: 154, color: "#403037", opacity: "0.28" },
      { cx: 342, cy: 704, rx: 286, ry: 176, color: "#0B0C10", opacity: "0.72" },
    ],
    darkBand: { color: "#4A3C44", opacity: "0.3" },
    warmBand: { color: "#D49C7A", opacity: "0.1" },
  },
  {
    id: "ember-core-no-waves",
    label: "Ember Core No Waves",
    waves: false,
    baseStops: [
      { color: "#FFF0E0" },
      { offset: "0.15", color: "#F6A05D" },
      { offset: "0.34", color: "#E55A27" },
      { offset: "0.58", color: "#A6321D" },
      { offset: "0.8", color: "#43201A" },
      { offset: "1", color: "#0F0F12" },
    ],
    shadowColor: "#08090B",
    shadowOpacity: "0.86",
    highlightColor: "#FFF7EF",
    highlightOpacity: "0.68",
    surfaceGlows: [
      { cx: 314, cy: 408, rx: 224, ry: 172, color: "#9C2B1C", opacity: "0.28" },
      { cx: 616, cy: 302, rx: 260, ry: 182, color: "#F46F2F", opacity: "0.34" },
      { cx: 720, cy: 444, rx: 238, ry: 166, color: "#FFD9B8", opacity: "0.22" },
      { cx: 642, cy: 638, rx: 278, ry: 168, color: "#54261E", opacity: "0.2" },
      { cx: 352, cy: 732, rx: 300, ry: 184, color: "#0B0C10", opacity: "0.74" },
    ],
    darkBand: { color: "#4B261D", opacity: "0.0" },
    warmBand: { color: "#E59A66", opacity: "0.0" },
  },
  {
    id: "charred-dusk-no-waves",
    label: "Charred Dusk No Waves",
    waves: false,
    baseStops: [
      { color: "#F7E6D7" },
      { offset: "0.14", color: "#D97D49" },
      { offset: "0.34", color: "#A94424" },
      { offset: "0.58", color: "#632719" },
      { offset: "0.8", color: "#231417" },
      { offset: "1", color: "#090A0D" },
    ],
    shadowColor: "#06070A",
    shadowOpacity: "0.9",
    highlightColor: "#FFF3E8",
    highlightOpacity: "0.52",
    surfaceGlows: [
      { cx: 322, cy: 418, rx: 214, ry: 166, color: "#73241A", opacity: "0.22" },
      { cx: 602, cy: 308, rx: 248, ry: 176, color: "#BD562A", opacity: "0.24" },
      { cx: 714, cy: 440, rx: 232, ry: 160, color: "#E7BB98", opacity: "0.16" },
      { cx: 626, cy: 646, rx: 284, ry: 170, color: "#311816", opacity: "0.28" },
      { cx: 354, cy: 734, rx: 306, ry: 188, color: "#05060A", opacity: "0.8" },
    ],
    darkBand: { color: "#311A18", opacity: "0.0" },
    warmBand: { color: "#B86A45", opacity: "0.0" },
  },
  {
    id: "molten-signal-no-waves",
    label: "Molten Signal No Waves",
    waves: false,
    baseStops: [
      { color: "#FFF4E7" },
      { offset: "0.16", color: "#FFB166" },
      { offset: "0.34", color: "#F46A2E" },
      { offset: "0.56", color: "#C13B1F" },
      { offset: "0.78", color: "#561F1A" },
      { offset: "1", color: "#131014" },
    ],
    shadowColor: "#08080C",
    shadowOpacity: "0.84",
    highlightColor: "#FFF9F1",
    highlightOpacity: "0.76",
    surfaceGlows: [
      { cx: 320, cy: 402, rx: 224, ry: 170, color: "#C6321C", opacity: "0.24" },
      { cx: 626, cy: 296, rx: 270, ry: 190, color: "#FF7D31", opacity: "0.38" },
      { cx: 736, cy: 442, rx: 250, ry: 170, color: "#FFE1C3", opacity: "0.28" },
      { cx: 648, cy: 630, rx: 286, ry: 170, color: "#6A281E", opacity: "0.18" },
      { cx: 346, cy: 724, rx: 300, ry: 182, color: "#101015", opacity: "0.68" },
    ],
    darkBand: { color: "#6B2F1F", opacity: "0.0" },
    warmBand: { color: "#F0A26F", opacity: "0.0" },
  },
  {
    id: "ash-copper-no-waves",
    label: "Ash Copper No Waves",
    waves: false,
    baseStops: [
      { color: "#F2ECE6" },
      { offset: "0.15", color: "#C58A65" },
      { offset: "0.34", color: "#9B593B" },
      { offset: "0.58", color: "#5E3B32" },
      { offset: "0.8", color: "#242127" },
      { offset: "1", color: "#0C0D10" },
    ],
    shadowColor: "#08090D",
    shadowOpacity: "0.88",
    highlightColor: "#FFF6F0",
    highlightOpacity: "0.58",
    surfaceGlows: [
      { cx: 320, cy: 408, rx: 218, ry: 170, color: "#7A483A", opacity: "0.18" },
      { cx: 610, cy: 302, rx: 252, ry: 178, color: "#D7946C", opacity: "0.22" },
      { cx: 722, cy: 446, rx: 240, ry: 164, color: "#F0DED4", opacity: "0.18" },
      { cx: 638, cy: 642, rx: 282, ry: 170, color: "#43333A", opacity: "0.22" },
      { cx: 350, cy: 730, rx: 302, ry: 184, color: "#0A0B10", opacity: "0.74" },
    ],
    darkBand: { color: "#4A3C44", opacity: "0.0" },
    warmBand: { color: "#D49C7A", opacity: "0.0" },
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

function glowBlock(glows) {
  return glows
    .map(
      glow =>
        `      <ellipse cx="${glow.cx}" cy="${glow.cy}" rx="${glow.rx}" ry="${glow.ry}" fill="${glow.color}" fill-opacity="${glow.opacity}"/>`,
    )
    .join("\n");
}

function renderVariant(baseSvg, variant) {
  let svg = baseSvg;

  svg = svg.replace(
    /<radialGradient id="planet-base"[\s\S]*?<\/radialGradient>/,
    `<radialGradient id="planet-base" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(636 360) rotate(130) scale(514 494)">\n${gradientStops(variant.baseStops)}\n    </radialGradient>`,
  );

  svg = svg.replace(
    /<radialGradient id="planet-shadow"[\s\S]*?<\/radialGradient>/,
    `<radialGradient id="planet-shadow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(382 664) rotate(-28) scale(248 162)">\n      <stop stop-color="${variant.shadowColor}" stop-opacity="${variant.shadowOpacity}"/>\n      <stop offset="1" stop-color="${variant.shadowColor}" stop-opacity="0"/>\n    </radialGradient>`,
  );

  svg = svg.replace(
    /<radialGradient id="planet-highlight"[\s\S]*?<\/radialGradient>/,
    `<radialGradient id="planet-highlight" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(670 338) rotate(138) scale(192 126)">\n      <stop stop-color="${variant.highlightColor}" stop-opacity="${variant.highlightOpacity}"/>\n      <stop offset="0.48" stop-color="${variant.highlightColor}" stop-opacity="${(Number(variant.highlightOpacity) * 0.34).toFixed(2)}"/>\n      <stop offset="1" stop-color="${variant.highlightColor}" stop-opacity="0"/>\n    </radialGradient>`,
  );

  svg = svg.replace(
    /<g filter="url\(#soft-blur-20\)">[\s\S]*?<\/g>/,
    `<g filter="url(#soft-blur-20)">\n${glowBlock(variant.surfaceGlows)}\n    </g>`,
  );

  svg = svg.replace(
    /<path d="M110 760C224 724 350 724 482 748C590 768 684 778 816 770" stroke="#2C4E72" stroke-opacity="0\.28" stroke-width="24" stroke-linecap="round"\/>/,
    `<path d="M110 760C224 724 350 724 482 748C590 768 684 778 816 770" stroke="${variant.darkBand.color}" stroke-opacity="${variant.darkBand.opacity}" stroke-width="24" stroke-linecap="round"/>`,
  );

  svg = svg.replace(
    /<path d="M94 578C206 536 320 538 438 564C540 586 638 604 768 594C828 590 874 578 910 554" stroke="#F6A17C" stroke-opacity="0\.12" stroke-width="24" stroke-linecap="round"\/>/,
    `<path d="M94 578C206 536 320 538 438 564C540 586 638 604 768 594C828 590 874 578 910 554" stroke="${variant.warmBand.color}" stroke-opacity="${variant.warmBand.opacity}" stroke-width="24" stroke-linecap="round"/>`,
  );

  if (!variant.waves) {
    svg = svg.replace(
      /\n\s*<path d="M132 312C242 264 356 264 476 290C578 312 678 322 814 316"[\s\S]*?<path d="M132 648C236 612 356 614 478 642C584 668 680 678 810 668" stroke="#FFFFFF" stroke-opacity="0\.075" stroke-width="14" stroke-linecap="round"\/>/,
      "",
    );
    svg = svg.replace(
      /\n\s*<path d="M110 760C224 724 350 724 482 748C590 768 684 778 816 770"[^>]*\/>/,
      "",
    );
    svg = svg.replace(
      /\n\s*<path d="M94 578C206 536 320 538 438 564C540 586 638 604 768 594C828 590 874 578 910 554"[^>]*\/>/,
      "",
    );
  }

  return svg;
}

async function main() {
  const baseSvg = await fs.readFile(basePath, "utf8");

  for (const variant of variants) {
    const outputPath = path.join(__dirname, `planet-flare-logo-obsidian-ember-${variant.id}.svg`);
    const svg = renderVariant(baseSvg, variant);
    await fs.writeFile(outputPath, svg);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
