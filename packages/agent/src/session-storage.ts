import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentSession, AgentSessionSummary } from "./types.js";

/**
 * Session storage backed by JSON files in .wikihome/sessions/
 */
export class SessionStorage {
  private sessionsDir: string;

  constructor(vaultRoot: string) {
    this.sessionsDir = path.join(vaultRoot, ".wikihome", "sessions");
  }

  /**
   * Ensure sessions directory exists.
   */
  async init(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  /**
   * Generate a unique session ID.
   */
  generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `sess_${timestamp}_${random}`;
  }

  /**
   * Get the file path for a session ID.
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  /**
   * Save a session to disk.
   */
  async save(session: AgentSession): Promise<void> {
    const sessionPath = this.getSessionPath(session.id);
    const content = JSON.stringify(session, null, 2);
    await fs.writeFile(sessionPath, content, "utf-8");
  }

  /**
   * Load a session from disk.
   */
  async load(sessionId: string): Promise<AgentSession | null> {
    const sessionPath = this.getSessionPath(sessionId);
    try {
      const content = await fs.readFile(sessionPath, "utf-8");
      return JSON.parse(content) as AgentSession;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  /**
   * List all sessions, sorted by updatedAt descending.
   */
  async list(): Promise<AgentSessionSummary[]> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessions: AgentSessionSummary[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const sessionPath = path.join(this.sessionsDir, file);
        try {
          const content = await fs.readFile(sessionPath, "utf-8");
          const session = JSON.parse(content) as AgentSession;
          sessions.push({
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            model: session.model,
            messageCount: session.messages.length,
            linkedPageIds: session.linkedPageIds,
          });
        } catch {
          // Skip corrupted session files
          continue;
        }
      }

      // Sort by updatedAt descending
      sessions.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return sessions;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  /**
   * Delete a session from disk.
   */
  async delete(sessionId: string): Promise<boolean> {
    const sessionPath = this.getSessionPath(sessionId);
    try {
      await fs.unlink(sessionPath);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw err;
    }
  }

  /**
   * Check if a session exists.
   */
  async exists(sessionId: string): Promise<boolean> {
    const sessionPath = this.getSessionPath(sessionId);
    try {
      await fs.access(sessionPath);
      return true;
    } catch {
      return false;
    }
  }
}
