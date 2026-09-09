import yaml from "js-yaml";
// Strict, anchored detector: the opening fence must be the very first line.
// Content between the fences is delegated to js-yaml.
const FM_BLOCK_STRICT_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
// Unanchored fallback, used only when the strict match fails. LLM-generated pages
// sometimes prepend a junk line (a ```yaml wrapper, a stray `frontmatter:` key)
// before the real block. We accept the first `---\n…\n---` block whose OPENING
// fence sits within the top few lines, so a `---` section divider deep in the
// body can't be mistaken for frontmatter.
const FM_BLOCK_ANYWHERE_RE = /\n---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
const MAX_PREFIX_LINES_BEFORE_FRONTMATTER = 6;
export function parseFrontmatter(content) {
    const located = locateFrontmatterBlock(content);
    if (!located) {
        const recovered = recoverFencelessYaml(content);
        if (recovered)
            return recovered;
        return { frontmatter: null, body: content, rawBlock: "" };
    }
    const { yamlPayload, rawBlock, body } = located;
    // Two-pass YAML parse: try as-is, then run a single round of "wikilink-list"
    // repair (LLMs emit `related: [[a]], [[b]]` which is invalid YAML; we wrap each
    // `[[…]]` in quotes so it parses as a string list). Anything beyond that is
    // reported as no-frontmatter.
    let parsed;
    try {
        parsed = yaml.load(yamlPayload, { schema: yaml.JSON_SCHEMA });
    }
    catch {
        try {
            parsed = yaml.load(repairWikilinkLists(yamlPayload), { schema: yaml.JSON_SCHEMA });
        }
        catch {
            return { frontmatter: null, body, rawBlock };
        }
    }
    return { frontmatter: normalize(parsed), body, rawBlock };
}
function locateFrontmatterBlock(content) {
    const strict = content.match(FM_BLOCK_STRICT_RE);
    if (strict) {
        return {
            yamlPayload: strict[1],
            rawBlock: strict[0],
            body: content.slice(strict[0].length),
        };
    }
    const fallback = content.match(FM_BLOCK_ANYWHERE_RE);
    if (!fallback || fallback.index === undefined)
        return null;
    const openIdx = fallback.index + 1; // skip the leading `\n` the regex consumed
    if (lineNumberAt(content, openIdx) > MAX_PREFIX_LINES_BEFORE_FRONTMATTER) {
        return null;
    }
    const matchLen = fallback[0].length;
    const rawBlock = content.slice(openIdx, openIdx + matchLen - 1);
    const bodyAfterFm = content.slice(openIdx + matchLen - 1);
    // If the prefix that defeated the strict match is a ```yaml / ``` code-fence
    // opener, also strip the matching CLOSING fence at the head of the body —
    // otherwise the body opens with an orphan ``` that renders as a never-closed
    // code block.
    const prefix = content.slice(0, openIdx);
    const prefixIsYamlFence = /^\s*```(?:yaml|yml)?\s*\r?\n$/i.test(prefix);
    if (prefixIsYamlFence) {
        const stripped = bodyAfterFm.replace(/^\s*```\s*(?:\r?\n|$)/, "");
        return { yamlPayload: fallback[1], rawBlock, body: stripped };
    }
    return { yamlPayload: fallback[1], rawBlock, body: bodyAfterFm };
}
/** 1-based line number that a given character index sits on. */
function lineNumberAt(s, index) {
    let line = 1;
    for (let i = 0; i < index && i < s.length; i++) {
        if (s.charCodeAt(i) === 10)
            line++;
    }
    return line;
}
const FM_KNOWN_KEYS = new Set([
    "type", "title", "tags", "related", "sources", "created", "updated",
    "confidence", "authors", "year", "url", "venue",
]);
/**
 * Recover frontmatter the model emitted WITHOUT `---` fences: a leading block of
 * `key: value` (possibly with indented list/nested values), followed by the body.
 * Guarded by (a) >=2 leading YAML lines and (b) at least one known wiki key, so
 * ordinary prose with colons ("Summary: ...") is not mistaken for frontmatter.
 */
function recoverFencelessYaml(content) {
    const lines = content.split("\n");
    const yamlLines = [];
    let i = 0;
    while (i < lines.length) {
        const ln = lines[i];
        if (/^[A-Za-z_][\w-]*\s*:/.test(ln)) {
            yamlLines.push(ln);
            i++;
            while (i < lines.length && /^[ \t]+/.test(lines[i])) {
                yamlLines.push(lines[i]);
                i++;
            }
            continue;
        }
        break;
    }
    if (yamlLines.length < 2)
        return null;
    const payload = yamlLines.join("\n");
    let parsed;
    try {
        parsed = yaml.load(payload, { schema: yaml.JSON_SCHEMA });
    }
    catch {
        return null;
    }
    const fm = normalize(parsed);
    if (!fm || !Object.keys(fm).some((k) => FM_KNOWN_KEYS.has(k)))
        return null;
    const body = lines.slice(i).join("\n").replace(/^\n+/, "");
    return { frontmatter: fm, body, rawBlock: `---\n${payload}\n---\n` };
}
/**
 * Repair `key: [[a]], [[b]], [[c]]` (invalid YAML) into
 * `key: ["[[a]]", "[[b]]", "[[c]]"]`. Only touches lines that match that exact
 * shape; a legitimate nested array like `tags: [[red, blue]]` is left alone.
 */
function repairWikilinkLists(payload) {
    return payload
        .split("\n")
        .map((line) => {
        const m = line.match(/^(\s*[A-Za-z_][\w-]*\s*:\s*)(\[\[[^\]]+\]\](?:\s*,\s*\[\[[^\]]+\]\])+)\s*$/);
        if (!m)
            return line;
        const head = m[1];
        const items = m[2]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => `"${s}"`)
            .join(", ");
        return `${head}[${items}]`;
    })
        .join("\n");
}
/** Coerce js-yaml output into a flat `Record<string, string | string[]>`. */
function normalize(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return null;
    const out = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (Array.isArray(value)) {
            out[key] = value.map((v) => stringifyScalar(v));
            continue;
        }
        out[key] = stringifyScalar(value);
    }
    return out;
}
function stringifyScalar(v) {
    if (v === null || v === undefined)
        return "";
    if (typeof v === "string")
        return v;
    if (typeof v === "number" || typeof v === "boolean")
        return String(v);
    if (v instanceof Date)
        return v.toISOString().slice(0, 10);
    try {
        return JSON.stringify(v);
    }
    catch {
        return String(v);
    }
}
//# sourceMappingURL=frontmatter.js.map