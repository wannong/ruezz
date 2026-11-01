import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { dataUrlToBytes, extensionForMime, saveImageBytes, timestampedName } from "./noteAssets.ts";
import { cleanPastedHtml, isWordClipboard, plainTextToHtml } from "./pasteHtml.ts";

export type PasteContext = {
  /** Absolute vault path of the open note; images are saved beside it. */
  pagePath?: string;
  onError?: (message: string) => void;
};

const IMAGE_NAME = /^image\.(png|jpe?g|gif|webp|bmp|svg)$/i;

function timestamped(extension: string): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${extension}`;
}

function imageFilesFrom(clipboard: DataTransfer): File[] {
  const files: File[] = [];
  for (const item of Array.from(clipboard.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file && file.type.startsWith("image/")) files.push(file);
  }
  if (files.length === 0) {
    for (const file of Array.from(clipboard.files ?? [])) {
      if (file.type.startsWith("image/")) files.push(file);
    }
  }
  return files;
}

function collectDataImages(html: string): string[] {
  const out: string[] = [];
  const pattern = /<img\b[^>]*\bsrc="(data:image\/[^"]+)"/gi;
  let match = pattern.exec(html);
  while (match) {
    out.push(match[1]);
    match = pattern.exec(html);
  }
  return out;
}

type ImageBytes = { bytes: Uint8Array; name: string };

async function readClipboardImages(context: PasteContext, clipboard: DataTransfer, html: string): Promise<ImageBytes[]> {
  const results: Array<Promise<ImageBytes | null>> = [];
  const dataUrls = collectDataImages(html);
  dataUrls.forEach((url, index) => {
    results.push(
      (async () => {
        const decoded = dataUrlToBytes(url);
        if (!decoded) return null;
        const extension = extensionForMime(decoded.mime) ?? "png";
        const saved = await saveImageBytes(context.pagePath, decoded.bytes, timestampedName(extension));
        if (!saved) return null;
        return { bytes: decoded.bytes, name: saved };
      })(),
    );
    void index;
  });
  for (const file of imageFilesFrom(clipboard)) {
    results.push(
      (async () => {
        const extension = extensionForMime(file.type) ?? "png";
        const name = file.name && !IMAGE_NAME.test(file.name) ? file.name : timestamped(extension);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const saved = await saveImageBytes(context.pagePath, bytes, name);
        if (!saved) return null;
        return { bytes, name: saved };
      })(),
    );
  }
  const settled = await Promise.all(results);
  return settled.filter((item): item is ImageBytes => item != null);
}

/** Point every data: image in the HTML at the saved file next to the note. */
function rewriteDataImages(html: string, saved: ImageBytes[]): string {
  let index = 0;
  return html.replace(/<img\b([^>]*?)\bsrc="data:image\/[^"]+"([^>]*)>/gi, (full, pre: string, post: string) => {
    const replacement = saved[index];
    index += 1;
    if (!replacement) return full;
    return `<img${pre}src="${replacement.name}"${post}>`;
  });
}

export type PasteExtensionOptions = {
  getContext: () => PasteContext;
  /** Called after images were written, so the UI can refresh its asset list. */
  onAssetsSaved?: (names: string[]) => void;
};

export const PasteHandler = Extension.create<PasteExtensionOptions>({
  name: "pasteHandler",
  addOptions() {
    return { getContext: () => ({}), onAssetsSaved: undefined };
  },
  addKeyboardShortcuts() {
    // Explicit plain-text paste even when the shortcut is not routed as a paste
    // event by the host webview.
    return {
      "Mod-Shift-v": () => {
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (text) this.editor.commands.insertContent(text.replace(/\r\n/g, "\n"));
          })
          .catch(() => undefined);
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: new PluginKey("pasteHandler"),
        props: {
          handlePaste(view: EditorView, event: ClipboardEvent) {
            const clipboard = event.clipboardData;
            if (!clipboard) return false;
            const html = clipboard.getData("text/html");
            const text = clipboard.getData("text/plain");
            const shift = (event as ClipboardEvent & { shiftKey?: boolean }).shiftKey === true;
            const hasImages = collectDataImages(html).length > 0 || imageFilesFrom(clipboard).length > 0;

            // Shift forces plain text: the escape hatch when Word markup gets in the way.
            if (shift && text) {
              event.preventDefault();
              view.dispatch(view.state.tr.insertText(text));
              return true;
            }

            if (!html && !hasImages) return false;
            if (!html && hasImages) {
              event.preventDefault();
              void insertImagesOnly(view, options, clipboard, shift);
              return true;
            }
            if (!hasImages) {
              // Pure structure: hand cleaned HTML to ProseMirror's own parser.
              const cleaned = cleanPastedHtml(html, { stripRedundantWeight: false });
              if (cleaned) {
                event.preventDefault();
                const { schema } = view.state;
                const parsed = parseHtmlToFragment(view, cleaned);
                if (parsed && parsed.size > 0) {
                  view.dispatch(view.state.tr.replaceSelection(parsed));
                  return true;
                }
                const plain = text || cleaned.replace(/<[^>]+>/g, "");
                view.dispatch(view.state.tr.replaceSelectionWith(schema.text(plain)));
                return true;
              }
              return false;
            }

            event.preventDefault();
            void handleRichPaste(view, options, clipboard, html, text);
            return true;
          },
        },
      }),
    ];
  },
});

/** Parse cleaned clipboard HTML with the editor's own schema. */
function parseHtmlToFragment(view: EditorView, html: string): import("@tiptap/pm/model").Slice | null {
  try {
    const container = document.createElement("div");
    container.innerHTML = html;
    const parser = PMDOMParser.fromSchema(view.state.schema);
    const doc = parser.parse(container);
    const slice = doc.slice(0, doc.content.size);
    return slice;
  } catch {
    return null;
  }
}

async function insertImagesOnly(
  view: EditorView,
  options: PasteExtensionOptions,
  clipboard: DataTransfer,
  plain: boolean,
): Promise<void> {
  if (plain) {
    const text = clipboard.getData("text/plain");
    if (text) view.dispatch(view.state.tr.insertText(text));
    return;
  }
  const context = options.getContext();
  try {
    const saved = await readClipboardImages(context, clipboard, "");
    if (saved.length === 0) {
      context.onError?.("粘贴的图片无法保存到笔记目录");
      return;
    }
    insertImageNodes(view, saved);
    options.onAssetsSaved?.(saved.map((item) => item.name));
  } catch (error) {
    context.onError?.(error instanceof Error ? error.message : String(error));
  }
}

async function handleRichPaste(
  view: EditorView,
  options: PasteExtensionOptions,
  clipboard: DataTransfer,
  html: string,
  text: string,
): Promise<void> {
  const context = options.getContext();
  try {
    const saved = await readClipboardImages(context, clipboard, html);
    const cleaned = cleanPastedHtml(html);
    const withLocalImages = rewriteDataImages(cleaned, saved);
    const parsed = parseHtmlToFragment(view, withLocalImages);
    if (parsed && parsed.size > 0) {
      view.dispatch(view.state.tr.replaceSelection(parsed));
    } else {
      const fallback = text || cleaned.replace(/<[^>]+>/g, "");
      view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.text(fallback)));
    }
    if (saved.length > 0) options.onAssetsSaved?.(saved.map((item) => item.name));
  } catch (error) {
    context.onError?.(error instanceof Error ? error.message : String(error));
  }
}

function insertImageNodes(view: EditorView, saved: ImageBytes[]): void {
  const { schema, tr } = view.state;
  const imageType = schema.nodes.image;
  if (!imageType) return;
  const nodes = saved.map((item) =>
    imageType.create({ src: item.name, alt: item.name.replace(/\.[^.]+$/, "") }),
  );
  if (nodes.length === 0) return;
  let transaction = tr;
  for (const node of nodes) transaction = transaction.replaceSelectionWith(node);
  view.dispatch(transaction);
}

export { isWordClipboard, plainTextToHtml, timestamped };
