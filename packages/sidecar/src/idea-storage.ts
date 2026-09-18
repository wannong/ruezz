import { promises as fs } from "node:fs";
import path from "node:path";

export type IdeaTarget =
  | { kind: "page"; pageId: string }
  | { kind: "assistant"; sessionId: string; messageId: string };

export type TextIdeaSelector = {
  kind?: "text";
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  revision: string;
};

export type PdfRegionIdeaSelector = {
  kind: "pdf-region";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  exact?: string;
};

export type IdeaSelector = TextIdeaSelector | PdfRegionIdeaSelector;

export type Idea = {
  id: string;
  content: string;
  color: string;
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
  target: IdeaTarget;
  selector: IdeaSelector;
};

const ID_PATTERN = /^idea_[a-z0-9_]+$/;
const COLORS = new Set(["yellow", "blue", "green", "pink", "violet"]);

export class IdeaStorage {
  private readonly ideasDir: string;

  constructor(vaultRoot: string) {
    this.ideasDir = path.join(vaultRoot, ".wikihome", "ideas");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.ideasDir, { recursive: true });
  }

  generateId(): string {
    return `idea_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  async list(): Promise<Idea[]> {
    await this.init();
    const files = await fs.readdir(this.ideasDir);
    const ideas: Idea[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const idea = this.validate(JSON.parse(await fs.readFile(path.join(this.ideasDir, file), "utf8")));
        ideas.push(idea);
      } catch {
        // A damaged note must not prevent the rest of the vault from loading.
      }
    }
    return ideas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(input: {
    content: unknown;
    color?: unknown;
    target: unknown;
    selector: unknown;
  }): Promise<Idea> {
    const now = new Date().toISOString();
    const idea = this.validate({
      id: this.generateId(),
      content: input.content,
      color: input.color ?? "yellow",
      status: "open",
      createdAt: now,
      updatedAt: now,
      target: input.target,
      selector: input.selector,
    });
    await this.save(idea);
    return idea;
  }

  async update(id: string, patch: Record<string, unknown>): Promise<Idea> {
    const current = await this.read(id);
    if (!current) throw new Error(`Idea not found: ${id}`);
    const idea = this.validate({
      ...current,
      content: patch.content ?? current.content,
      color: patch.color ?? current.color,
      status: patch.status ?? current.status,
      updatedAt: new Date().toISOString(),
    });
    await this.save(idea);
    return idea;
  }

  async delete(id: string): Promise<boolean> {
    const file = this.filePath(id);
    try {
      await fs.unlink(file);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async remapPage(fromId: string, toId: string, descendants = false): Promise<void> {
    const ideas = await this.list();
    const prefix = `${fromId}/`;
    for (const idea of ideas) {
      if (idea.target.kind !== "page") continue;
      const current = idea.target.pageId;
      if (current !== fromId && !(descendants && current.startsWith(prefix))) continue;
      idea.target.pageId = current === fromId ? toId : `${toId}/${current.slice(prefix.length)}`;
      idea.updatedAt = new Date().toISOString();
      await this.save(idea);
    }
  }

  private async read(id: string): Promise<Idea | null> {
    try {
      return this.validate(JSON.parse(await fs.readFile(this.filePath(id), "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async save(idea: Idea): Promise<void> {
    await this.init();
    const file = this.filePath(idea.id);
    const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 9)}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(idea, null, 2), "utf8");
      await fs.rename(temp, file);
    } catch (error) {
      await fs.unlink(temp).catch(() => undefined);
      throw error;
    }
  }

  private filePath(id: string): string {
    if (!ID_PATTERN.test(id)) throw new Error("Invalid Idea ID");
    return path.join(this.ideasDir, `${id}.json`);
  }

  private validate(value: unknown): Idea {
    if (!value || typeof value !== "object") throw new Error("Idea must be an object");
    const raw = value as Record<string, unknown>;
    const id = String(raw.id ?? "");
    if (!ID_PATTERN.test(id)) throw new Error("Invalid Idea ID");
    const content = String(raw.content ?? "").trim();
    if (!content || content.length > 20_000) throw new Error("Idea content must contain 1-20000 characters");
    const color = String(raw.color ?? "yellow");
    if (!COLORS.has(color)) throw new Error("Invalid Idea color");
    const status = raw.status === "resolved" ? "resolved" : "open";

    const targetRaw = raw.target as Record<string, unknown> | undefined;
    let target: IdeaTarget;
    if (targetRaw?.kind === "page" && String(targetRaw.pageId ?? "")) {
      target = { kind: "page", pageId: String(targetRaw.pageId) };
    } else if (targetRaw?.kind === "assistant" && targetRaw.sessionId && targetRaw.messageId) {
      target = {
        kind: "assistant",
        sessionId: String(targetRaw.sessionId),
        messageId: String(targetRaw.messageId),
      };
    } else {
      throw new Error("Invalid Idea target");
    }

    const selectorRaw = raw.selector as Record<string, unknown> | undefined;
    if (selectorRaw?.kind === "pdf-region") {
      const page = Number(selectorRaw.page);
      const x = Number(selectorRaw.x);
      const y = Number(selectorRaw.y);
      const width = Number(selectorRaw.width);
      const height = Number(selectorRaw.height);
      if (!Number.isInteger(page) || page < 1 || ![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001) {
        throw new Error("Invalid PDF Idea selector");
      }
      return {
        id,
        content,
        color,
        status,
        createdAt: String(raw.createdAt ?? ""),
        updatedAt: String(raw.updatedAt ?? ""),
        target,
        selector: {
          kind: "pdf-region",
          page,
          x,
          y,
          width,
          height,
          exact: String(selectorRaw.exact ?? "").trim().slice(0, 20_000) || undefined,
        },
      };
    }
    const exact = String(selectorRaw?.exact ?? "").trim();
    const start = Number(selectorRaw?.start);
    const end = Number(selectorRaw?.end);
    if (!exact || exact.length > 20_000 || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
      throw new Error("Invalid Idea selector");
    }
    return {
      id,
      content,
      color,
      status,
      createdAt: String(raw.createdAt ?? ""),
      updatedAt: String(raw.updatedAt ?? ""),
      target,
      selector: {
        kind: "text",
        exact,
        prefix: String(selectorRaw?.prefix ?? "").slice(-128),
        suffix: String(selectorRaw?.suffix ?? "").slice(0, 128),
        start,
        end,
        revision: String(selectorRaw?.revision ?? ""),
      },
    };
  }
}
