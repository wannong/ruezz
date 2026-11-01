import { open } from "@tauri-apps/plugin-dialog";
import { isTauriRuntime } from "../../api";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
};

export function extensionForMime(mime: string): string | undefined {
  return MIME_EXTENSIONS[mime.toLowerCase()];
}

/** `image.png` → `image-1.png`, so repeated pastes never overwrite. */
export function uniqueFileName(base: string, attempt: number): string {
  if (attempt === 0) return base;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return `${base}-${attempt}`;
  return `${base.slice(0, dot)}-${attempt}${base.slice(dot)}`;
}

export function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || "image";
}

export function timestampedName(extension: string): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const random = Math.random().toString(36).slice(2, 6);
  return `pasted-${stamp}-${random}.${extension}`;
}

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] ?? "application/octet-stream";
  const body = match[3] ?? "";
  try {
    if (match[2]) {
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return { bytes, mime };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(body)), mime };
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function saveBytes(pagePath: string, fileName: string, bytes: Uint8Array): Promise<string | null> {
  const { api } = await import("../../api");
  const result = await api.vaultSaveAsset(pagePath, fileName, toBase64(bytes));
  return result?.name ?? null;
}

/** Save bytes next to the note and return the name to put in `![](...)`. */
export async function saveImageBytes(
  pagePath: string | undefined,
  bytes: Uint8Array,
  preferredName: string,
): Promise<string | null> {
  if (!pagePath) return null;
  return saveBytes(pagePath, preferredName, bytes);
}

export async function saveBlob(pagePath: string | undefined, blob: Blob): Promise<string | null> {
  if (!pagePath) return null;
  const extension = extensionForMime(blob.type) ?? "png";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return saveImageBytes(pagePath, bytes, timestampedName(extension));
}

/** File picker path used by the toolbar image button. */
export async function pickAndSaveImage(pagePath: string | undefined): Promise<string | null> {
  if (!isTauriRuntime()) {
    window.alert("插入图片需要在桌面应用中运行。");
    return null;
  }
  if (!pagePath) {
    window.alert("无法解析当前笔记路径，暂时不能插入图片。");
    return null;
  }
  const selected = await open({
    multiple: false,
    title: "插入图片",
    filters: [{ name: "图片", extensions: IMAGE_EXTENSIONS }],
  });
  if (!selected || typeof selected !== "string") return null;

  const { readFile } = await import("@tauri-apps/plugin-fs");
  const bytes = await readFile(selected);
  return saveImageBytes(pagePath, bytes, fileNameFromPath(selected));
}
