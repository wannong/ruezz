import type { Api, Model } from "./types.ts";
export interface ModelsStoreEntry {
    models: readonly Model<Api>[];
    /** Unix timestamp of the last completed remote check. */
    checkedAt?: number;
}
/** Persistent model catalogs keyed by provider ID. */
export interface ModelsStore {
    read(providerId: string): Promise<ModelsStoreEntry | undefined>;
    write(providerId: string, entry: ModelsStoreEntry): Promise<void>;
    delete(providerId: string): Promise<void>;
}
/** ModelsStore scoped to one provider. Providers cannot access other providers' catalogs. */
export interface ProviderModelsStore {
    read(): Promise<ModelsStoreEntry | undefined>;
    write(entry: ModelsStoreEntry): Promise<void>;
    delete(): Promise<void>;
}
export declare class InMemoryModelsStore implements ModelsStore {
    private readonly entries;
    read(providerId: string): Promise<ModelsStoreEntry | undefined>;
    write(providerId: string, entry: ModelsStoreEntry): Promise<void>;
    delete(providerId: string): Promise<void>;
}
//# sourceMappingURL=models-store.d.ts.map