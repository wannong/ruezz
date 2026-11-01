import assert from "node:assert/strict";
import { test } from "node:test";
import { docToMarkdown } from "./docToMd.ts";
import { markdownToDoc } from "./mdToDoc.ts";
import { cleanPastedHtml, dominantFontSize, isWordClipboard } from "./pasteHtml.ts";
import { wysiwygSchema } from "./docSchema.ts";

/**
 * The serializer may normalise syntax (`*x*` -> `_x_`), so equality is checked
 * on the parsed document: reading what we wrote must give the same tree.
 */
function assertStable(markdown: string): string {
  const first = markdownToDoc(markdown).doc;
  const written = docToMarkdown(first, undefined);
  const second = markdownToDoc(written).doc;
  assert.deepEqual(second, first, `doc changed after re-reading:\n${markdown}\n->\n${written}`);
  return written;
}

test("basic markdown survives a round-trip", () => {
  for (const markdown of [
    "Some **bold** and *italic* with `code`.\n",
    "# Heading\n\n## Sub\n",
    "> quoted\n",
    "- item one\n- item two\n",
    "1. first\n2. second\n",
    "```js\nconst a = 1;\n```\n",
    "[link](https://x.com) and ![img](a.png)\n",
  ]) {
    assertStable(markdown);
  }
});

test("gfm tables and task lists round-trip", () => {
  assertStable("| a | b |\n| --- | --- |\n| 1 | 2 |\n");
  assertStable("- [ ] todo\n- [x] done\n");
});

test("inline style HTML round-trips with its attributes", () => {
  const written = assertStable('<span style="color: #c00000">red</span> text\n');
  assert.match(written, /<span style="color: #c00000">red<\/span>/);
});

test("highlight keeps its colour", () => {
  const written = assertStable('<mark data-color="#ffadad">hl</mark> tail\n');
  assert.match(written, /<mark data-color="#ffadad">hl<\/mark>/);
  assertStable("<mark>hl</mark> tail\n");
});

test("superscript, subscript and underline round-trip", () => {
  const written = assertStable("a <sup>2</sup> b and <u>u</u> c <sub>i</sub>\n");
  assert.match(written, /<sup>2<\/sup>/);
  assert.match(written, /<u>u<\/u>/);
  assert.match(written, /<sub>i<\/sub>/);
});

test("wikilinks are preserved and never escaped", () => {
  const written = assertStable("[[concepts/x]] and [[a/b|别名]]\n");
  assert.match(written, /\[\[concepts\/x\]\]/);
  assert.match(written, /\[\[a\/b\|别名\]\]/);
});

test("math survives", () => {
  assertStable("x $a^2$ y\n");
});

test("adjacent runs sharing a mark become one span", () => {
  // Previously this produced `**b **c** d**`, which destroyed the nesting.
  const written = assertStable("a **b *c* d** e\n");
  assert.equal(written, "a **b _c_ d** e\n");
});

test("markdown syntax characters in literal text are escaped", () => {
  const written = assertStable("text with a_b and 2*3 things\n");
  assert.match(written, /a\\_b/);
  assert.match(written, /2\\\*3/);
});

test("untouched blocks are written back verbatim", () => {
  const markdown = "# Title\n\nSome **bold** text.\n";
  const { doc, origin } = markdownToDoc(markdown);
  origin.snapshots = (doc.content ?? []).map((node) => {
    const clone = { ...node };
    return docToMarkdown({ type: "doc", content: [clone] }, undefined).trimEnd();
  });
  assert.equal(docToMarkdown(doc, origin), markdown);
});

test("word clipboard html is detected and reduced to structure", () => {
  const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body>
<div class=WordSection1>
<p class=MsoNormal><b><span style='font-size:16.0pt;color:#C00000'>标题<o:p></o:p></span></b></p>
<p class=MsoNormal><span style='font-size:10.5pt'>正文 <span style='background:yellow;mso-highlight:yellow'>高亮</span><o:p></o:p></span></p>
<p class=MsoNormal><o:p>&nbsp;</o:p></p>
<table><tr><td>1</td><td>2</td></tr></table>
</div></body></html>`;
  assert.equal(isWordClipboard(word), true);
  const cleaned = cleanPastedHtml(word);
  assert.doesNotMatch(cleaned, /mso-|<o:p|MsoNormal/i);
  assert.doesNotMatch(cleaned, /font-size:16\.0pt/);
  assert.match(cleaned, /<b>/);
  // Word pt sizes are normalised to px.
  assert.match(cleaned, /font-size:21\.33px/);
  // Word highlight becomes the editor's mark element.
  assert.match(cleaned, /<mark>/);
  assert.match(cleaned, /<table>/);
});

test("page background is not treated as a highlight", () => {
  const chrome = `<span style="color: rgb(32, 33, 34); background-color: rgb(255, 255, 255); font-size: 14px">plain</span>`;
  const cleaned = cleanPastedHtml(chrome);
  assert.doesNotMatch(cleaned, /<mark/);
  assert.doesNotMatch(cleaned, /255, 255, 255/);
});

test("scripts and conditional comments never reach the editor", () => {
  const cleaned = cleanPastedHtml('<p>hi</p><script>alert(1)</script><!--[if gte mso 9]><xml>x</xml><![endif]-->');
  assert.doesNotMatch(cleaned, /alert|mso 9|<xml>/);
});

test("converted documents are valid for the editor schema", () => {
  const schema = wysiwygSchema();
  // A paragraph cannot contain a block image, so images must be promoted.
  for (const markdown of [
    "![pic](pic.png)\n",
    "before\n\n![pic](pic.png)\n\nafter\n",
    "text with ![inline](a.png) inline image\n",
    "# heading with ![img](a.png)\n",
    "| a |\n| - |\n| ![i](a.png) |\n",
    "- item\n\n  ![pic](a.png)\n",
    "> quoted ![pic](a.png)\n",
    "a <sup>2</sup> **bold** <mark>hl</mark> [[x/y]]\n",
    "- [x] done\n- [ ] todo\n",
  ]) {
    const { doc } = markdownToDoc(markdown);
    assert.doesNotThrow(() => schema.nodeFromJSON(doc).check(), `invalid doc for: ${markdown}`);
  }
});

test("standalone images round-trip as their own block", () => {
  const written = assertStable("before\n\n![pic](pic.png)\n\nafter\n");
  assert.match(written, /!\[pic\]\(pic\.png\)/);
});

test("a task list and wikilink do not shift each other", () => {
  const markdown = "- [x] done\n- [ ] todo\n\n[[concepts/x]] tail\n";
  assertStable(markdown);
});

test("alignment survives both html forms", () => {
  const fromAlignAttr = assertStable('<p align="center">居中文字</p>\n');
  assert.match(fromAlignAttr, /align="center"/);
  const fromStyle = assertStable('<p style="text-align:center">居中文字</p>\n');
  assert.match(fromStyle, /align="center"/);
});

test("word body font size is not stamped onto every run", () => {
  const word = `<p class=MsoNormal><span style='font-size:10.5pt'>第一段<o:p></o:p></span></p>
<p class=MsoNormal><span style='font-size:10.5pt'>第二段<o:p></o:p></span></p>
<p class=MsoNormal><span style='font-size:10.5pt'>第三段<o:p></o:p></span></p>
<p class=MsoNormal><span style='font-size:24.0pt'>大标题</span></p>`;
  assert.equal(dominantFontSize(word), "14px");
  const cleaned = cleanPastedHtml(word);
  assert.doesNotMatch(cleaned, /font-size:14px/);
  // A genuinely larger run keeps its size.
  assert.match(cleaned, /font-size:32px/);
});

test("word alignment becomes a paragraph alignment", () => {
  const cleaned = cleanPastedHtml(
    `<p class=MsoNormal style='text-align:center'><span style='font-size:9.0pt'>居中说明</span></p>`,
  );
  assert.match(cleaned, /text-align:center/);
});
