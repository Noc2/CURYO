/**
 * Whitepaper PDF generator.
 * Run: yarn whitepaper  (or:  npx tsx scripts/whitepaper/generate.tsx)
 * Outputs: public/curyo-whitepaper.pdf
 */
import React from "react";
import { ContentBlock, EXECUTIVE_SUMMARY, META, SECTIONS, TableData } from "./content";
import { renderLatex } from "./latex";
import {
  Circle,
  Defs,
  Document,
  Ellipse,
  LinearGradient,
  Page,
  Path,
  RadialGradient,
  Stop,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToFile,
  renderToStream,
} from "@react-pdf/renderer";

// ── Brand colors ──
const EMBER = "#F26426";
const EMBER_DEEP = "#B3341B";
const STEEL = "#7E8996";
const DARK = "#090A0C";
const GRAY = STEEL;
const LIGHT_BG = "#F5F0EB";
// Per-section accent colors (cycles through the website palette)
const SECTION_COLORS = [EMBER, STEEL, EMBER_DEEP, EMBER, STEEL, EMBER_DEEP, EMBER];

// Module-level map populated during first render pass (for TOC page numbers)
const sectionPageMap: Record<number, number> = {};

// ── Styles ──
const s = StyleSheet.create({
  page: {
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 50,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: DARK,
    lineHeight: 1.6,
  },
  // Cover
  cover: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 60 },
  coverTitle: { fontSize: 48, fontFamily: "Helvetica-Bold", color: DARK, marginTop: 30 },
  coverSubtitle: { fontSize: 16, color: GRAY, marginTop: 36, textAlign: "center" },
  coverMeta: { fontSize: 11, color: GRAY, marginTop: 24, textAlign: "center" },
  // TOC
  tocTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", color: DARK, marginBottom: 20 },
  tocEntry: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
  },
  tocNum: { fontSize: 11, fontFamily: "Helvetica-Bold", color: EMBER, width: 20 },
  tocLabel: { fontSize: 11, color: DARK, flex: 1 },
  tocSubEntry: {
    flexDirection: "row" as const,
    paddingVertical: 2,
    paddingLeft: 20,
  },
  tocSubNum: { fontSize: 9, fontFamily: "Helvetica-Bold", width: 28 },
  tocSubLabel: { fontSize: 9, flex: 1 },
  // Section
  sectionTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: EMBER, marginBottom: 14 },
  sectionLead: { fontSize: 11, color: GRAY, marginBottom: 8 },
  subHeading: { fontSize: 14, fontFamily: "Helvetica-Bold", color: DARK, marginTop: 16, marginBottom: 6 },
  subSubHeading: { fontSize: 11, fontFamily: "Helvetica-Bold", color: DARK, marginTop: 10, marginBottom: 4 },
  paragraph: { marginBottom: 8 },
  bulletRow: { flexDirection: "row", marginBottom: 4, paddingLeft: 8 },
  orderedRow: { flexDirection: "row", marginBottom: 6, paddingLeft: 8 },
  bulletDot: { width: 12, color: EMBER, fontFamily: "Helvetica-Bold" },
  bulletText: { flex: 1 },
  orderedNum: { width: 18, color: EMBER, fontFamily: "Helvetica-Bold" },
  // Table
  table: { marginVertical: 8, borderWidth: 0.5, borderColor: "#d0d0d0" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: EMBER },
  tableHeaderCell: { flex: 1, padding: 5, fontSize: 9, fontFamily: "Helvetica-Bold", color: "#fff" },
  tableRow: { flexDirection: "row" },
  tableRowAlt: { backgroundColor: LIGHT_BG },
  tableCell: { flex: 1, padding: 5, fontSize: 9, borderTopWidth: 0.5, borderTopColor: "#d0d0d0" },
  // Footer
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#999",
  },
});

function CoverLogo() {
  return (
    <Svg viewBox="0 0 84 84" style={{ width: 280, height: 280 }}>
      <Defs>
        <RadialGradient id="cover-orb" cx="48" cy="26" r="46" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#FFF8F2" />
          <Stop offset="20%" stopColor="#F8E1D0" />
          <Stop offset="40%" stopColor="#F7B070" />
          <Stop offset="62%" stopColor="#F26426" />
          <Stop offset="82%" stopColor="#B23C3B" />
          <Stop offset="100%" stopColor="#6A345F" />
        </RadialGradient>
        <RadialGradient id="cover-glow" cx="46" cy="34" r="32" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#FFF8F3" stopOpacity={0.74} />
          <Stop offset="55%" stopColor="#FFF8F3" stopOpacity={0.16} />
          <Stop offset="100%" stopColor="#FFF8F3" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="cover-flare" x1="38" y1="10" x2="76" y2="46" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#F45C4D" />
          <Stop offset="28%" stopColor="#FF8A5D" />
          <Stop offset="62%" stopColor="#FFC37A" />
          <Stop offset="100%" stopColor="#FFF4DB" />
        </LinearGradient>
      </Defs>

      <Circle cx="42" cy="42" r="24" fill="url(#cover-orb)" />
      <Ellipse cx="42" cy="42" rx="24" ry="24" fill="url(#cover-glow)" />
      <Path d="M20 48C28 36 42 29 57 30C49 34 42 39 33 49C28 54 24 57 20 48Z" fill="#FFF7F0" fillOpacity={0.22} />
      <Path d="M27 57C35 52 43 49 54 48C51 53 47 58 41 62C35 64 30 63 27 57Z" fill="#6B37A5" fillOpacity={0.22} />
      <Path
        d="M60.5 16.5C67 18.5 72.5 22.5 76 28.5"
        stroke="url(#cover-flare)"
        strokeWidth={4.75}
        strokeLinecap="round"
      />
      <Circle cx="77.5" cy="31" r="3.5" fill="#FFF4DB" />
    </Svg>
  );
}

// ── PDF Table component ──
function PdfTable({ data, color }: { data: TableData; color: string }) {
  return (
    <View style={s.table}>
      <View style={[s.tableHeaderRow, { backgroundColor: color }]}>
        {data.headers.map((h, i) => (
          <Text key={i} style={s.tableHeaderCell}>
            {h}
          </Text>
        ))}
      </View>
      {data.rows.map((row, ri) => (
        <View key={ri} style={[s.tableRow, ri % 2 === 1 ? s.tableRowAlt : {}]}>
          {row.map((cell, ci) => (
            <Text key={ci} style={s.tableCell}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Content block renderer ──
function RenderBlock({ block, color }: { block: ContentBlock; color: string }) {
  switch (block.type) {
    case "paragraph":
      return <Text style={s.paragraph}>{block.text}</Text>;
    case "sub_heading":
      return (
        <Text style={s.subSubHeading} minPresenceAhead={30}>
          {block.text}
        </Text>
      );
    case "bullets":
      return (
        <View style={{ marginBottom: 8 }}>
          {block.items.map((item, i) => (
            <View key={i} style={s.bulletRow} wrap={false}>
              <Text style={[s.bulletDot, { color }]}>{"\u2022"}</Text>
              <Text style={s.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case "ordered":
      return (
        <View style={{ marginBottom: 8 }} wrap={false}>
          {block.items.map((item, i) => (
            <View key={i} style={s.orderedRow} wrap={false}>
              <Text style={[s.orderedNum, { color }]}>{i + 1}.</Text>
              <Text style={s.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case "table":
      return <PdfTable data={block.data} color={color} />;
    case "formula": {
      try {
        const { element, height } = renderLatex(block.latex, DARK);
        return <View style={{ alignItems: "center", marginVertical: 6, minHeight: height }}>{element}</View>;
      } catch (err) {
        console.warn("LaTeX render failed:", block.latex, err);
        return <Text style={s.paragraph}>[Formula: {block.latex}]</Text>;
      }
    }
  }
}

// ── Footer ──
function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>Curyo Whitepaper</Text>
      <Text render={({ pageNumber }) => `${pageNumber}`} />
    </View>
  );
}

// ── Main document ──
function WhitepaperDocument({ tocPageNumbers }: { tocPageNumbers?: Record<number, number> }) {
  return (
    <Document title="Curyo Whitepaper" author={META.author} subject={META.subtitle}>
      {/* Cover page */}
      <Page size="A4" style={[s.page, { paddingTop: 0, paddingBottom: 0 }]}>
        <View style={s.cover}>
          <CoverLogo />
          <Text style={s.coverTitle}>{META.title}</Text>
          <Text style={s.coverSubtitle}>{META.subtitle}</Text>
          <Text style={s.coverMeta}>
            Author: {META.author}
            {"  |  "}Version {META.version}
            {"  |  "}
            {META.date}
          </Text>
        </View>
      </Page>

      {/* Executive Summary */}
      <Page size="A4" style={s.page}>
        <Text style={[s.sectionTitle, { color: DARK }]}>Executive Summary</Text>
        {EXECUTIVE_SUMMARY.map((block, i) => (
          <RenderBlock key={i} block={block} color={EMBER} />
        ))}
        <Footer />
      </Page>

      {/* Table of Contents */}
      <Page size="A4" style={s.page}>
        <Text style={s.tocTitle}>Table of Contents</Text>
        {SECTIONS.map((sec, i) => {
          const color = SECTION_COLORS[i % SECTION_COLORS.length];
          return (
            <View key={i}>
              <View style={s.tocEntry}>
                <Text style={[s.tocNum, { color }]}>{i + 1}</Text>
                <Text style={[s.tocLabel, { color, fontFamily: "Helvetica-Bold" }]}>{sec.title}</Text>
                {tocPageNumbers?.[i] != null && (
                  <Text style={{ fontSize: 11, color: GRAY, width: 30, textAlign: "right" }}>{tocPageNumbers[i]}</Text>
                )}
              </View>
              {sec.subsections.map((sub, j) => (
                <View key={j} style={s.tocSubEntry}>
                  <Text style={[s.tocSubNum, { color }]}>
                    {i + 1}.{j + 1}
                  </Text>
                  <Text style={[s.tocSubLabel, { color }]}>{sub.heading}</Text>
                </View>
              ))}
            </View>
          );
        })}
        <Footer />
      </Page>

      {/* Content pages — one page-break per section */}
      {SECTIONS.map((sec, si) => {
        const accent = SECTION_COLORS[si % SECTION_COLORS.length];
        return (
          <Page key={si} size="A4" style={s.page} wrap bookmark={`${si + 1}. ${sec.title}`}>
            {/* Invisible element to capture page number for TOC */}
            <Text
              style={{ position: "absolute", fontSize: 0 }}
              render={({ pageNumber }) => {
                sectionPageMap[si] = pageNumber;
                return "";
              }}
            />
            <Text style={[s.sectionTitle, { color: accent }]}>
              {si + 1}. {sec.title}
            </Text>
            <Text style={s.sectionLead}>{sec.lead}</Text>
            {sec.subsections.map((sub, subi) => (
              <View key={subi}>
                <Text style={s.subHeading} minPresenceAhead={40}>
                  {si + 1}.{subi + 1} {sub.heading}
                </Text>
                {sub.blocks.map((block, bi) => (
                  <RenderBlock key={bi} block={block} color={accent} />
                ))}
              </View>
            ))}
            <Footer />
          </Page>
        );
      })}
    </Document>
  );
}

// ── Generate ──
async function main() {
  const outPath = new URL("../../public/curyo-whitepaper.pdf", import.meta.url).pathname;
  console.log("Generating whitepaper PDF...");

  // Pass 1: render to stream to collect section page numbers via render callbacks
  console.log("  Pass 1: collecting page numbers...");
  const stream = await renderToStream(<WhitepaperDocument />);
  // Drain the stream to ensure all render callbacks have fired
  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
    stream.resume();
  });
  const collectedPages = { ...sectionPageMap };
  console.log("  Page numbers:", collectedPages);

  // Pass 2: render to file with TOC page numbers filled in
  console.log("  Pass 2: rendering final PDF...");
  await renderToFile(<WhitepaperDocument tocPageNumbers={collectedPages} />, outPath);
  console.log(`Done! Saved to ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
