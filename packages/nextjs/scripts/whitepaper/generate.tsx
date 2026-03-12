/**
 * Whitepaper PDF generator.
 * Run: yarn whitepaper  (or:  npx tsx scripts/whitepaper/generate.tsx)
 * Outputs: public/curyo-whitepaper.pdf
 */
import React from "react";
import { ContentBlock, EXECUTIVE_SUMMARY, META, SECTIONS, TableData } from "./content";
import { renderLatex } from "./latex";
import { Document, Image, Page, StyleSheet, Text, View, renderToFile, renderToStream } from "@react-pdf/renderer";

// ── Brand colors ──
const BLUE = "#359EEE";
const YELLOW = "#FFC43D";
const PINK = "#EF476F";
const CYAN = "#03CEA4";
const COLORS = [BLUE, YELLOW, PINK, CYAN];
const DARK = "#1a1a2e";
const GRAY = "#555";
const LIGHT_BG = "#f5f5f5";
// Darkened yellow for text readability on white paper
const YELLOW_TEXT = "#D4A017";
// Per-section accent colors (cycles through brand palette)
const SECTION_COLORS = [BLUE, CYAN, PINK, YELLOW_TEXT, BLUE, CYAN, PINK];

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
  tocNum: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BLUE, width: 20 },
  tocLabel: { fontSize: 11, color: DARK, flex: 1 },
  tocSubEntry: {
    flexDirection: "row" as const,
    paddingVertical: 2,
    paddingLeft: 20,
  },
  tocSubNum: { fontSize: 9, fontFamily: "Helvetica-Bold", width: 28 },
  tocSubLabel: { fontSize: 9, flex: 1 },
  // Section
  sectionTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: BLUE, marginBottom: 14 },
  sectionLead: { fontSize: 11, color: GRAY, marginBottom: 8 },
  subHeading: { fontSize: 14, fontFamily: "Helvetica-Bold", color: DARK, marginTop: 16, marginBottom: 6 },
  subSubHeading: { fontSize: 11, fontFamily: "Helvetica-Bold", color: DARK, marginTop: 10, marginBottom: 4 },
  paragraph: { marginBottom: 8 },
  bulletRow: { flexDirection: "row", marginBottom: 4, paddingLeft: 8 },
  orderedRow: { flexDirection: "row", marginBottom: 6, paddingLeft: 8 },
  bulletDot: { width: 12, color: BLUE, fontFamily: "Helvetica-Bold" },
  bulletText: { flex: 1 },
  orderedNum: { width: 18, color: BLUE, fontFamily: "Helvetica-Bold" },
  // Table
  table: { marginVertical: 8, borderWidth: 0.5, borderColor: "#d0d0d0" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: BLUE },
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

const coverLogoPath = new URL("../../public/logo.png", import.meta.url).pathname;

function CoverCircle() {
  return <Image src={coverLogoPath} style={{ width: 280, height: 280 }} />;
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
          <CoverCircle />
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
          <RenderBlock key={i} block={block} color={BLUE} />
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
