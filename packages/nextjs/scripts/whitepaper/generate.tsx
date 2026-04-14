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
  ClipPath,
  Defs,
  Document,
  Ellipse,
  G,
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

const COVER_LOGO_CENTER = 700;
const COVER_LOGO_FLARE_RADIUS = 652;

function coverLogoPolarPoint(radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;

  return {
    x: COVER_LOGO_CENTER + radius * Math.cos(radians),
    y: COVER_LOGO_CENTER + radius * Math.sin(radians),
  };
}

function describeCoverLogoArcPath(startDegrees: number, sweepDegrees: number) {
  const clampedSweep = Math.max(0, Math.min(sweepDegrees, 359.9));
  const startPoint = coverLogoPolarPoint(COVER_LOGO_FLARE_RADIUS, startDegrees);
  const endPoint = coverLogoPolarPoint(COVER_LOGO_FLARE_RADIUS, startDegrees + clampedSweep);
  const largeArcFlag = clampedSweep > 180 ? 1 : 0;

  return [
    `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)}`,
    `A ${COVER_LOGO_FLARE_RADIUS.toFixed(2)} ${COVER_LOGO_FLARE_RADIUS.toFixed(2)} 0 ${largeArcFlag} 1 ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`,
  ].join(" ");
}

const coverLogoFlareSegments = [
  { start: -94, sweep: 26, stroke: "#F45C4D" },
  { start: -70, sweep: 28, stroke: "#FF7254" },
  { start: -44, sweep: 30, stroke: "#FF8A5D" },
  { start: -16, sweep: 27, stroke: "#FFC37A" },
  { start: 9, sweep: 19, stroke: "#FFE1A7" },
];

const coverLogoFlareCoreSegments = [
  { start: -88, sweep: 42, stroke: "#FF9E78" },
  { start: -48, sweep: 46, stroke: "#FFF0CF" },
  { start: -4, sweep: 25, stroke: "#FFF8ED" },
];

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
  coverDeck: { fontSize: 12, color: GRAY, marginTop: 12, textAlign: "center" },
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
    <Svg viewBox="0 0 1400 1400" style={{ width: 280, height: 280 }}>
      <Defs>
        <RadialGradient id="cover-orb-base" cx={856} cy={450} r={720} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor="#FFF8F2" />
          <Stop offset={0.18} stopColor="#F8E1D0" />
          <Stop offset={0.34} stopColor="#F7B070" />
          <Stop offset={0.56} stopColor="#F26426" />
          <Stop offset={0.78} stopColor="#B23C3B" />
          <Stop offset={1} stopColor="#6A345F" />
        </RadialGradient>
        <RadialGradient id="cover-orb-rim" cx={438} cy={516} r={540} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor="#AFC5D7" stopOpacity={0.82} />
          <Stop offset={0.22} stopColor="#7E8996" stopOpacity={0.34} />
          <Stop offset={1} stopColor="#7E8996" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="cover-soft-white" cx={710} cy={520} r={330} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor="#FFF8F3" stopOpacity={0.74} />
          <Stop offset={0.52} stopColor="#FFF8F3" stopOpacity={0.2} />
          <Stop offset={1} stopColor="#FFF8F3" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="cover-coral-bloom" cx={930} cy={612} r={270} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor="#FFD77E" stopOpacity={0.82} />
          <Stop offset={1} stopColor="#FFD77E" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="cover-violet-pocket" cx={500} cy={866} r={334} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor="#6B37A5" stopOpacity={0.54} />
          <Stop offset={1} stopColor="#6B37A5" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="cover-blue-pocket" cx={620} cy={760} r={320} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor="#8C4A53" stopOpacity={0.36} />
          <Stop offset={0.58} stopColor="#C46A4A" stopOpacity={0.22} />
          <Stop offset={1} stopColor="#C46A4A" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="cover-fold-sheen" x1="290" y1="820" x2="1036" y2="650" gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor="#FFF7F0" stopOpacity={0} />
          <Stop offset={0.3} stopColor="#FFF7F0" stopOpacity={0.08} />
          <Stop offset={0.56} stopColor="#FFF7F0" stopOpacity={0.34} />
          <Stop offset={0.82} stopColor="#FFD7B2" stopOpacity={0.18} />
          <Stop offset={1} stopColor="#FFD7B2" stopOpacity={0} />
        </LinearGradient>
        <ClipPath id="cover-orb-clip">
          <Circle cx={700} cy={700} r={360} />
        </ClipPath>
      </Defs>

      <Circle cx={700} cy={700} r={652} stroke="#FFFFFF" strokeOpacity={0.06} strokeWidth={2.2} />
      <Path
        d={describeCoverLogoArcPath(-94, 122)}
        stroke="#6D352A"
        strokeOpacity={0.42}
        strokeWidth={34}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coverLogoFlareSegments.map(segment => (
        <Path
          key={`${segment.start}-${segment.sweep}`}
          d={describeCoverLogoArcPath(segment.start, segment.sweep)}
          stroke={segment.stroke}
          strokeWidth={28}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {coverLogoFlareCoreSegments.map(segment => (
        <Path
          key={`${segment.start}-${segment.sweep}-core`}
          d={describeCoverLogoArcPath(segment.start, segment.sweep)}
          stroke={segment.stroke}
          strokeOpacity={0.96}
          strokeWidth={10.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      <G transform="translate(700 700) scale(1.24) translate(-700 -700)">
        <Circle cx={700} cy={700} r={360} fill="url(#cover-orb-base)" />
        <Circle cx={700} cy={700} r={360} fill="url(#cover-orb-rim)" />
        <G clipPath="url(#cover-orb-clip)">
          <Ellipse cx={672} cy={538} rx={280} ry={184} fill="url(#cover-soft-white)" fillOpacity={0.62} />
          <Ellipse cx={930} cy={640} rx={246} ry={214} fill="url(#cover-coral-bloom)" fillOpacity={0.5} />
          <Ellipse cx={508} cy={904} rx={286} ry={218} fill="url(#cover-violet-pocket)" fillOpacity={0.52} />
          <Ellipse cx={662} cy={774} rx={316} ry={176} fill="url(#cover-blue-pocket)" fillOpacity={0.42} />
          <Path
            d="M330 822C464 734 582 684 704 670C810 658 902 686 1018 760C944 812 868 844 788 858C680 876 560 868 442 840C404 832 368 826 330 822Z"
            fill="url(#cover-fold-sheen)"
            fillOpacity={0.72}
          />
          <Path
            d="M350 838C466 760 574 724 694 714C808 704 906 726 1012 776C932 814 852 838 766 848C642 864 520 858 402 840C384 838 366 838 350 838Z"
            fill="#F5E3D2"
            fillOpacity={0.11}
          />
          <Path
            d="M404 542C518 494 634 492 752 530C842 560 938 626 1038 724"
            stroke="#FFF7F1"
            strokeOpacity={0.16}
            strokeWidth={22}
            strokeLinecap="round"
          />
          <Path
            d="M344 930C456 908 574 916 706 956C820 990 910 1040 988 1110"
            stroke="#E2B2A0"
            strokeOpacity={0.1}
            strokeWidth={24}
            strokeLinecap="round"
          />
          <Circle cx={1118} cy={490} r={50} fill="#FFF9F2" fillOpacity={0.9} />
          <Circle cx={664} cy={556} r={190} fill="url(#cover-soft-white)" />
        </G>

        <Circle cx={700} cy={700} r={360} fill="none" stroke="#FFF8F2" strokeOpacity={0.14} strokeWidth={2} />
      </G>
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
    <Document title="Curyo Whitepaper" author={META.author} subject={`${META.subtitle} — ${META.deck}`}>
      {/* Cover page */}
      <Page size="A4" style={[s.page, { paddingTop: 0, paddingBottom: 0 }]}>
        <View style={s.cover}>
          <CoverLogo />
          <Text style={s.coverTitle}>{META.title}</Text>
          <Text style={s.coverSubtitle}>{META.subtitle}</Text>
          <Text style={s.coverDeck}>{META.deck}</Text>
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
