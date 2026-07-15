// Markdown ingestion for the ChowBot document pipeline (server/utils/chowbot-media.ts).
// Turns raw Markdown bytes into a structured, LLM-groundable representation
// without stripping the structural cues (headings, lists, tables, links,
// blockquotes, fenced code) down to flat prose. Kept as its own module so the
// parsing/validation logic can be unit tested without touching the AI
// gateway or D1.

export const MARKDOWN_MIME_TYPES = new Set(["text/markdown", "text/x-markdown"]);
export const MARKDOWN_EXTENSIONS = [".md", ".markdown"] as const;

/** 5 MB of Markdown source text is generous for a real document without risking
 *  pathological AI-gateway payloads; oversized files must fail with a clear error
 *  rather than being silently truncated. */
export const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;

export class MarkdownDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkdownDocumentError";
  }
}

export function isMarkdownFilename(filename?: string | null): boolean {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Resolves whether an uploaded file should be treated as Markdown, matching
 * on either a declared/sniffed MIME type or the filename extension — WhatsApp
 * and generic multipart uploads frequently report a generic or missing MIME
 * type for plain-text files, so extension is an equally valid signal here.
 */
export function resolveMarkdownMimeType(mimeType: string | undefined | null, filename?: string | null): string | null {
  if (mimeType && MARKDOWN_MIME_TYPES.has(mimeType.toLowerCase())) return "text/markdown";
  if (isMarkdownFilename(filename)) return "text/markdown";
  return null;
}

export function assertMarkdownSize(byteLength: number): void {
  if (byteLength > MAX_MARKDOWN_BYTES) {
    throw new MarkdownDocumentError(
      `Markdown file too large (${byteLength} bytes; max ${MAX_MARKDOWN_BYTES} bytes / ${Math.floor(MAX_MARKDOWN_BYTES / (1024 * 1024))} MB).`
    );
  }
}

/** Strictly decodes UTF-8, throwing a clear error instead of silently
 *  replacing invalid byte sequences with U+FFFD (which would corrupt the
 *  document without any visible signal). */
export function decodeMarkdownText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new MarkdownDocumentError("Could not read Markdown file: content is not valid UTF-8 text.");
  }
}

export type MarkdownBlockType =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "blockquote"
  | "code"
  | "thematic_break";

export interface MarkdownBlock {
  type: MarkdownBlockType;
  /** Raw source text for the block, unmodified. */
  raw: string;
  /** 1-6 for headings, undefined otherwise. */
  level?: number;
  /** Fenced code language, e.g. "js" — undefined if unspecified. */
  language?: string;
}

export interface MarkdownLink {
  text: string;
  url: string;
}

export interface MarkdownDocumentStats {
  headings: number;
  listItems: number;
  tableRows: number;
  codeBlocks: number;
  blockquotes: number;
  links: number;
}

export interface ParsedMarkdownDocument {
  blocks: MarkdownBlock[];
  /** Heading text in document order, for a quick table-of-contents. */
  headingOutline: Array<{ level: number; text: string }>;
  links: MarkdownLink[];
  stats: MarkdownDocumentStats;
  /** Block-tagged text handed to the LLM — preserves structural cues instead
   *  of collapsing everything to plain prose. */
  structuredText: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^(```|~~~)\s*([^\s`~]*)\s*$/;
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const BLOCKQUOTE_RE = /^\s*>/;
const THEMATIC_BREAK_RE = /^\s*([-*_])\s*(?:\1\s*){2,}$/;
const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function extractLinksFromText(text: string, sink: MarkdownLink[]): void {
  for (const match of text.matchAll(LINK_RE)) {
    const linkText = match[1] ?? "";
    const url = match[2] ?? "";
    if (url) sink.push({ text: linkText, url });
  }
}

/**
 * Parses Markdown into typed blocks and a structured-text representation
 * suitable for grounding LLM analysis. This is intentionally not a full
 * CommonMark parser — it is a line-oriented segmenter that preserves the
 * distinctions the ChowBot analysis pipeline actually needs (headings,
 * lists, tables, links, blockquotes, fenced code) without pulling in a
 * Markdown rendering dependency.
 */
export function parseMarkdownDocument(text: string): ParsedMarkdownDocument {
  const lines = text.split(/\r\n|\r|\n/);
  const blocks: MarkdownBlock[] = [];
  const headingOutline: Array<{ level: number; text: string }> = [];
  const links: MarkdownLink[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const fence = fenceMatch[1]!;
      const language = fenceMatch[2] || undefined;
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trimEnd().startsWith(fence)) {
        codeLines.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // skip closing fence (or EOF if unterminated)
      blocks.push({ type: "code", raw: codeLines.join("\n"), language });
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const headingText = headingMatch[2]!.trim();
      blocks.push({ type: "heading", raw: headingText, level });
      headingOutline.push({ level, text: headingText });
      extractLinksFromText(headingText, links);
      i += 1;
      continue;
    }

    if (THEMATIC_BREAK_RE.test(line)) {
      blocks.push({ type: "thematic_break", raw: line.trim() });
      i += 1;
      continue;
    }

    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1] ?? "")) {
      const tableLines = [line];
      i += 2; // header + separator
      while (i < lines.length && TABLE_ROW_RE.test(lines[i] ?? "")) {
        tableLines.push(lines[i]!);
        i += 1;
      }
      const raw = tableLines.join("\n");
      blocks.push({ type: "table", raw });
      extractLinksFromText(raw, links);
      continue;
    }

    if (BLOCKQUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && (BLOCKQUOTE_RE.test(lines[i] ?? "") || (lines[i] ?? "").trim() !== "")) {
        if (!BLOCKQUOTE_RE.test(lines[i] ?? "")) break;
        quoteLines.push(lines[i]!);
        i += 1;
      }
      const raw = quoteLines.join("\n");
      blocks.push({ type: "blockquote", raw });
      extractLinksFromText(raw, links);
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      const listLines: string[] = [];
      while (i < lines.length && ((lines[i] ?? "").trim() === "" ? false : true) && (LIST_ITEM_RE.test(lines[i] ?? "") || /^\s+\S/.test(lines[i] ?? ""))) {
        listLines.push(lines[i]!);
        i += 1;
      }
      const raw = listLines.join("\n");
      blocks.push({ type: "list", raw });
      extractLinksFromText(raw, links);
      continue;
    }

    // Paragraph: accumulate until a blank line or the start of another block type.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !HEADING_RE.test(lines[i] ?? "") &&
      !FENCE_RE.test(lines[i] ?? "") &&
      !LIST_ITEM_RE.test(lines[i] ?? "") &&
      !BLOCKQUOTE_RE.test(lines[i] ?? "") &&
      !(TABLE_ROW_RE.test(lines[i] ?? "") && TABLE_SEPARATOR_RE.test(lines[i + 1] ?? ""))
    ) {
      paraLines.push(lines[i]!);
      i += 1;
    }
    const raw = paraLines.join("\n");
    blocks.push({ type: "paragraph", raw });
    extractLinksFromText(raw, links);
  }

  const stats: MarkdownDocumentStats = {
    headings: blocks.filter((b) => b.type === "heading").length,
    listItems: blocks
      .filter((b) => b.type === "list")
      .reduce((sum, b) => sum + b.raw.split("\n").filter((l) => LIST_ITEM_RE.test(l)).length, 0),
    tableRows: blocks
      .filter((b) => b.type === "table")
      .reduce((sum, b) => sum + b.raw.split("\n").filter((l) => l.trim() !== "").length - 1, 0), // minus separator row
    codeBlocks: blocks.filter((b) => b.type === "code").length,
    blockquotes: blocks.filter((b) => b.type === "blockquote").length,
    links: links.length,
  };

  const structuredText = blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `[HEADING level=${block.level}] ${block.raw}`;
        case "code":
          return `[CODE${block.language ? ` lang=${block.language}` : ""}]\n${block.raw}\n[/CODE]`;
        case "table":
          return `[TABLE]\n${block.raw}\n[/TABLE]`;
        case "blockquote":
          return `[BLOCKQUOTE]\n${block.raw}\n[/BLOCKQUOTE]`;
        case "list":
          return `[LIST]\n${block.raw}\n[/LIST]`;
        case "thematic_break":
          return "[BREAK]";
        default:
          return block.raw;
      }
    })
    .join("\n\n");

  return { blocks, headingOutline, links, stats, structuredText };
}
