/**
 * Derived, disposable index over the wiki (WikiHome pure-JS patch).
 */
export interface StoreEntry {
    id: string;
    path: string;
    sourceKind: "wiki" | "source" | "asset";
    type?: string;
    title?: string;
    tags?: string[];
    content: string;
    staleSince?: string | null;
}
export interface StoreHit {
    pageId: string;
    score: number;
    title?: string;
}
export declare class Store {
    constructor(dbPath: string);
    rebuild(entries: StoreEntry[]): void;
    upsert(entry: StoreEntry): void;
    delete(id: string): void;
    search(query: string, opts?: {
        limit?: number;
    }): StoreHit[];
    markStale(id: string): void;
    clearStale(id: string): void;
    findStale(): Array<{
        id: string;
    }>;
    close(): void;
}
