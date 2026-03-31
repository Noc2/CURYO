export type TableData = { headers: string[]; rows: string[][] };

export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "sub_heading"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "ordered"; items: string[] }
  | { type: "table"; data: TableData }
  | { type: "formula"; latex: string };

export interface Subsection {
  heading: string;
  blocks: ContentBlock[];
}

export interface Section {
  title: string;
  lead: string;
  subsections: Subsection[];
}
