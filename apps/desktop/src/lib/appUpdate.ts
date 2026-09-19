import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type UpdateProgress = {
  downloaded: number;
  contentLength: number | null;
};

export type UpdateCheckResult =
  | { status: "up-to-date"; currentVersion: string }
  | { status: "available"; currentVersion: string; update: Update }
  | { status: "unavailable"; currentVersion: string; message: string };

export async function currentAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "unknown";
  }
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = await currentAppVersion();
  try {
    const update = await check();
    if (!update) return { status: "up-to-date", currentVersion };
    return { status: "available", currentVersion, update };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "unavailable", currentVersion, message };
  }
}

export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let contentLength: number | null = null;
  await update.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? null;
        downloaded = 0;
        onProgress?.({ downloaded, contentLength });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, contentLength });
        break;
      case "Finished":
        onProgress?.({ downloaded, contentLength });
        break;
    }
  });
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
