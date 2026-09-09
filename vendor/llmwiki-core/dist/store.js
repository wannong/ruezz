/**
 * WikiHome patch: pure-JS derived index (JSON on disk) replacing better-sqlite3.
 * Same public Store API as upstream llmwiki-core@0.1.0. Search is simple
 * substring/token scoring suitable for personal-scale vaults on Windows without
 * native build tools.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * @typedef {{
 *   id: string,
 *   path: string,
 *   sourceKind: 'wiki'|'source'|'asset',
 *   type?: string,
 *   title?: string,
 *   tags?: string[],
 *   content: string,
 *   staleSince?: string|null,
 * }} StoreEntry
 */

export class Store {
    /** @param {string} dbPath */
    constructor(dbPath) {
        this.dbPath = dbPath.endsWith(".db") ? dbPath.replace(/\.db$/i, ".json") : `${dbPath}.json`;
        /** @type {Map<string, StoreEntry>} */
        this.docs = new Map();
        mkdirSync(dirname(this.dbPath), { recursive: true });
        this.load();
    }

    load() {
        if (!existsSync(this.dbPath)) return;
        try {
            const raw = JSON.parse(readFileSync(this.dbPath, "utf8"));
            const entries = Array.isArray(raw?.entries) ? raw.entries : [];
            this.docs = new Map(entries.map((e) => [e.id, e]));
        } catch {
            this.docs = new Map();
        }
    }

    persist() {
        const entries = [...this.docs.values()];
        writeFileSync(this.dbPath, JSON.stringify({ version: 1, entries }, null, 2), "utf8");
    }

    /** @param {StoreEntry[]} entries */
    rebuild(entries) {
        this.docs.clear();
        for (const e of entries) this.docs.set(e.id, { ...e });
        this.persist();
    }

    /** @param {StoreEntry} entry */
    upsert(entry) {
        this.docs.set(entry.id, { ...entry });
        this.persist();
    }

    /** @param {string} id */
    delete(id) {
        this.docs.delete(id);
        this.persist();
    }

    /**
     * @param {string} query
     * @param {{ limit?: number }} [opts]
     */
    search(query, opts) {
        const limit = opts?.limit ?? 20;
        const terms = query
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter((t) => t.length > 1);
        if (!terms.length) return [];
        const scored = [];
        for (const e of this.docs.values()) {
            if (e.sourceKind !== "wiki") continue;
            const hay = `${e.title ?? ""}\n${e.content}`.toLowerCase();
            let score = 0;
            for (const t of terms) {
                if (hay.includes(t)) score += 1;
            }
            if (score > 0) {
                scored.push({
                    pageId: e.id,
                    score: -score,
                    ...(e.title ? { title: e.title } : {}),
                });
            }
        }
        scored.sort((a, b) => a.score - b.score);
        return scored.slice(0, limit);
    }

    /** @param {string} id */
    markStale(id) {
        const e = this.docs.get(id);
        if (!e) return;
        if (!e.staleSince) e.staleSince = new Date().toISOString();
        this.persist();
    }

    /** @param {string} id */
    clearStale(id) {
        const e = this.docs.get(id);
        if (!e) return;
        e.staleSince = null;
        this.persist();
    }

    findStale() {
        return [...this.docs.values()]
            .filter((e) => e.staleSince)
            .map((e) => ({ id: e.id }));
    }

    close() {
        this.persist();
    }
}
