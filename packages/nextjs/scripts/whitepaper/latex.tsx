/**
 * LaTeX → react-pdf SVG renderer.
 * Uses MathJax to convert LaTeX strings to SVG, then parses the SVG
 * and maps elements to @react-pdf/renderer Svg components.
 */
import React from "react";
import { G, Path, Rect, Svg, Text as SvgText } from "@react-pdf/renderer";
import { DOMParser } from "@xmldom/xmldom";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";

// ── MathJax initialisation (runs once) ──
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: "none" }); // inline all glyphs for simpler SVG
const mjDocument = mathjax.document("", { InputJax: tex, OutputJax: svg });

// Scale: MathJax dimensions are in `ex` units. ~6pt per ex for readable formulas.
const EX_TO_PT = 6;

// ── Types ──
interface DefsMap {
  [id: string]: string;
}

// ── Collect <path> definitions from <defs> (recursive) ──
function collectDefs(node: Element): DefsMap {
  const map: DefsMap = {};
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i] as Element;
    if (!child.nodeName) continue;
    if (child.nodeName === "path" && child.getAttribute?.("id")) {
      map[child.getAttribute("id")!] = child.getAttribute("d") || "";
    }
    // Recurse into nested groups
    if (child.childNodes?.length) {
      Object.assign(map, collectDefs(child));
    }
  }
  return map;
}

// ── Recursively map SVG DOM nodes → react-pdf elements ──
function mapNode(node: Element, defs: DefsMap, fill: string, key: number): React.ReactElement | null {
  const tag = node.nodeName?.toLowerCase();
  if (!tag || node.nodeType !== 1) return null;

  switch (tag) {
    case "g": {
      const transform = node.getAttribute("transform") || undefined;
      const gFill = node.getAttribute("fill") || fill;
      const children: React.ReactElement[] = [];
      for (let i = 0; i < node.childNodes.length; i++) {
        const mapped = mapNode(node.childNodes[i] as Element, defs, gFill, i);
        if (mapped) children.push(mapped);
      }
      if (children.length === 0) return null;
      return (
        <G key={key} transform={transform}>
          {children}
        </G>
      );
    }

    case "path": {
      const d = node.getAttribute("d");
      if (!d) return null;
      const pathFill = node.getAttribute("fill") || fill;
      const resolvedFill = pathFill === "currentColor" ? fill : pathFill;
      const transform = node.getAttribute("transform") || undefined;
      if (transform) {
        return (
          <G key={key} transform={transform}>
            <Path d={d} fill={resolvedFill} />
          </G>
        );
      }
      return <Path key={key} d={d} fill={resolvedFill} />;
    }

    case "rect": {
      const rectFill = node.getAttribute("fill") || fill;
      const resolvedFill = rectFill === "currentColor" ? fill : rectFill;
      return (
        <Rect
          key={key}
          x={node.getAttribute("x") || "0"}
          y={node.getAttribute("y") || "0"}
          width={node.getAttribute("width") || "0"}
          height={node.getAttribute("height") || "0"}
          fill={resolvedFill}
        />
      );
    }

    case "use": {
      const href = node.getAttribute("xlink:href") || node.getAttribute("href") || "";
      const id = href.replace("#", "");
      const d = defs[id];
      if (!d) return null;

      const transform = node.getAttribute("transform") || undefined;
      const useFill = node.getAttribute("fill") || fill;
      const resolvedFill = useFill === "currentColor" ? fill : useFill;

      if (transform) {
        return (
          <G key={key} transform={transform}>
            <Path d={d} fill={resolvedFill} />
          </G>
        );
      }
      return <Path key={key} d={d} fill={resolvedFill} />;
    }

    case "text": {
      const x = node.getAttribute("x") || undefined;
      const y = node.getAttribute("y") || undefined;
      const textFill = node.getAttribute("fill") || fill;
      const resolvedFill = textFill === "currentColor" ? fill : textFill;
      const transform = node.getAttribute("transform") || undefined;

      // Collect text content from child nodes (may include <tspan> children)
      const textContent: string[] = [];
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        if (child.nodeType === 3) {
          textContent.push(child.nodeValue || "");
        } else if (child.nodeName?.toLowerCase() === "tspan") {
          textContent.push(child.textContent || "");
        }
      }

      if (textContent.join("").trim() === "") return null;

      const wrapper = (
        <SvgText key={key} x={x} y={y} fill={resolvedFill}>
          {textContent.join("")}
        </SvgText>
      );
      if (transform) {
        return (
          <G key={key} transform={transform}>
            {wrapper}
          </G>
        );
      }
      return wrapper;
    }

    case "defs":
      return null; // handled separately

    default:
      if (tag !== "title" && tag !== "desc") {
        console.warn(`[latex] Unhandled SVG element: <${tag}>`);
      }
      return null;
  }
}

// ── Public API ──
export interface RenderedFormula {
  element: React.ReactElement;
  width: number;
  height: number;
}

/**
 * Render a LaTeX string to a react-pdf `<Svg>` element.
 * @param latex  - LaTeX math string (e.g. "E = mc^2")
 * @param color  - fill colour for glyphs (default "#1a1a2e")
 * @param scale  - extra scale multiplier (default 1)
 */
export function renderLatex(latex: string, color = "#1a1a2e", scale = 1): RenderedFormula {
  const node = mjDocument.convert(latex, { display: true });
  const svgString = adaptor.innerHTML(node);

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<root>${svgString}</root>`, "text/xml");
  const svgEls = doc.getElementsByTagName("svg");
  const svgEl = svgEls[0];

  if (!svgEl) {
    throw new Error(`MathJax failed to produce SVG for: ${latex}`);
  }

  // Dimensions
  const viewBox = svgEl.getAttribute("viewBox") || "0 0 1000 1000";
  const widthStr = svgEl.getAttribute("width") || "10ex";
  const heightStr = svgEl.getAttribute("height") || "2ex";

  const width = parseFloat(widthStr) * EX_TO_PT * scale;
  const height = parseFloat(heightStr) * EX_TO_PT * scale;

  // Collect <defs>
  let defs: DefsMap = {};
  const defsNodes = svgEl.getElementsByTagName("defs");
  for (let i = 0; i < defsNodes.length; i++) {
    defs = { ...defs, ...collectDefs(defsNodes[i]) };
  }

  // Map children
  const resolvedColor = color === "currentColor" ? "#1a1a2e" : color;
  const children: React.ReactElement[] = [];
  for (let i = 0; i < svgEl.childNodes.length; i++) {
    const mapped = mapNode(svgEl.childNodes[i] as Element, defs, resolvedColor, i);
    if (mapped) children.push(mapped);
  }

  return {
    element: (
      <Svg viewBox={viewBox} width={width} height={height} style={{ width, height }}>
        {children}
      </Svg>
    ),
    width,
    height,
  };
}
