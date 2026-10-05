import { copyFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauriRuntime } from "../../api";
import { formatInsertMarkdown } from "./formatCommands";
import type { EditorView } from "@codemirror/view";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? "image";
}

function uniqueName(base: string, attempt: number): string {
  if (attempt === 0) return base;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return `${base}-${attempt}`;
  return `${base.slice(0, dot)}-${attempt}${base.slice(dot)}`;
}

async function copyIntoNoteFolder(sourcePath: string, assetRoot: string, basePath: string): Promise<string | null> {
  const notePath = basePath.replace(/\\/g, "/");
  const noteDir = notePath.split("/").slice(0, -1).join("/");
  const wikiDir = noteDir ? `${assetRoot.replace(/[\\/]+$/, "")}/${noteDir}` : `${assetRoot.replace(/[\\/]+$/, "")}/wiki`;
  if (!(await exists(wikiDir))) {
    await mkdir(wikiDir, { recursive: true });
  }
  const originalName = fileNameFromPath(sourcePath);
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = uniqueName(originalName, attempt);
    const dest = `${wikiDir}/${name}`;
    if (await exists(dest)) continue;
    await copyFile(sourcePath, dest);
    return name;
  }
  return null;
}

export async function pickAndInsertNoteImage(
  view: EditorView,
  assetRoot?: string,
  basePath?: string,
): Promise<boolean> {
  if (!isTauriRuntime()) {
    window.alert("插入图片需要在桌面应用中运行。");
    return false;
  }
  if (!assetRoot || !basePath) {
    window.alert("无法解析当前笔记路径，暂时不能插入图片。");
    return false;
  }
  const selected = await open({
    multiple: false,
    title: "插入图片",
    filters: [{ name: "图片", extensions: IMAGE_EXTENSIONS }],
  });
  if (!selected || typeof selected !== "string") return false;
  const fileName = await copyIntoNoteFolder(selected, assetRoot, basePath);
  if (!fileName) {
    window.alert("复制图片失败，请重试。");
    return false;
  }
  const alt = fileName.replace(/\.[^.]+$/, "");
  formatInsertMarkdown(view, `![${alt}](${fileName})`);
  return true;
}
