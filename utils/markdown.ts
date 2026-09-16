import { marked } from "marked";

// marked's text renderer HTML-escapes apostrophes/quotes (e.g. "you're"
// becomes "you&#39;re"). Stripping non-alphanumeric chars without decoding
// entities first leaves the digits behind as literal text (e.g. "you39re"),
// so this must run before the alphanumeric strip below.
export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

// Slugifies h2/h3 text so DocsToc.vue can build "on this page" anchors that
// always match the rendered article body — both read from this one renderer.
// Reset per renderMarkdownToHtml() call so duplicate headings across separate
// renders (e.g. FAQ/How-To sections) don't bleed into each other's numbering.
let headingSlugCounts = new Map<string, number>();

function slugifyHeading(text: string) {
  const base = decodeHtmlEntities(text.replace(/<[^>]+>/g, ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const count = headingSlugCounts.get(base) ?? 0;
  headingSlugCounts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      if (depth !== 2 && depth !== 3) {
        return `<h${depth}>${text}</h${depth}>\n`;
      }
      return `<h${depth} id="${slugifyHeading(text)}">${text}</h${depth}>\n`;
    },
  },
});

export function renderMarkdownToHtml(markdown: string) {
  headingSlugCounts = new Map();
  return marked.parse(markdown, { gfm: true, breaks: true }) as string;
}

// Doc/blog pages render `title` from the DB as their own <h1>, so a body
// that also opens with "# <same title>" (a common authoring habit carried
// over from standalone markdown files) would repeat it a second time as a
// prose heading. Strip only an exact, case-insensitive match on the very
// first line — a body that opens with a different, more specific H1 is left
// alone since that's real content, not a duplicate.
export function stripLeadingTitleHeading(
  markdown: string,
  title: string | null | undefined,
) {
  if (!title?.trim()) return markdown;
  const normalizedTitle = title.trim().toLowerCase();
  return markdown.replace(
    /^\s*#\s+([^\n]+)\n*/,
    (match, headingText: string) => {
      return headingText.trim().toLowerCase() === normalizedTitle ? "" : match;
    },
  );
}

export function htmlToPlainText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function markdownToPlainText(markdown: string) {
  return htmlToPlainText(renderMarkdownToHtml(markdown || ""));
}

// Decodes named/numeric HTML entities so an attacker can't smuggle a dangerous
// protocol past the literal-string checks below (e.g. `&#106;avascript:` or
// `&#x6a;avascript:`). Limited to entities relevant to protocol obfuscation —
// not a general-purpose entity decoder.
function decodeEntitiesForProtocolCheck(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/gi, "&");
}

// DOMPurify needs jsdom, which breaks on the Workers SSR runtime (no real DOM
// globals). This is a regex-based stopgap for the SSR render pass only — it
// strips the dangerous constructs (script/style/embeds, event handlers,
// javascript: URLs) that marked's own output never produces from trusted
// markdown anyway. The client re-renders through real DOMPurify on hydration.
export function sanitizeHtmlForSsr(html: string) {
  return (
    html
      // Paired tags: remove the opening tag, body, and closing tag together.
      // (A lazy `[\s\S]*?` followed by an alternation that could also match the
      // opening tag's own `>` let the engine take the *shorter* alternative —
      // i.e. match just `<script>` — leaving the body and `</script>` behind.
      // Anchoring strictly on the matching closing tag avoids that.)
      .replace(
        /<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi,
        "",
      )
      // Void/self-closing tags with no required closing tag (link, meta), plus
      // any leftover unclosed instance of the paired tags above.
      .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
      .replace(/\son\w+\s*=\s*("[\s\S]*?"|'[\s\S]*?'|[^\s>]+)/gi, "")
      .replace(
        /(href|src)\s*=\s*(?:"([\s\S]*?)"|'([\s\S]*?)'|([^\s>]+))/gi,
        (match, attr, dq, sq, unquoted) => {
          const quote = dq !== undefined ? '"' : sq !== undefined ? "'" : "";
          const value = dq ?? sq ?? unquoted ?? "";
          // Strip control/whitespace chars (the WHATWG URL parser ignores them
          // anywhere in a scheme too, e.g. `java\tscript:`), then decode entities,
          // before checking the protocol -- both are common obfuscation vectors.
          const normalized = decodeEntitiesForProtocolCheck(value)
            // eslint-disable-next-line no-control-regex -- intentionally stripping control chars used to obfuscate protocols
            .replace(/[\u0000-\u001f\u007f\s]+/g, "")
            .toLowerCase();
          if (/^(javascript|data|vbscript|file):/i.test(normalized)) {
            return quote ? `${attr}=${quote}#${quote}` : `${attr}=#`;
          }
          return match;
        },
      )
  );
}
