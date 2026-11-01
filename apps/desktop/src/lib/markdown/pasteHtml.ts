/**
 * Word and browser clipboard HTML is enormous and mostly noise: MSO styles,
 * conditional comments, `mso-*` properties, wrapper divs, empty paragraphs and
 * font tags. This module reduces it to the structure and inline styling the
 * editor can actually express, while leaving ordinary web HTML alone.
 */

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "blockquote",
  "pre",
  "hr",
  "br",
  "section",
  "article",
  "figure",
  "figcaption",
]);

/** Inline properties we keep; everything else is styling noise. */
const KEPT_STYLE_PROPS = [
  "color",
  "background",
  "background-color",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration",
  "vertical-align",
  "text-align",
];

import { normalizeFontSize } from "./inlineHtml.ts";

export type PasteCleanupOptions = {
  /** Convert absolute pt sizes into px (Word always uses pt). */
  normalizeSizes?: boolean;
  /** Drop bold/italic styling because `<b>`/`<i>` already express it. */
  stripRedundantWeight?: boolean;
  /**
   * Drop the body font size Word repeats on every run. Without this, pasting a
   * Word document stamps an identical `font-size` span onto nearly every word.
   */
  stripBodyFontSize?: boolean;
};

/** Word's default body size (10.5pt / 14px) carries no information per run. */
const WORD_BODY_SIZES = new Set(["14px", "15px", "16px"]);

/** The font size used most often in a fragment is the document body size. */
export function dominantFontSize(html: string): string | null {
  const counts = new Map<string, number>();
  const pattern = /font-size\s*:\s*([\d.]+\s*(?:pt|px))/gi;
  let match = pattern.exec(html);
  while (match) {
    const px = normalizeFontSize(match[1]);
    if (px) counts.set(px, (counts.get(px) ?? 0) + 1);
    match = pattern.exec(html);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [size, count] of counts) {
    if (count > bestCount) {
      best = size;
      bestCount = count;
    }
  }
  // Only treat it as the body size when it clearly dominates.
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return best && bestCount >= Math.max(3, total * 0.5) ? best : null;
}

/** Read one attribute regardless of quoting style (Word emits single quotes). */
function readAttr(rawAttrs: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const match = pattern.exec(rawAttrs);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

/**
 * Browsers wrap a copied selection in the page's own background (usually white),
 * which is not a highlight. Treat near-white and transparent as "no colour".
 */
function normalizeColour(raw: string): string | undefined {
  const value = raw.trim().toLowerCase();
  if (!value || value === "transparent" || value === "none" || value === "inherit" || value === "initial") {
    return undefined;
  }
  const hex = toHexColour(value);
  if (!hex) return undefined;
  if (hex === "#ffffff" || hex === "#fff") return undefined;
  // #fefefe / #fdfdfd style page backgrounds are noise too.
  if (/^#f[cd-f][f][f][f][f]$/.test(hex)) return undefined;
  return hex;
}

/** Normalise `rgb()`/named colours to hex so comparisons are reliable. */
function toHexColour(value: string): string | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (hex) return value;
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)%)?/.exec(value);
  if (rgb) {
    const alpha = rgb[4] == null ? 1 : Number(rgb[4]) / 100;
    if (alpha < 0.35) return undefined;
    const part = (n: string) => Math.min(255, Math.round(Number(n))).toString(16).padStart(2, "0");
    return `#${part(rgb[1])}${part(rgb[2])}${part(rgb[3])}`;
  }
  const named: Record<string, string> = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    yellow: "#ffff00",
    lime: "#00ff00",
    blue: "#0000ff",
    gray: "#808080",
    grey: "#808080",
  };
  if (named[value]) return named[value];
  if (/^[a-z]+$/.test(value)) return value;
  return undefined;
}

function isWordHtml(html: string): boolean {
  return /urn:schemas-microsoft-com:office|xmlns:w="urn:schemas-microsoft-com|mso-|<o:p|class=Mso|<w:/i.test(html);
}

/** Remove `<!--[if ...]> ... <![endif]-->` blocks, including nested-looking ones. */
function stripConditionalComments(html: string): string {
  let previous = "";
  let current = html;
  while (current !== previous) {
    previous = current;
    current = current.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "");
    current = current.replace(/<!--[\s\S]*?-->/g, "");
  }
  return current;
}

function stripStyleNoise(
  style: string,
  options: PasteCleanupOptions,
  bodySize: string | null = null,
  isWord = false,
): string {
  const declarations: string[] = [];
  for (const raw of style.split(";")) {
    const index = raw.indexOf(":");
    if (index < 0) continue;
    const prop = raw.slice(0, index).trim().toLowerCase();
    const value = raw.slice(index + 1).trim();
    if (!value) continue;
    if (prop.startsWith("mso-")) continue;
    if (!KEPT_STYLE_PROPS.includes(prop)) continue;
    if (prop === "font-weight") {
      const weight = Number.parseInt(value, 10);
      const bold = value === "bold" || value === "bolder" || (Number.isFinite(weight) && weight >= 600);
      if (options.stripRedundantWeight) continue;
      declarations.push(bold ? "font-weight:bold" : "font-weight:normal");
      continue;
    }
    if (prop === "font-style") {
      declarations.push(value === "italic" || value === "oblique" ? "font-style:italic" : "font-style:normal");
      continue;
    }
    if (prop === "text-decoration") {
      if (/underline/.test(value)) declarations.push("text-decoration:underline");
      continue;
    }
    if (prop === "vertical-align") {
      const lower = value.toLowerCase();
      if (lower === "super") declarations.push("vertical-align:super");
      else if (lower === "sub") declarations.push("vertical-align:sub");
      continue;
    }
    if (prop === "text-align") {
      const lower = value.toLowerCase();
      if (["left", "center", "right", "justify"].includes(lower)) declarations.push(`text-align:${lower}`);
      continue;
    }
    if (prop === "font-size" && options.normalizeSizes) {
      const px = normalizeFontSize(value);
      if (!px) continue;
      if (options.stripBodyFontSize && bodySize && px === bodySize) continue;
      if (!options.stripBodyFontSize && WORD_BODY_SIZES.has(px) && isWord) continue;
      declarations.push(`font-size:${px}`);
      continue;
    }
    if (prop === "background" || prop === "background-color") {
      // Page-level background (almost always white) is not a highlight.
      const colour = normalizeColour(value.split(/\s+/)[0] ?? value);
      if (!colour) continue;
      declarations.push(`background-color:${colour}`);
      continue;
    }
    if (prop === "color") {
      const colour = toHexColour(value.toLowerCase());
      if (!colour) continue;
      declarations.push(`color:${colour}`);
      continue;
    }
    declarations.push(`${prop}:${value}`);
  }
  return declarations.join("; ");
}

/** Replace `<span style>` with `<b>/<i>/<u>` when the style only means that. */
function foldStyleIntoTags(html: string): string {
  return html.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (full, attrs: string, inner: string) => {
    void full;
    const styleMatch = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    if (!styleMatch) return full;
    const style = styleMatch[1] ?? styleMatch[2] ?? "";
    const onlyBold = /^font-weight:\s*bold$/i.test(style.trim());
    const onlyItalic = /^font-style:\s*italic$/i.test(style.trim());
    const onlyUnderline = /^text-decoration:\s*underline$/i.test(style.trim());
    if (onlyBold) return `<b>${inner}</b>`;
    if (onlyItalic) return `<i>${inner}</i>`;
    if (onlyUnderline) return `<u>${inner}</u>`;
    return full;
  });
}

/** Word marks highlights with background-colour; `<mark>` is what the editor keeps. */
function convertBackgroundToMarkOnce(html: string): string {
  // Match only the innermost span so nesting cannot swallow a highlight.
  const pattern = /<span\b([^>]*)>((?:(?!<span\b)[\s\S])*?)<\/span>/gi;
  let out = "";
  let cursor = 0;
  let match = pattern.exec(html);
  while (match) {
    out += html.slice(cursor, match.index);
    cursor = match.index + match[0].length;
    const attrs = match[1];
    const inner = match[2];
    const style = readAttr(attrs, "style");
    const background = style
      ? /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim()
      : undefined;
    const colour = background ? normalizeColour(background.split(/\s+/)[0] ?? background) : undefined;
    if (!style || !colour) {
      out += match[0];
      match = pattern.exec(html);
      continue;
    }
    const rest = style
      .replace(/(?:^|;)\s*background(?:-color)?\s*:\s*[^;]+;?/gi, ";")
      .replace(/;;+/g, ";")
      .replace(/^\s*;|;\s*$/g, "")
      .trim();
    const marked = colour === "yellow" ? `<mark>${inner}</mark>` : `<mark data-color="${colour}">${inner}</mark>`;
    out += rest ? `<span style="${rest}">${marked}</span>` : marked;
    match = pattern.exec(html);
  }
  out += html.slice(cursor);
  return out;
}

/** Nested spans need repeated passes: the regex cannot see inside a consumed match. */
function convertBackgroundToMark(html: string): string {
  let previous = "";
  let current = html;
  for (let pass = 0; pass < 8 && current !== previous; pass += 1) {
    previous = current;
    current = convertBackgroundToMarkOnce(current);
  }
  return current;
}

/** `<font color=...>` and `<font face=...>` are legacy Word output. */
function convertFontTags(html: string): string {
  return html.replace(/<font\b([^>]*)>([\s\S]*?)<\/font>/gi, (_full, attrs: string, inner: string) => {
    const color = /\bcolor\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    const size = /\bsize\s*=\s*"?(\d+)"?/i.exec(attrs)?.[1];
    const styles: string[] = [];
    if (color && color !== "#000000" && color.toLowerCase() !== "black") styles.push(`color:${color}`);
    if (size) {
      const px = { 1: "10px", 2: "13px", 3: "16px", 4: "18px", 5: "24px", 6: "32px", 7: "48px" }[size];
      if (px) styles.push(`font-size:${px}`);
    }
    return styles.length > 0 ? `<span style="${styles.join("; ")}">${inner}</span>` : inner;
  });
}

function dropEmptyParagraphs(html: string): string {
  let previous = "";
  let current = html;
  while (current !== previous) {
    previous = current;
    current = current.replace(/<(p|div)\b[^>]*>(?:\s|&nbsp;|\u00a0|<br\s*\/?>)*<\/\1>/gi, "");
  }
  return current;
}

function cleanAttributes(html: string, options: PasteCleanupOptions, bodySize: string | null = null, isWord = false): string {
  return html.replace(/<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^>]*?)?)(\/?)>/g, (full, tag: string, rawAttrs: string, selfClose: string) => {
    const lower = tag.toLowerCase();
    if (!rawAttrs.trim()) return full;

    const keep: string[] = [];
    const style = readAttr(rawAttrs, "style");
    if (style) {
      const cleaned = stripStyleNoise(style, options, bodySize, isWord);
      if (cleaned) keep.push(`style="${cleaned}"`);
    }

    const align = readAttr(rawAttrs, "align");
    if (align && /^(left|center|right|justify)$/i.test(align)) keep.push(`align="${align.toLowerCase()}"`);

    if (lower === "a") {
      const href = readAttr(rawAttrs, "href");
      const title = readAttr(rawAttrs, "title");
      if (href) keep.push(`href="${href}"`);
      if (title) keep.push(`title="${title}"`);
    }
    if (lower === "img") {
      const src = readAttr(rawAttrs, "src");
      const alt = readAttr(rawAttrs, "alt");
      if (src) keep.push(`src="${src}"`);
      if (alt) keep.push(`alt="${alt}"`);
    }
    if (lower === "td" || lower === "th") {
      const colspan = readAttr(rawAttrs, "colspan");
      const rowspan = readAttr(rawAttrs, "rowspan");
      if (colspan) keep.push(`colspan="${colspan}"`);
      if (rowspan) keep.push(`rowspan="${rowspan}"`);
    }
    if (lower === "ol") {
      const start = readAttr(rawAttrs, "start");
      if (start) keep.push(`start="${start}"`);
    }
    if (/^h[1-6]$/.test(lower)) {
      const id = readAttr(rawAttrs, "id");
      if (id) keep.push(`id="${id}"`);
    }

    return keep.length > 0 ? `<${lower} ${keep.join(" ")}${selfClose}>` : `<${lower}${selfClose}>`;
  });
}

export function isWordClipboard(html: string): boolean {
  return isWordHtml(html);
}

/**
 * Reduce clipboard HTML to the subset the markdown editor models.
 * Unknown structural tags are unwrapped rather than dropped.
 */
export function cleanPastedHtml(html: string, options: PasteCleanupOptions = {}): string {
  const resolved: PasteCleanupOptions = { normalizeSizes: true, stripRedundantWeight: false, ...options };
  let out = html;
  out = stripConditionalComments(out);
  out = out.replace(/<\?xml[\s\S]*?\?>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<title[\s\S]*?<\/title>/gi, "");
  out = out.replace(/<o:p\b[^>]*>[\s\S]*?<\/o:p>/gi, "");
  out = out.replace(/<o:p\b[^>]*\/?>/gi, "");
  out = out.replace(/<\/?o:[a-z]+\b[^>]*>/gi, "");
  out = out.replace(/<\/?w:[a-z]+\b[^>]*>/gi, "");
  // Word wraps everything in a body/div with page styling.
  out = removeOuterWrapper(out);
  out = out.replace(/&nbsp;/g, " ");
  out = out.replace(/\u00a0/g, " ");
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/<br\s*\/?>\s*<br\s*\/?>\s*<br\s*\/?>/gi, "<br /><br />");
  out = foldStyleIntoTags(out);
  out = convertBackgroundToMark(out);
  out = convertFontTags(out);
  // Word repeats the document body size on every run; drop it before it becomes
  // a per-word span in the note.
  const bodySize = resolved.stripBodyFontSize === false ? null : dominantFontSize(out);
  out = cleanAttributes(out, resolved, bodySize, isWordHtml(html));
  out = unwrapUnknownBlocks(out);
  out = dropEmptyParagraphs(out);
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

function removeOuterWrapper(html: string): string {
  if (!isWordHtml(html)) return html;
  let out = html.trim();
  for (let depth = 0; depth < 6; depth += 1) {
    const match = /^<div\b[^>]*>/i.exec(out);
    if (!match) break;
    const close = out.lastIndexOf("</div>");
    if (close < 0) break;
    const inner = out.slice(match[0].length, close);
    if (/<(?:p|h[1-6]|table|ul|ol|blockquote)\b/i.test(inner) && inner.trim()) out = inner.trim();
    else break;
  }
  return out;
}

/** Turn tags we do not model into their children so their text survives. */
function unwrapUnknownBlocks(html: string): string {
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*\/?>/g, (full, tag: string) => {
    const lower = tag.toLowerCase();
    if (BLOCK_TAGS.has(lower)) return full;
    if (["html", "head", "body"].includes(lower)) return "";
    if (["span", "a", "b", "i", "u", "s", "em", "strong", "sup", "sub", "code", "mark", "strike", "del", "font", "img", "ins"].includes(lower)) {
      return full;
    }
    return "";
  });
}

/** Plain text pasted as "markdown" should not be interpreted; only paragraphs survive. */
export function plainTextToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`)
    .join("");
}
