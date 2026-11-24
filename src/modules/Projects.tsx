import React from "react";
import { FolderClock, FolderOpen, Trash, Pencil, FileDown, RefreshCw } from "lucide-react";
import { useStudio } from "@/lib/studio";
import type { ExportRecord, ProjectRecord } from "@/lib/types";
import { paperLabel } from "@/lib/paper";
import { clearExports, clearProjects, deleteProject, getProject, listExports, listProjects, saveProject } from "@/lib/db";
import { loadImage } from "@/lib/images";
import { cn, Modal, Notice, Panel } from "@/components/ui";

export default function Projects() {
  const { store, notify, toSheet } = useStudio();
  const [projects, setProjects] = React.useState<ProjectRecord[]>([]);
  const [exports, setExports] = React.useState<ExportRecord[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: "clear" | "delete"; id?: string; name?: string } | null>(null);

  const refresh = React.useCallback(async () => {
    const [p, e] = await Promise.all([listProjects(), listExports()]);
    setProjects(p);
    setExports(e);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = async (id: string) => {
    setBusy(id);
    try {
      const p = await getProject(id);
      if (!p) return notify("That project is no longer available.", "error");
      const items = [...p.items];
      for (const [imgId, dataUrl] of Object.entries(p.images)) {
        if (store.has(imgId)) continue;
        try {
          const img = await loadImage(dataUrl);
          store.add(img, imgId);
        } catch {
          /* skip unreadable image */
        }
      }
      toSheet(items, p.paper, p.name);
      notify(`Opened “${p.name}”`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const rename = async (p: ProjectRecord) => {
    const next = window.prompt("Rename project", p.name);
    if (!next || next.trim() === p.name) return;
    const rec = { ...p, name: next.trim(), updatedAt: Date.now() };
    await saveProject(rec);
    notify("Project renamed");
    void refresh();
  };

  const doDelete = async () => {
    if (confirm?.id) {
      await deleteProject(confirm.id);
      notify("Project deleted");
    }
    setConfirm(null);
    void refresh();
  };

  const clearAll = async () => {
    await clearProjects();
    await clearExports();
    store.clear();
    notify("All local projects and export history cleared.");
    setConfirm(null);
    void refresh();
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7">
          <Panel
            title={`Saved projects (${projects.length})`}
            right={
              <div className="flex gap-1.5">
                <button className="btn btn-sm" onClick={() => void refresh()}>
                  <RefreshCw size={12} /> Refresh
                </button>
                <button className="btn btn-sm" onClick={() => setConfirm({ kind: "clear" })}>
                  <Trash size={12} /> Clear all
                </button>
              </div>
            }
            bodyClass="p-0"
          >
            {projects.length === 0 ? (
              <div className="grid place-items-center px-6 py-14 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-wash text-brand">
                  <FolderClock size={22} strokeWidth={1.75} />
                </span>
                <div className="mt-3 text-[14px] font-semibold text-ink">No projects stored yet</div>
                <p className="mt-1 max-w-[420px] text-[12.5px] leading-snug text-muted">
                  Work is never saved automatically. Press <span className="num text-ink">Ctrl + S</span> in a print
                  editor to keep its paper size, arrangement and images in this browser — and nowhere else.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line2">
                {projects.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-wash text-brand">
                      <FolderOpen size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">{p.name}</div>
                      <div className="num text-[11px] text-muted">
                        {paperLabel(p.paper)} · {p.items.length} objects · {Object.keys(p.images).length} image
                        {Object.keys(p.images).length === 1 ? "" : "s"} · {new Date(p.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button className="btn btn-sm" onClick={() => void open(p.id)} disabled={busy === p.id}>
                        <FolderOpen size={12} /> Open
                      </button>
                      <button className="icon-btn h-7 w-7" title="Rename" onClick={() => void rename(p)}>
                        <Pencil size={12} />
                      </button>
                      <button
                        className="icon-btn h-7 w-7"
                        title="Delete"
                        onClick={() => setConfirm({ kind: "delete", id: p.id, name: p.name })}
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="mt-4">
            <Notice kind="info">
              Projects store image copies inside IndexedDB. Sensitive documents are kept only when you explicitly save —
              use <b>Clear all</b> to remove every local record from this computer.
            </Notice>
          </div>
        </div>

        <div className="col-span-12 xl:col-span-5">
          <Panel title="Recently exported files" bodyClass="p-0">
            {exports.length === 0 ? (
              <div className="px-5 py-10 text-center text-[12.5px] text-muted">
                <FileDown size={20} className="mx-auto mb-2 text-muted" />
                Your last 12 exports will be listed here with paper size and resolution.
              </div>
            ) : (
              <ul className="divide-y divide-line2">
                {exports.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-semibold text-ink">{e.name}</div>
                      <div className="num text-[11px] text-muted">
                        {e.kind.toUpperCase()} · {e.paper} · {e.dpi} DPI · {e.pixels} px
                      </div>
                    </div>
                    <span className="num shrink-0 text-[11px] text-muted">{new Date(e.at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
            {exports.length > 0 && (
              <div className="border-t border-line2 px-4 py-2.5">
                <button className="btn btn-sm" onClick={() => void clearExports().then(refresh)}>
                  <Trash size={12} /> Clear history
                </button>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Modal
        open={!!confirm}
        title={confirm?.kind === "clear" ? "Clear everything?" : "Delete project?"}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button className="btn" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className={cn("btn", "btn-primary")}
              onClick={confirm?.kind === "clear" ? clearAll : doDelete}
            >
              {confirm?.kind === "clear" ? (
                <>
                  <Trash size={14} /> Clear all data
                </>
              ) : (
                <>
                  <Trash size={14} /> Delete
                </>
              )}
            </button>
          </>
        }
      >
        {confirm?.kind === "clear" ? (
          <p>
            This removes <b>every saved project, image copy and export record</b> stored by this app in the browser.
            Files already downloaded to your Downloads folder are not affected.
          </p>
        ) : (
          <p>
            Delete <b>{confirm?.name}</b>? This cannot be undone.
          </p>
        )}
      </Modal>
    </div>
  );
}
