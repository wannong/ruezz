import { Extension, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Image } from "@tiptap/extension-image";
import { Highlight } from "@tiptap/extension-highlight";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Placeholder } from "@tiptap/extension-placeholder";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";

/**
 * A wikilink is a plain text run carrying the target page id, so `[[id|label]]`
 * survives edits without needing a node.
 */
export const Wikilink = Extension.create({
  name: "wikilink",
  addOptions() {
    return { onOpen: undefined as ((id: string) => void) | undefined };
  },
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          wikilink: {
            default: null,
            keepOnSplit: true,
            parseHTML: (element) => element.getAttribute("data-wikilink"),
            renderHTML: (attributes) =>
              attributes.wikilink ? { "data-wikilink": String(attributes.wikilink) } : {},
          },
        },
      },
    ];
  },
});

/** Alignment lives on the block so `<p align="center">` round-trips. */
export const alignmentAttribute = {
  align: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute("align") ?? undefined,
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.align ? { align: String(attributes.align) } : {},
  },
};

/**
 * Raw HTML we could not model (iframes, embedded objects) is preserved verbatim
 * on a block node so saving never silently drops content.
 */
export const RawHtmlBlock = Node.create({
  name: "rawHtmlBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      value: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-raw-html") ?? element.innerHTML,
        renderHTML: (attributes) => ({ "data-raw-html": attributes.value }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-raw-html]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "pm-raw-html" })];
  },
  renderText({ node }) {
    return node.attrs.value ?? "";
  },
});

export type WysiwygExtensionOptions = {
  placeholder?: string;
  onOpenWikilink?: (id: string) => void;
};

export function createWysiwygExtensions(options: WysiwygExtensionOptions = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noreferrer" } },
      codeBlock: { HTMLAttributes: { class: "md-code-block" } },
    }),
    TextStyle,
    Color,
    FontSize,
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Wikilink,
    RawHtmlBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Image.configure({ inline: false, allowBase64: true }),
    InlineMath,
    BlockMath,
    Placeholder.configure({ placeholder: options.placeholder ?? "" }),
  ];
}
