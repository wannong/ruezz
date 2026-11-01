/**
 * A deliberately small HTML reader for the inline fragments this app writes back
 * into Markdown (color/size spans, underline, sup/sub, marks). Full HTML is never
 * parsed here: anything unrecognised is handed back as raw text so note content
 * can not be lost or reordered.
 */

export type InlineStyle = {
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  textAlign?: string;
};

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "br" }
  | { type: "open"; tag: string; style: InlineStyle; attrs: Record<string, string> }
  | { type: "close"; tag: string };

const VOID_TAGS = new Set(["br", "wbr", "img", "hr", "input"]);
const STYLE_PROPS = new Set(["color", "background-color", "font-size", "text-align", "text-decoration", "vertical-align"]);

/** Tags we understand well enough to rebuild editor marks from. */
export const KNOWN_INLINE_TAGS = new Set([
  "span",
  "u",
  "mark",
  "sup",
  "sub",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "del",
  "strike",
  "code",
  "font",
]);

function round(value: string): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return String(Math.round(num * 100) / 100);
}

/** Convert pt/em/% sizes to px so the editor only ever deals with one unit. */
export function normalizeFontSize(raw: string): string | undefined {
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  const px = value.match(/^([\d.]+)\s*px$/);
  if (px) return `${round(px[1])}px`;
  const pt = value.match(/^([\d.]+)\s*pt$/);
  if (pt) return `${round(String(Number(pt[1]) * (96 / 72)))}px`;
  const rel = value.match(/^([\d.]+)\s*(?:em|rem)$/);
  if (rel) return `${round(String(Number(rel[1]) * 16))}px`;
  const pct = value.match(/^([\d.]+)%$/);
  if (pct) return `${round(String((Number(pct[1]) / 100) * 16))}px`;
  const named: Record<string, string> = {
    "xx-small": "9px",
    "x-small": "10px",
    small: "13px",
    medium: "16px",
    large: "19px",
    "x-large": "24px",
    "xx-large": "32px",
  };
  return named[value];
}

function normalizeColor(raw: string): string | undefined {
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "transparent" || value === "inherit" || value === "initial" || value === "none") return undefined;
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) return `#${hex[1]}`;
  const rgb = value.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (rgb) {
    const hexPart = (n: string) => Number(n).toString(16).padStart(2, "0");
    return `#${hexPart(rgb[1])}${hexPart(rgb[2])}${hexPart(rgb[3])}`;
  }
  if (/^[a-z]+$/.test(value)) return value;
  return undefined;
}

function parseStyle(attr: string): InlineStyle {
  const style: InlineStyle = {};
  for (const declaration of attr.split(";")) {
    const [rawProp, ...rest] = declaration.split(":");
    if (rest.length === 0) continue;
    const prop = rawProp.trim().toLowerCase();
    if (!STYLE_PROPS.has(prop)) continue;
    const value = rest.join(":").trim();
    if (!value) continue;
    if (prop === "color") style.color = normalizeColor(value) ?? style.color;
    else if (prop === "background-color") style.backgroundColor = normalizeColor(value) ?? style.backgroundColor;
    else if (prop === "font-size") style.fontSize = normalizeFontSize(value) ?? style.fontSize;
  }
  return style;
}

export function parseAlign(value: string | undefined): "left" | "center" | "right" | "justify" | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "left" || normalized === "center" || normalized === "right" || normalized === "justify") {
    return normalized;
  }
  return undefined;
}

/** Extract only the attributes we render, ignoring Word's dozens of others. */
export function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match = pattern.exec(source);
  while (match) {
    attrs[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? "";
    match = pattern.exec(source);
  }
  return attrs;
}

export function styleFromTag(tag: string, attrs: Record<string, string>): InlineStyle {
  const style = parseStyle(attrs.style ?? "");
  if (tag === "font" && attrs.color) style.color = normalizeColor(attrs.color) ?? style.color;
  return style;
}

export function hasStyle(style: InlineStyle): boolean {
  return Boolean(style.color || style.backgroundColor || style.fontSize || style.textAlign);
}

/**
 * Tokenize an inline HTML fragment into text runs plus the tags they carry.
 *
 * micromark splits inline HTML per tag (`<span>`, text, `</span>`), so by default
 * tags are left unbalanced for the caller to track. Pass `autoClose` when the
 * fragment is known to be a self-contained snippet.
 */
export function tokenizeInlineHtml(html: string, autoClose = false): InlineToken[] {
  const tokens: InlineToken[] = [];
  const openTags: string[] = [];
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)([^>]*?)(\/?)>/g;
  let cursor = 0;
  let match = tagPattern.exec(html);
  while (match) {
    if (match.index > cursor) tokens.push({ type: "text", value: html.slice(cursor, match.index) });
    const tag = match[1].toLowerCase();
    const closing = match[0].startsWith("</");
    const selfClosing = match[3] === "/" || VOID_TAGS.has(tag);

    if (tag === "br") {
      tokens.push({ type: "br" });
    } else if (closing) {
      // mdast hands us open/close tags as separate html nodes, so a closing tag
      // often arrives with nothing open in this fragment. Emit the close and let
      // the caller's own stack decide whether it applies.
      const index = openTags.lastIndexOf(tag);
      if (index >= 0) openTags.splice(index, 1);
      if (KNOWN_INLINE_TAGS.has(tag) || index >= 0) tokens.push({ type: "close", tag });
      else tokens.push({ type: "text", value: match[0] });
    } else if (KNOWN_INLINE_TAGS.has(tag)) {
      {
        const attrs = parseAttributes(match[2]);
        tokens.push({ type: "open", tag, style: styleFromTag(tag, attrs), attrs });
      }
      if (!selfClosing) openTags.push(tag);
    } else {
      tokens.push({ type: "text", value: match[0] });
    }

    cursor = match.index + match[0].length;
    match = tagPattern.exec(html);
  }
  if (cursor < html.length) tokens.push({ type: "text", value: html.slice(cursor) });
  if (autoClose) for (const tag of openTags.reverse()) tokens.push({ type: "close", tag });
  return tokens;
}

const ESCAPES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return ESCAPES[body.toLowerCase()] ?? full;
  });
}

export function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
