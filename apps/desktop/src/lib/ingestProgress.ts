export type IngestStepId = "pick" | "archive" | "convert" | "write" | "index" | "done";

const CONVERTIBLE_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".pptx",
  ".ppt",
  ".xlsx",
  ".xls",
  ".html",
  ".htm",
]);

export function ingestFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filePath;
}

export function ingestNeedsConversion(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return false;
  return CONVERTIBLE_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}

export type FileIngestPlan = {
  path: string;
  name: string;
  steps: IngestStepId[];
};

export function buildIngestPlan(paths: string[]): { files: FileIngestPlan[]; totalSteps: number } {
  const files = paths.map((path) => {
    const steps: IngestStepId[] = ["archive"];
    if (ingestNeedsConversion(path)) steps.push("convert");
    steps.push("write", "index");
    return { path, name: ingestFileName(path), steps };
  });
  const totalSteps = 1 + files.reduce((sum, file) => sum + file.steps.length, 0);
  return { files, totalSteps };
}

export function ingestStepProgress(doneSteps: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  return Math.min(100, Math.round((doneSteps / totalSteps) * 100));
}

const ACTIVE_CAPTION: Partial<Record<IngestStepId, string>> = {
  archive: "Ruezz 正在归档原件",
  convert: "Ruezz 正在转换为 Markdown",
  write: "Ruezz 正在写入文献页",
  index: "Ruezz 正在更新索引",
};

const DONE_CAPTION: Partial<Record<IngestStepId, string>> = {
  pick: "Ruezz 已选择文件",
  archive: "Ruezz 已归档原件",
  convert: "Ruezz 已完成转换",
  write: "Ruezz 已写入文献页",
  index: "Ruezz 已更新索引",
};

export function ingestCaption(step: IngestStepId, phase: "active" | "done", fileCount?: number): string {
  if (step === "done") {
    const n = fileCount ?? 0;
    return n > 0 ? `Ruezz 已完成导入（共 ${n} 个文件）` : "Ruezz 已完成导入";
  }
  if (phase === "active") return ACTIVE_CAPTION[step] ?? "Ruezz 正在处理";
  return DONE_CAPTION[step] ?? "Ruezz 已完成";
}

export const INGEST_STEP_LABELS: Record<IngestStepId, string> = {
  pick: "选择文件",
  archive: "归档原件",
  convert: "转换",
  write: "写入文献页",
  index: "更新索引",
  done: "完成导入",
};

export type IngestProgressSnapshot = {
  caption: string;
  subtitle?: string;
  percent: number;
  activeStep: IngestStepId | null;
  completedStepIds: IngestStepId[];
  visibleSteps: IngestStepId[];
  pulsing: boolean;
};

export function ingestFileSubtitle(fileIndex: number, fileCount: number, fileName: string): string {
  return `（${fileIndex + 1}/${fileCount}）${fileName}`;
}

export const INGEST_PROGRESS_PREVIEW_PATHS = ["示例论文.pdf", "读书笔记.md"];

function ingestProgressPause(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export async function runIngestProgressAnimation(
  paths: string[],
  update: (snapshot: IngestProgressSnapshot) => void,
  processFile: (path: string) => Promise<void>,
  stepPauseMs = 120,
): Promise<void> {
  if (!paths.length) return;
  const plan = buildIngestPlan(paths);
  let doneSteps = 1;

  update({
    caption: ingestCaption("pick", "done"),
    percent: ingestStepProgress(doneSteps, plan.totalSteps),
    activeStep: null,
    completedStepIds: ["pick"],
    visibleSteps: plan.files[0]?.steps ?? [],
    pulsing: false,
  });

  for (let fileIndex = 0; fileIndex < plan.files.length; fileIndex += 1) {
    const file = plan.files[fileIndex];
    const fileCompleted: IngestStepId[] = ["pick"];

    update({
      caption: ingestCaption("archive", "active"),
      subtitle: ingestFileSubtitle(fileIndex, plan.files.length, file.name),
      percent: ingestStepProgress(doneSteps, plan.totalSteps),
      activeStep: "archive",
      completedStepIds: fileCompleted,
      visibleSteps: file.steps,
      pulsing: true,
    });

    await processFile(file.path);

    for (const step of file.steps) {
      doneSteps += 1;
      fileCompleted.push(step);
      update({
        caption: ingestCaption(step, "done"),
        subtitle: ingestFileSubtitle(fileIndex, plan.files.length, file.name),
        percent: ingestStepProgress(doneSteps, plan.totalSteps),
        activeStep: null,
        completedStepIds: fileCompleted,
        visibleSteps: file.steps,
        pulsing: false,
      });
      await ingestProgressPause(stepPauseMs);
    }
  }

  update({
    caption: ingestCaption("done", "done", paths.length),
    percent: 100,
    activeStep: null,
    completedStepIds: ["pick", ...(plan.files[plan.files.length - 1]?.steps ?? [])],
    visibleSteps: plan.files[plan.files.length - 1]?.steps ?? [],
    pulsing: false,
  });
  await ingestProgressPause(1000);
}
