import type { AppSettings, ExportRecord, ProjectRecord } from "./types";

const DB_NAME = "photo-print-studio-pro";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projects")) {
          const s = db.createObjectStore("projects", { keyPath: "id" });
          s.createIndex("updatedAt", "updatedAt");
        }
        if (!db.objectStoreNames.contains("exports")) {
          const s = db.createObjectStore("exports", { keyPath: "id" });
          s.createIndex("at", "at");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<any>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(store, mode);
          const req = fn(t.objectStore(store));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(null);
          t.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/* ---------------- projects ---------------- */

export async function saveProject(p: ProjectRecord): Promise<boolean> {
  const r = await tx<ProjectRecord>("projects", "readwrite", (s) => s.put(p));
  return !!r;
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  return (await tx<ProjectRecord>("projects", "readonly", (s) => s.get(id))) ?? null;
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const all = (await tx<ProjectRecord[]>("projects", "readonly", (s) => s.getAll())) ?? [];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<boolean> {
  const r = await tx<IDBValidKey>("projects", "readwrite", (s) => s.delete(id));
  return r !== null;
}

export async function clearProjects(): Promise<void> {
  await tx("projects", "readwrite", (s) => s.clear());
}

/* ---------------- exports log ---------------- */

export async function addExport(r: ExportRecord): Promise<void> {
  await tx<ExportRecord>("exports", "readwrite", (s) => s.put(r));
}

export async function listExports(): Promise<ExportRecord[]> {
  const all = (await tx<ExportRecord[]>("exports", "readonly", (s) => s.getAll())) ?? [];
  return all.sort((a, b) => b.at - a.at).slice(0, 12);
}

export async function clearExports(): Promise<void> {
  await tx("exports", "readwrite", (s) => s.clear());
}

/* ---------------- settings ---------------- */

export const DEFAULT_SETTINGS: AppSettings = {
  dpi: 600,
  format: "jpg",
  quality: 0.95,
  guides: true,
  labels: false,
  paperKey: "4x5",
  margin: 0.15,
  gap: 0.08,
  rememberProjects: true,
};

export async function loadSettings(): Promise<AppSettings> {
  const row = await tx<{ key: string; value: AppSettings }>("settings", "readonly", (s) => s.get("app"));
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export async function persistSettings(value: AppSettings): Promise<void> {
  await tx("settings", "readwrite", (s) => s.put({ key: "app", value }));
}

/** Wipes every locally stored record (projects + export log + settings). */
export async function clearAllData(): Promise<void> {
  await clearProjects();
  await clearExports();
  await tx("settings", "readwrite", (s) => s.clear());
}
