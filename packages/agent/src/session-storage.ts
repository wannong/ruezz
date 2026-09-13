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
   * Generate a unique session ID with safe characters only.
   */
  generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `sess_${timestamp}_${random}`;
  }

  /**
   * Validate session ID to prevent path traversal.
   */
  private validateSessionId(sessionId: string): void {
    if (!/^sess_[a-z0-9_]+$/.test(sessionId)) {
      throw new Error(`Invalid session ID: ${sessionId}`);
    }
    if (sessionId.includes("..") || sessionId.includes("/") || sessionId.includes("\\")) {
      throw new Error(`Session ID contains invalid characters: ${sessionId}`);
    }
  }

  /**
   * Get the file path for a session ID.
   */
  private getSessionPath(sessionId: string): string {
    this.validateSessionId(sessionId);
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  /**
   * Save a session to disk atomically (temp file + rename).
   */
  async save(session: AgentSession): Promise<void> {
    const sessionPath = this.getSessionPath(session.id);
    const tempPath = `${sessionPath}.tmp`;
    const content = JSON.stringify(session, null, 2);
    
    try {
      await fs.writeFile(tempPath, content, "utf-8");
      await fs.rename(tempPath, sessionPath);
    } catch (err) {
      // Clean up temp file if rename failed
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
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
            attachments: session.attachments ?? [],
            archived: Boolean(session.archived),
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
   * Mark a session as archived or restore it to the main list.
   */
  async archive(sessionId: string, archived: boolean): Promise<AgentSession | null> {
    const session = await this.load(sessionId);
    if (!session) return null;
    session.archived = archived;
    session.updatedAt = new Date().toISOString();
    await this.save(session);
    return session;
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
