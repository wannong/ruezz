import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import {
  addLibraryFolder,
  assignPagesToFolder,
  clearLegacyLibraryStorage,
  deleteLibraryFolder,
  emptyLibraryOrganization,
  folderDescendantIds,
  loadLibraryOrganization,
  pickLegacyLibraryToMigrate,
  renameLibraryFolder,
  staleLegacyVaultPaths,
  type LibraryOrganization,
} from "../libraryFolders";

type UseLibraryOrganizationOptions = {
  vaultPath: string;
  onError: (message: string) => void;
  onMigrated?: (message: string) => void;
};

export function useLibraryOrganization({ vaultPath, onError, onMigrated }: UseLibraryOrganizationOptions) {
  const [libraryOrganization, setLibraryOrganization] = useState(() => loadLibraryOrganization(vaultPath));
  const libraryRef = useRef(libraryOrganization);
  libraryRef.current = libraryOrganization;
  const librarySaving = useRef(false);

  const persistLibrary = useCallback(async (mutate: (current: LibraryOrganization) => LibraryOrganization) => {
    const current = libraryRef.current;
    const drafted = mutate(current);
    if (drafted === current) return;
    librarySaving.current = true;
    libraryRef.current = drafted;
    setLibraryOrganization(drafted);
    try {
      const saved = await api.librarySave(drafted, current.revision);
      libraryRef.current = saved;
      setLibraryOrganization(saved);
      clearLegacyLibraryStorage([vaultPath, ...staleLegacyVaultPaths(saved)]);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      try {
        const remote = await api.libraryGet();
        libraryRef.current = remote;
        setLibraryOrganization(remote);
      } catch {
        libraryRef.current = current;
        setLibraryOrganization(current);
      }
    } finally {
      librarySaving.current = false;
    }
  }, [onError, vaultPath]);

  useEffect(() => {
    let cancelled = false;
    if (!librarySaving.current && libraryRef.current.revision === 0) {
      const localFallback = loadLibraryOrganization(vaultPath);
      setLibraryOrganization(localFallback);
      libraryRef.current = localFallback;
    }
    void (async () => {
      try {
        const remote = await api.libraryGet();
        const registry = await api.vaultRegistry().catch(() => null);
        const extraPaths: string[] = [];
        if (registry) {
          const entry = Object.values(registry.vaults).find((item) => item.currentPath === vaultPath)
            ?? registry.vaults[registry.activeVaultId];
          if (entry) extraPaths.push(entry.currentPath, ...entry.pathHistory.map((item) => item.path));
        }
        const paths = [...new Set([vaultPath, ...extraPaths])];
        if (cancelled) return;
        if (librarySaving.current || libraryRef.current.revision > remote.revision) {
          clearLegacyLibraryStorage([...paths, ...staleLegacyVaultPaths(libraryRef.current)]);
          return;
        }
        const candidates = paths.map((path) => loadLibraryOrganization(path));
        const legacy = pickLegacyLibraryToMigrate(remote, [libraryRef.current, ...candidates]);
        let next = remote;
        if (legacy) {
          next = await api.librarySave(legacy, remote.revision);
          if (!cancelled) onMigrated?.("已将旧的文献分类迁移到知识库");
        }
        if (cancelled) return;
        libraryRef.current = next;
        setLibraryOrganization(next);
        clearLegacyLibraryStorage([...paths, ...staleLegacyVaultPaths(next)]);
      } catch (e) {
        if (cancelled) return;
        if (libraryRef.current.folders.length === 0 && Object.keys(libraryRef.current.assignments).length === 0) {
          libraryRef.current = emptyLibraryOrganization();
        }
        onError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onError, onMigrated, vaultPath]);

  const createLibraryFolderIn = useCallback((parentId: string | null, name: string) => {
    void persistLibrary((org) => addLibraryFolder(org, name, parentId));
  }, [persistLibrary]);

  const renameLibraryFolderIn = useCallback((folderId: string, name: string) => {
    void persistLibrary((org) => renameLibraryFolder(org, folderId, name));
  }, [persistLibrary]);

  const deleteLibraryFolderIn = useCallback((folderId: string) => {
    const org = libraryRef.current;
    const folder = org.folders.find((item) => item.id === folderId);
    if (!folder) return;
    const removing = folderDescendantIds(org.folders, folderId);
    const childCount = removing.size - 1;
    const pageCount = Object.values(org.assignments).filter((id) => removing.has(id)).length;
    const extra = [childCount > 0 ? `${childCount} 个子分类` : "", pageCount > 0 ? `${pageCount} 篇文献会移到上级或未分类` : ""].filter(Boolean).join("，");
    if (!window.confirm(extra ? `确定删除分类「${folder.name}」吗？将同时处理${extra}。` : `确定删除分类「${folder.name}」吗？`)) return;
    void persistLibrary((current) => deleteLibraryFolder(current, folderId));
  }, [persistLibrary]);

  const moveLibraryPages = useCallback((pageIds: string[], folderId: string | null) => {
    void persistLibrary((org) => assignPagesToFolder(org, pageIds, folderId));
  }, [persistLibrary]);

  return {
    libraryOrganization,
    persistLibrary,
    createLibraryFolderIn,
    renameLibraryFolderIn,
    deleteLibraryFolderIn,
    moveLibraryPages,
  };
}
