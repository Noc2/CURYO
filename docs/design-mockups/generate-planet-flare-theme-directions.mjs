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
    body: "Warm editorial palette with sunset gold, coral, and deep navy.",
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
    body: "Seafoam, aqua, and cobalt make the brand calmer and more analytical.",
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
    body: "Brass, amber, and rust shift the brand toward premium editorial.",
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
    body: "Sky blue and apricot make the mark brighter, more optimistic, and social.",
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

const experimentalThemeDirections = [
  {
    id: "aurora-relay",
    name: "Aurora Relay",
    tag: "Neon future",
    body: "Mint, periwinkle, and ultraviolet push the mark into sci-fi territory.",
    bgFrom: "#050914",
    bgTo: "#111735",
    panelGlow: "#65F3C7",
    panelGlowSoft: "#6A67FF",
    surface: "#0D1530",
    surfaceAlt: "#14204A",
    surfaceStroke: "#FFFFFF14",
    text: "#F5FBFF",
    muted: "#A7B5D7",
    accent: "#7AF4D3",
    accentSoft: "#D4FFF4",
    accentText: "#04111A",
    chip: "#241D56",
    chipText: "#D9D4FF",
    swatches: ["#EFFFFA", "#7AF4D3", "#718BFF", "#B675FF", "#091121"],
    flare: {
      outer: "#41E6C0",
      dark: "#133E35",
      glowOpacity: 0.52,
      endpointGlow: "#78FFD8",
      endpointCore: "#F3FFFA",
      stops: [
        { color: "#41E6C0" },
        { offset: "0.26", color: "#74F4D5" },
        { offset: "0.58", color: "#B4FFD8" },
        { offset: "0.84", color: "#E9FFF1" },
        { offset: "1", color: "#FFFFFF" },
      ],
      coreStops: [
        { color: "#96FFE7" },
        { offset: "0.52", color: "#F1FFF9" },
        { offset: "1", color: "#FFFFFF" },
      ],
    },
    logo: {
      baseStops: [
        { color: "#F2FFFB" },
        { offset: "0.16", color: "#8FECD9" },
        { offset: "0.34", color: "#5BBDE9" },
        { offset: "0.57", color: "#6C7CF9" },
        { offset: "0.8", color: "#6A32A4" },
        { offset: "1", color: "#081020" },
      ],
      shadowColor: "#050A13",
      shadowOpacity: 0.8,
      highlightColor: "#F8FFFF",
      highlightOpacity: 0.76,
      atmosphereColor: "#BEFFF0",
      atmosphereOpacity: 0.24,
      edgeStroke: "#FFFFFF",
      edgeOpacity: 0.2,
      warmDash: "#7AEFD6",
      warmDashOpacity: 0.12,
      outerRing: "#131A30",
      ringShadow: "#28224E",
      ringShadowOpacity: 0.7,
      glows: [
        { cx: 318, cy: 382, rx: 206, ry: 154, color: "#6AF1D0", opacity: 0.34 },
        { cx: 610, cy: 314, rx: 248, ry: 170, color: "#8AB4FF", opacity: 0.28 },
        { cx: 718, cy: 438, rx: 236, ry: 156, color: "#C88BFF", opacity: 0.3 },
        { cx: 606, cy: 660, rx: 274, ry: 154, color: "#2B4E8A", opacity: 0.26 },
        { cx: 334, cy: 706, rx: 290, ry: 180, color: "#09111F", opacity: 0.68 },
      ],
      darkBand: "#274D86",
      darkBandOpacity: 0.3,
      warmBand: "#9DEFE1",
      warmBandOpacity: 0.12,
    },
  },
  {
    id: "rose-eclipse",
    name: "Rose Eclipse",
    tag: "Luxe surreal",
    body: "Plum, rose, and magenta make the identity bolder and less tech-blue.",
    bgFrom: "#14070F",
    bgTo: "#26121D",
    panelGlow: "#FF64B8",
    panelGlowSoft: "#9566FF",
    surface: "#241121",
    surfaceAlt: "#321831",
    surfaceStroke: "#FFFFFF12",
    text: "#FFF5FB",
    muted: "#D1AEC8",
    accent: "#FF7FCA",
    accentSoft: "#FFD9F0",
    accentText: "#210916",
    chip: "#431B37",
    chipText: "#FFD3EA",
    swatches: ["#FFF1F8", "#FF9DCE", "#FF5B9D", "#8E63E7", "#1C0B17"],
    flare: {
      outer: "#FF4FA6",
      dark: "#5D1D43",
      glowOpacity: 0.54,
      endpointGlow: "#FF84C7",
      endpointCore: "#FFF1FA",
      stops: [
        { color: "#FF4FA6" },
        { offset: "0.22", color: "#FF68B9" },
        { offset: "0.5", color: "#FF95CA" },
        { offset: "0.82", color: "#FFD5D8" },
        { offset: "1", color: "#FFF2E8" },
      ],
      coreStops: [
        { color: "#FF9ED3" },
        { offset: "0.52", color: "#FFE8F5" },
        { offset: "1", color: "#FFF9F0" },
      ],
    },
    logo: {
      baseStops: [
        { color: "#FFF3FB" },
        { offset: "0.16", color: "#FFB4D7" },
        { offset: "0.34", color: "#FF718F" },
        { offset: "0.58", color: "#A85BE7" },
        { offset: "0.8", color: "#5A1F53" },
        { offset: "1", color: "#140913" },
      ],
      shadowColor: "#130611",
      shadowOpacity: 0.84,
      highlightColor: "#FFF6FB",
      highlightOpacity: 0.72,
      atmosphereColor: "#FFC8E3",
      atmosphereOpacity: 0.2,
      edgeStroke: "#FFF5FB",
      edgeOpacity: 0.16,
      warmDash: "#FF9BCA",
      warmDashOpacity: 0.1,
      outerRing: "#24121D",
      ringShadow: "#4A2140",
      ringShadowOpacity: 0.7,
      glows: [
        { cx: 330, cy: 386, rx: 206, ry: 156, color: "#FF7EB8", opacity: 0.26 },
        { cx: 606, cy: 316, rx: 238, ry: 168, color: "#FFC8D8", opacity: 0.24 },
        { cx: 706, cy: 442, rx: 238, ry: 156, color: "#B777FF", opacity: 0.24 },
        { cx: 604, cy: 658, rx: 272, ry: 152, color: "#6B284D", opacity: 0.28 },
        { cx: 340, cy: 704, rx: 286, ry: 176, color: "#180A16", opacity: 0.7 },
      ],
      darkBand: "#6D2D61",
      darkBandOpacity: 0.28,
      warmBand: "#FFAAC8",
      warmBandOpacity: 0.12,
    },
  },
  {
    id: "verdant-current",
    name: "Verdant Current",
    tag: "Organic trust",
    body: "Jade and pine calm the system while a citrus flare keeps it lively.",
    bgFrom: "#08130F",
    bgTo: "#11211A",
    panelGlow: "#59D8B0",
    panelGlowSoft: "#B7FF54",
    surface: "#0F1F18",
    surfaceAlt: "#163127",
    surfaceStroke: "#FFFFFF12",
    text: "#F4FBF6",
    muted: "#A7C2B3",
    accent: "#84DBB4",
    accentSoft: "#E8FFD8",
    accentText: "#08140F",
    chip: "#24402E",
    chipText: "#D9FFB8",
    swatches: ["#F5FFF2", "#A1F0CC", "#48B08B", "#C9FF53", "#07120E"],
    flare: {
      outer: "#BBFF39",
      dark: "#495C12",
      glowOpacity: 0.52,
      endpointGlow: "#E6FF8C",
      endpointCore: "#FFFFF0",
      stops: [
        { color: "#BBFF39" },
        { offset: "0.22", color: "#D8FF5C" },
        { offset: "0.52", color: "#F5FF96" },
        { offset: "0.82", color: "#FFF3BF" },
        { offset: "1", color: "#FFFBEA" },
      ],
      coreStops: [
        { color: "#E2FF8A" },
        { offset: "0.52", color: "#FFF9D9" },
        { offset: "1", color: "#FFFFF3" },
      ],
    },
    logo: {
      baseStops: [
        { color: "#F7FFF4" },
        { offset: "0.16", color: "#AEEFD2" },
        { offset: "0.36", color: "#53B892" },
        { offset: "0.58", color: "#2E7564" },
        { offset: "0.8", color: "#123329" },
        { offset: "1", color: "#07120E" },
      ],
      shadowColor: "#06110D",
      shadowOpacity: 0.84,
      highlightColor: "#F8FFF7",
      highlightOpacity: 0.7,
      atmosphereColor: "#C9FFD4",
      atmosphereOpacity: 0.18,
      edgeStroke: "#F4FFF8",
      edgeOpacity: 0.15,
      warmDash: "#C7FF63",
      warmDashOpacity: 0.12,
      outerRing: "#122019",
      ringShadow: "#324326",
      ringShadowOpacity: 0.68,
      glows: [
        { cx: 318, cy: 380, rx: 206, ry: 156, color: "#6EE1BC", opacity: 0.24 },
        { cx: 604, cy: 318, rx: 248, ry: 170, color: "#CFF7C7", opacity: 0.2 },
        { cx: 708, cy: 446, rx: 236, ry: 156, color: "#97DB71", opacity: 0.18 },
        { cx: 602, cy: 658, rx: 272, ry: 154, color: "#214B37", opacity: 0.3 },
        { cx: 338, cy: 706, rx: 290, ry: 180, color: "#07120E", opacity: 0.72 },
      ],
      darkBand: "#214F44",
      darkBandOpacity: 0.3,
      warmBand: "#C9F58A",
      warmBandOpacity: 0.1,
    },
  },
  {
    id: "graphite-echo",
    name: "Graphite Echo",
    tag: "Editorial mono",
    body: "Graphite and ice create a stark editorial system with a cyan flare.",
    bgFrom: "#080A0E",
    bgTo: "#141A23",
    panelGlow: "#7DBDFF",
    panelGlowSoft: "#E9EEF7",
    surface: "#121821",
    surfaceAlt: "#1B2431",
    surfaceStroke: "#FFFFFF14",
    text: "#F6F8FC",
    muted: "#AEB8C8",
    accent: "#DCE8F7",
    accentSoft: "#BEE9FF",
    accentText: "#0A111A",
    chip: "#2A3443",
    chipText: "#E3EEF9",
    swatches: ["#F6FAFF", "#DCE8F7", "#9BAEC6", "#72D9FF", "#0A0F17"],
    flare: {
      outer: "#6BD7FF",
      dark: "#21455F",
      glowOpacity: 0.5,
      endpointGlow: "#B6EEFF",
      endpointCore: "#FFFFFF",
      stops: [
        { color: "#56CFFF" },
        { offset: "0.24", color: "#8FE3FF" },
        { offset: "0.54", color: "#D0F5FF" },
        { offset: "0.84", color: "#F2FBFF" },
        { offset: "1", color: "#FFFFFF" },
      ],
      coreStops: [
        { color: "#B7EEFF" },
        { offset: "0.52", color: "#F8FEFF" },
        { offset: "1", color: "#FFFFFF" },
      ],
    },
    logo: {
      baseStops: [
        { color: "#F8FBFF" },
        { offset: "0.18", color: "#D7E1EC" },
        { offset: "0.38", color: "#A4B1C4" },
        { offset: "0.6", color: "#54657F" },
        { offset: "0.82", color: "#1B2533" },
        { offset: "1", color: "#090E16" },
      ],
      shadowColor: "#060A10",
      shadowOpacity: 0.86,
      highlightColor: "#FFFFFF",
      highlightOpacity: 0.7,
      atmosphereColor: "#D8F2FF",
      atmosphereOpacity: 0.14,
      edgeStroke: "#FFFFFF",
      edgeOpacity: 0.18,
      warmDash: "#CBE9FF",
      warmDashOpacity: 0.08,
      outerRing: "#151B25",
      ringShadow: "#2D3947",
      ringShadowOpacity: 0.68,
      glows: [
        { cx: 326, cy: 382, rx: 204, ry: 154, color: "#C6D6E8", opacity: 0.18 },
        { cx: 602, cy: 314, rx: 244, ry: 168, color: "#FFFFFF", opacity: 0.2 },
        { cx: 710, cy: 442, rx: 236, ry: 156, color: "#7CD9FF", opacity: 0.2 },
        { cx: 602, cy: 658, rx: 272, ry: 152, color: "#304253", opacity: 0.3 },
        { cx: 336, cy: 706, rx: 288, ry: 180, color: "#09101A", opacity: 0.74 },
      ],
      darkBand: "#3C5067",
      darkBandOpacity: 0.3,
      warmBand: "#EAF5FF",
      warmBandOpacity: 0.08,
    },
  },
];

const obsidianEmberTheme = {
  id: "obsidian-ember",
  name: "Obsidian Ember",
  tag: "Contrast study",
  body: "Graphite, ember orange, steel grey, and warm white.",
  bgFrom: "#040506",
  bgTo: "#090A0C",
  panelGlow: "#F26426",
  panelGlowSoft: "#C53B1E",
  surface: "#121316",
  surfaceAlt: "#181A1F",
  surfaceStroke: "#FFFFFF12",
  text: "#F4F0EB",
  muted: "#AAA39D",
  accent: "#F26426",
  accentSoft: "#F4D7C7",
  accentText: "#120A06",
  chip: "#232730",
  chipText: "#D7DCE3",
  swatches: ["#F5F0EB", "#F26426", "#B3341B", "#7E8996", "#090A0C"],
  flare: {
    outer: "#F26426",
    dark: "#631D11",
    glowOpacity: 0.58,
    endpointGlow: "#FF9355",
    endpointCore: "#FFF4EA",
    stops: [
      { color: "#B3341B" },
      { offset: "0.22", color: "#E24D21" },
      { offset: "0.54", color: "#F36A29" },
      { offset: "0.82", color: "#FDBE9B" },
      { offset: "1", color: "#FFF5EA" },
    ],
    coreStops: [
      { color: "#FF8E59" },
      { offset: "0.48", color: "#FFE6D5" },
      { offset: "1", color: "#FFF9F2" },
    ],
  },
  logo: {
    baseStops: [
      { color: "#FFF0E1" },
      { offset: "0.15", color: "#F7A15E" },
      { offset: "0.34", color: "#E45A27" },
      { offset: "0.58", color: "#A9321D" },
      { offset: "0.8", color: "#43201A" },
      { offset: "1", color: "#0F0F12" },
    ],
    shadowColor: "#09090B",
    shadowOpacity: 0.88,
    highlightColor: "#FFF7F0",
    highlightOpacity: 0.72,
    atmosphereColor: "#FFC592",
    atmosphereOpacity: 0.22,
    edgeStroke: "#FFF3E7",
    edgeOpacity: 0.14,
    warmDash: "#F6A268",
    warmDashOpacity: 0.08,
    outerRing: "#17181C",
    ringShadow: "#3A241E",
    ringShadowOpacity: 0.72,
    glows: [
      { cx: 322, cy: 390, rx: 204, ry: 156, color: "#B92C1B", opacity: 0.34 },
      { cx: 610, cy: 322, rx: 244, ry: 170, color: "#F16C28", opacity: 0.28 },
      { cx: 716, cy: 446, rx: 236, ry: 156, color: "#FFD0AD", opacity: 0.22 },
      { cx: 608, cy: 664, rx: 270, ry: 154, color: "#4D261D", opacity: 0.28 },
      { cx: 340, cy: 710, rx: 294, ry: 182, color: "#0C0C0F", opacity: 0.74 },
    ],
    darkBand: "#4C261C",
    darkBandOpacity: 0.3,
    warmBand: "#E59C67",
    warmBandOpacity: 0.14,
  },
};

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

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function renderTextLines(lines, x, y, lineHeight, attributes) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" ${attributes}>${escapeXml(line)}</text>`,
    )
    .join("");
}

function renderLogoDefs(theme, prefix) {
  const { logo } = theme;
  const flare = theme.flare ?? sharedFlare;
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
      ${stopMarkup(flare.stops)}
    </linearGradient>
    <linearGradient id="${prefix}-flare-core" x1="684" y1="160" x2="892" y2="690" gradientUnits="userSpaceOnUse">
      ${stopMarkup(flare.coreStops)}
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
  const flare = theme.flare ?? sharedFlare;
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
        <circle cx="512" cy="512" r="406" stroke="${flare.outer}" stroke-opacity="${flare.glowOpacity}" stroke-width="28" stroke-linecap="round" stroke-dasharray="666 1885" transform="rotate(-66 512 512)"/>
      </g>
      <circle cx="512" cy="512" r="406" stroke="${flare.dark}" stroke-opacity="0.42" stroke-width="10" stroke-linecap="round" stroke-dasharray="666 1885" transform="rotate(-66 512 512)"/>
      <circle cx="512" cy="512" r="406" stroke="url(#${prefix}-flare-gradient)" stroke-width="8" stroke-linecap="round" stroke-dasharray="666 1885" transform="rotate(-66 512 512)"/>
      <circle cx="512" cy="512" r="406" stroke="url(#${prefix}-flare-core)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="666 1885" transform="rotate(-66 512 512)"/>
      <circle cx="871" cy="703" r="23" fill="${flare.endpointGlow ?? flare.outer}" fill-opacity="0.18"/>
      <circle cx="871" cy="703" r="9" fill="${flare.endpointCore ?? "#FFF3DF"}"/>

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
  const bodyLines = wrapText(theme.body, 44);
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
        ${renderTextLines(bodyLines, x + 36, y + 132, 22, `fill="${theme.muted}" font-size="18" font-family="${sans}"`)}

        ${renderLogo(theme, prefix, x + 30, y + 166, 276)}

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

function buildExperimentalThemeBoard() {
  const panels = experimentalThemeDirections.map(renderThemePanel);
  return `
<svg width="1740" height="1160" viewBox="0 0 1740 1160" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="experimental-board-bg" x1="70" y1="40" x2="1670" y2="1120" gradientUnits="userSpaceOnUse">
      <stop stop-color="#05070D"/>
      <stop offset="0.48" stop-color="#0A111B"/>
      <stop offset="1" stop-color="#070B12"/>
    </linearGradient>
    <radialGradient id="experimental-board-left" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(250 180) rotate(42) scale(360 260)">
      <stop stop-color="#7A67FF" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#7A67FF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="experimental-board-right" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1490 180) rotate(144) scale(380 250)">
      <stop stop-color="#8EFFC8" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#8EFFC8" stop-opacity="0"/>
    </radialGradient>
    ${panels.map(panel => panel.defs).join("")}
  </defs>

  <rect width="1740" height="1160" fill="url(#experimental-board-bg)"/>
  <rect width="1740" height="1160" fill="url(#experimental-board-left)"/>
  <rect width="1740" height="1160" fill="url(#experimental-board-right)"/>

  <text x="80" y="62" fill="#FFFFFF" font-size="44" font-weight="700" font-family="${sans}">Alternative Planet + Flare Directions</text>
  <text x="80" y="100" fill="#D8E0EA" fill-opacity="0.72" font-size="18" font-family="${sans}">Four deliberately different brand systems, including new flare colors, to test how far the logo and UI can move before they become a different identity.</text>

  ${panels.map(panel => panel.content).join("")}
</svg>
`.trim();
}

function buildObsidianEmberBoard() {
  const theme = obsidianEmberTheme;
  const prefix = `${theme.id}-board`;
  const headlineLines = wrapText("Signal-first curation with sharper contrast.", 22);
  const bodyLines = wrapText(
    "This direction leans into graphite panels, hot orange accents, warm white type, and a darker Mars-like planet to make the brand feel bolder and more premium.",
    44,
  );
  const headlineY = 228;
  const headlineLineHeight = 52;
  const headlineBottom = headlineY + (headlineLines.length - 1) * headlineLineHeight;
  const bodyY = headlineBottom + 42;
  const bodyLineHeight = 26;
  const bodyBottom = bodyY + (bodyLines.length - 1) * bodyLineHeight;
  const buttonY = bodyBottom + 40;
  const chipY = buttonY + 70;

  return `
<svg width="1760" height="1140" viewBox="0 0 1760 1140" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${prefix}-bg" x1="80" y1="60" x2="1680" y2="1100" gradientUnits="userSpaceOnUse">
      <stop stop-color="#030405"/>
      <stop offset="0.55" stop-color="#07080A"/>
      <stop offset="1" stop-color="#050608"/>
    </linearGradient>
    <radialGradient id="${prefix}-bg-orange" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1260 180) rotate(146) scale(420 280)">
      <stop stop-color="#F26426" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#F26426" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${prefix}-bg-grey" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(360 860) rotate(34) scale(460 260)">
      <stop stop-color="#747D87" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#747D87" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${prefix}-hero-bg" x1="72" y1="120" x2="980" y2="550" gradientUnits="userSpaceOnUse">
      <stop stop-color="#131417"/>
      <stop offset="1" stop-color="#17191D"/>
    </linearGradient>
    <linearGradient id="${prefix}-card-bg" x1="1040" y1="120" x2="1688" y2="820" gradientUnits="userSpaceOnUse">
      <stop stop-color="#121316"/>
      <stop offset="1" stop-color="#17191D"/>
    </linearGradient>
    <linearGradient id="${prefix}-bottom-bg" x1="72" y1="598" x2="992" y2="1028" gradientUnits="userSpaceOnUse">
      <stop stop-color="#121316"/>
      <stop offset="1" stop-color="#181A20"/>
    </linearGradient>
    <linearGradient id="${prefix}-accent-line" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#C73C1E"/>
      <stop offset="0.5" stop-color="#F26426"/>
      <stop offset="1" stop-color="#FFD0AD"/>
    </linearGradient>
    <radialGradient id="${prefix}-hero-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(810 252) rotate(142) scale(260 160)">
      <stop stop-color="#F26426" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#F26426" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${prefix}-hero-shadow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(770 380) rotate(140) scale(260 180)">
      <stop stop-color="#FFFFFF" stop-opacity="0.07"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    ${renderLogoDefs(theme, prefix)}
  </defs>

  <rect width="1760" height="1140" fill="url(#${prefix}-bg)"/>
  <rect width="1760" height="1140" fill="url(#${prefix}-bg-orange)"/>
  <rect width="1760" height="1140" fill="url(#${prefix}-bg-grey)"/>

  <text x="72" y="64" fill="#FFFFFF" font-size="46" font-weight="700" font-family="${sans}">Obsidian Ember Contrast Study</text>
  <text x="72" y="100" fill="#D8DDD9" fill-opacity="0.72" font-size="18" font-family="${sans}">Orange, graphite, warm white, and steel grey applied to the current planet-plus-flare mark in a more contrast-heavy UI system.</text>

  <g>
    <rect x="72" y="120" width="930" height="430" rx="38" fill="url(#${prefix}-hero-bg)"/>
    <rect x="72" y="120" width="930" height="430" rx="38" fill="url(#${prefix}-hero-glow)"/>
    <rect x="72" y="120" width="930" height="430" rx="38" fill="url(#${prefix}-hero-shadow)"/>
    <rect x="72" y="120" width="930" height="430" rx="38" stroke="#FFFFFF12" stroke-width="2"/>

    <rect x="110" y="156" width="134" height="32" rx="16" fill="#1C1E23"/>
    <circle cx="132" cy="172" r="5" fill="#F26426"/>
    <text x="148" y="178" fill="#F4D7C7" font-size="13" letter-spacing="1.8" font-family="${mono}">EMBER / GRAPHITE</text>

    ${renderTextLines(headlineLines, 110, headlineY, headlineLineHeight, `fill="#F4F0EB" font-size="52" font-weight="700" font-family="${sans}"`)}
    ${renderTextLines(bodyLines, 110, bodyY, bodyLineHeight, `fill="#AAA39D" font-size="18" font-family="${sans}"`)}

    <rect x="110" y="${buttonY}" width="178" height="48" rx="24" fill="#F4F0EB"/>
    <text x="199" y="${buttonY + 30}" text-anchor="middle" fill="#120A06" font-size="15" font-weight="700" font-family="${sans}">Launch Signal Feed</text>
    <rect x="302" y="${buttonY}" width="156" height="48" rx="24" fill="#1E222A" stroke="#F2642642" stroke-width="1.5"/>
    <text x="380" y="${buttonY + 30}" text-anchor="middle" fill="#D7DCE3" font-size="15" font-weight="600" font-family="${sans}">Review Theme Tokens</text>

    <rect x="110" y="${chipY}" width="168" height="26" rx="13" fill="#1B1F25"/>
    <rect x="292" y="${chipY}" width="154" height="26" rx="13" fill="#1B1F25"/>
    <rect x="460" y="${chipY}" width="138" height="26" rx="13" fill="#1B1F25"/>
    <text x="124" y="${chipY + 17}" fill="#AAA39D" font-size="12" font-family="${sans}">Planet read: darker / warmer</text>
    <text x="306" y="${chipY + 17}" fill="#AAA39D" font-size="12" font-family="${sans}">Flare read: brighter / sharper</text>
    <text x="474" y="${chipY + 17}" fill="#AAA39D" font-size="12" font-family="${sans}">UI read: premium contrast</text>

    ${renderLogo(theme, prefix, 636, 154, 312)}
  </g>

  <g>
    <rect x="1040" y="120" width="650" height="280" rx="34" fill="url(#${prefix}-card-bg)"/>
    <rect x="1040" y="120" width="650" height="280" rx="34" stroke="#FFFFFF10" stroke-width="2"/>
    <text x="1076" y="170" fill="#F4F0EB" font-size="28" font-weight="700" font-family="${sans}">Round Snapshot</text>
    <text x="1076" y="198" fill="#AAA39D" font-size="15" font-family="${sans}">A stronger orange accent makes ranking, heat, and urgency read faster.</text>

    <circle cx="1168" cy="282" r="68" stroke="#23262D" stroke-width="14"/>
    <circle cx="1168" cy="282" r="68" stroke="#F4F0EB" stroke-opacity="0.14" stroke-width="4"/>
    <circle cx="1168" cy="282" r="68" stroke="url(#${prefix}-accent-line)" stroke-width="10" stroke-linecap="round" stroke-dasharray="270 190" transform="rotate(-122 1168 282)"/>
    <text x="1168" y="276" text-anchor="middle" fill="#F4F0EB" font-size="30" font-weight="700" font-family="${sans}">73%</text>
    <text x="1168" y="302" text-anchor="middle" fill="#AAA39D" font-size="12" font-family="${sans}">Trust lift</text>

    <text x="1282" y="250" fill="#F4F0EB" font-size="15" font-weight="600" font-family="${sans}">Novelty</text>
    <rect x="1282" y="262" width="278" height="10" rx="5" fill="#20242B"/>
    <rect x="1282" y="262" width="224" height="10" rx="5" fill="#F26426"/>
    <text x="1576" y="272" text-anchor="end" fill="#F4D7C7" font-size="13" font-family="${mono}">82</text>

    <text x="1282" y="302" fill="#F4F0EB" font-size="15" font-weight="600" font-family="${sans}">Signal confidence</text>
    <rect x="1282" y="314" width="278" height="10" rx="5" fill="#20242B"/>
    <rect x="1282" y="314" width="202" height="10" rx="5" fill="#E65022"/>
    <text x="1576" y="324" text-anchor="end" fill="#F4D7C7" font-size="13" font-family="${mono}">74</text>

    <text x="1282" y="354" fill="#F4F0EB" font-size="15" font-weight="600" font-family="${sans}">Consensus heat</text>
    <rect x="1282" y="366" width="278" height="10" rx="5" fill="#20242B"/>
    <rect x="1282" y="366" width="182" height="10" rx="5" fill="#D1401D"/>
    <text x="1576" y="376" text-anchor="end" fill="#F4D7C7" font-size="13" font-family="${mono}">68</text>
  </g>

  <g>
    <rect x="1040" y="432" width="650" height="392" rx="34" fill="url(#${prefix}-card-bg)"/>
    <rect x="1040" y="432" width="650" height="392" rx="34" stroke="#FFFFFF10" stroke-width="2"/>
    <text x="1076" y="480" fill="#F4F0EB" font-size="28" font-weight="700" font-family="${sans}">Submission Stack</text>
    <text x="1076" y="508" fill="#AAA39D" font-size="15" font-family="${sans}">Dark cards and hotter accents make the flare feel native to the rest of the interface.</text>

    <rect x="1076" y="540" width="578" height="66" rx="20" fill="#1A1D23"/>
    <circle cx="1106" cy="573" r="8" fill="#F26426"/>
    <text x="1126" y="568" fill="#F4F0EB" font-size="16" font-weight="600" font-family="${sans}">Freshly surfacing</text>
    <text x="1126" y="590" fill="#AAA39D" font-size="13" font-family="${sans}">Orange tags call attention without relying on large filled blocks.</text>
    <text x="1620" y="576" text-anchor="end" fill="#F4D7C7" font-size="14" font-family="${mono}">+28%</text>

    <rect x="1076" y="620" width="578" height="66" rx="20" fill="#1A1D23"/>
    <circle cx="1106" cy="653" r="8" fill="#F4F0EB"/>
    <text x="1126" y="648" fill="#F4F0EB" font-size="16" font-weight="600" font-family="${sans}">Trusted by curators</text>
    <text x="1126" y="670" fill="#AAA39D" font-size="13" font-family="${sans}">Warm white becomes the premium neutral across headlines and controls.</text>
    <text x="1620" y="656" text-anchor="end" fill="#D7DCE3" font-size="14" font-family="${mono}">91</text>

    <rect x="1076" y="706" width="578" height="92" rx="22" fill="#181B20"/>
    <text x="1104" y="736" fill="#AAA39D" font-size="13" font-family="${sans}">Signal velocity</text>
    <path d="M1106 774C1152 772 1178 744 1212 744C1242 744 1258 760 1290 760C1328 760 1344 728 1384 728C1420 728 1438 754 1472 754C1504 754 1522 734 1554 734C1586 734 1604 748 1630 742" stroke="url(#${prefix}-accent-line)" stroke-width="5" stroke-linecap="round"/>
    <circle cx="1630" cy="742" r="6" fill="#FFF4EA"/>
    <path d="M1106 786H1630" stroke="#FFFFFF12" stroke-width="1"/>
  </g>

  <g>
    <rect x="72" y="590" width="930" height="436" rx="38" fill="url(#${prefix}-bottom-bg)"/>
    <rect x="72" y="590" width="930" height="436" rx="38" stroke="#FFFFFF10" stroke-width="2"/>
    <text x="110" y="640" fill="#F4F0EB" font-size="30" font-weight="700" font-family="${sans}">Filter / Review Controls</text>
    <text x="110" y="670" fill="#AAA39D" font-size="16" font-family="${sans}">A sharper contrast system gives chips, rings, and toggles more hierarchy without losing the soft orbital shapes.</text>

    <rect x="110" y="720" width="70" height="196" rx="24" fill="#171A1F"/>
    <circle cx="145" cy="760" r="4" fill="#F26426"/>
    <path d="M145 782V836" stroke="#2A2E36" stroke-width="3" stroke-linecap="round"/>
    <circle cx="145" cy="864" r="4" fill="#7E8996"/>
    <circle cx="145" cy="900" r="4" fill="#7E8996"/>

    <circle cx="388" cy="816" r="108" stroke="#20242A" stroke-width="22"/>
    <circle cx="388" cy="816" r="108" stroke="#F4F0EB" stroke-opacity="0.12" stroke-width="3"/>
    <circle cx="388" cy="816" r="108" stroke="url(#${prefix}-accent-line)" stroke-width="8" stroke-linecap="round" stroke-dasharray="420 260" transform="rotate(-118 388 816)"/>
    <text x="388" y="806" text-anchor="middle" fill="#F4F0EB" font-size="32" font-weight="700" font-family="${sans}">25K</text>
    <text x="388" y="834" text-anchor="middle" fill="#AAA39D" font-size="12" font-family="${sans}">active votes</text>
    <text x="388" y="852" text-anchor="middle" fill="#7E8996" font-size="11" font-family="${mono}">MAX 72K</text>

    <rect x="606" y="724" width="320" height="50" rx="18" fill="#171A1F"/>
    <text x="632" y="756" fill="#F4F0EB" font-size="15" font-weight="600" font-family="${sans}">Dust storm activity</text>
    <rect x="880" y="736" width="28" height="28" rx="10" fill="#F4F0EB"/>
    <path d="M888 750L892 754L900 744" stroke="#161312" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>

    <rect x="606" y="786" width="320" height="50" rx="18" fill="#171A1F"/>
    <text x="632" y="818" fill="#F4F0EB" font-size="15" font-weight="600" font-family="${sans}">Charging platform</text>
    <rect x="880" y="798" width="28" height="28" rx="10" fill="#F4F0EB"/>
    <path d="M888 812L892 816L900 806" stroke="#161312" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>

    <text x="606" y="870" fill="#AAA39D" font-size="12" font-family="${sans}">Source confidence</text>
    <rect x="606" y="886" width="230" height="38" rx="19" fill="#111316"/>
    <rect x="608" y="888" width="72" height="34" rx="17" fill="#F4F0EB"/>
    <text x="644" y="911" text-anchor="middle" fill="#120A06" font-size="13" font-weight="700" font-family="${sans}">Low</text>
    <text x="722" y="911" text-anchor="middle" fill="#AAA39D" font-size="13" font-family="${sans}">Med</text>
    <text x="790" y="911" text-anchor="middle" fill="#AAA39D" font-size="13" font-family="${sans}">High</text>

    <text x="606" y="960" fill="#AAA39D" font-size="12" font-family="${sans}">Community energy</text>
    <rect x="606" y="976" width="230" height="38" rx="19" fill="#111316"/>
    <rect x="719" y="978" width="115" height="34" rx="17" fill="#F26426"/>
    <text x="663" y="1001" text-anchor="middle" fill="#AAA39D" font-size="13" font-family="${sans}">Calm</text>
    <text x="776" y="1001" text-anchor="middle" fill="#120A06" font-size="13" font-weight="700" font-family="${sans}">Active</text>
  </g>

  <g>
    <rect x="1040" y="848" width="650" height="178" rx="34" fill="url(#${prefix}-card-bg)"/>
    <rect x="1040" y="848" width="650" height="178" rx="34" stroke="#FFFFFF10" stroke-width="2"/>
    <text x="1076" y="896" fill="#F4F0EB" font-size="26" font-weight="700" font-family="${sans}">Theme Tokens</text>
    <text x="1076" y="924" fill="#AAA39D" font-size="15" font-family="${sans}">Orange drives action, warm white carries hierarchy, and graphite keeps the system grounded.</text>
    ${renderSwatches(theme.swatches, 1090, 974, 58, 16)}
    <text x="1076" y="1012" fill="#AAA39D" font-size="12" font-family="${mono}">#F5F0EB / #F26426 / #B3341B / #7E8996 / #090A0C</text>
  </g>
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
    ["planet-flare-alt-theme-directions.svg", buildExperimentalThemeBoard()],
    ["planet-flare-3d-gradient-tests.svg", buildGradientBoard()],
    ["planet-flare-obsidian-ember.svg", buildObsidianEmberBoard()],
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
