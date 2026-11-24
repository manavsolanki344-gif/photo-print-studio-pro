import React from "react";
import { Check, X, TriangleExclamationPoint } from "lucide-react";
import { Sidebar, Logo } from "@/components/Sidebar";
import { StudioCtx, type IncomingFile, type SheetDraft, type SheetSeed } from "@/lib/studio";
import type { AppSettings, DocItem, ExportRecord, Paper, ViewId } from "@/lib/types";
import { ImageStore } from "@/lib/images";
import { DEFAULT_SETTINGS, addExport, loadSettings, persistSettings } from "@/lib/db";
import { PAPERS, paperPixels } from "@/lib/paper";
import { cn } from "@/components/ui";

import Dashboard from "@/modules/Dashboard";
import PassportMaker from "@/modules/PassportMaker";
import IdCropper from "@/modules/IdCropper";
import SheetEditor from "@/modules/SheetEditor";
import Projects from "@/modules/Projects";
import SettingsView from "@/modules/Settings";

const TITLES: Record<ViewId, { title: string; sub: string }> = {
  dashboard: { title: "Dashboard", sub: "Studio overview" },
  passport: { title: "Passport Photo Maker", sub: "Crop, size and duplicate to a glossy sheet" },
  idcrop: { title: "ID Card Cropper", sub: "PDF viewer with exact front & back selection" },
  sheet45: { title: "4 × 5 Photo Printing", sub: "Landscape gloss sheet — 5.00 × 4.00 in" },
  sheet46: { title: "4 × 6 Photo Printing", sub: "Landscape gloss sheet — 6.00 × 4.00 in" },
  custom: { title: "Custom Print Layout", sub: "Free arrangement on 4 × 5 or 4 × 6 paper" },
  projects: { title: "Recent Projects", sub: "Saved locally in this browser" },
  settings: { title: "Settings", sub: "Paper, resolution and export defaults" },
};

export default function App() {
  const storeRef = React.useRef<ImageStore>(null as unknown as ImageStore);
  if (!storeRef.current) storeRef.current = new ImageStore();

  const [view, setView] = React.useState<ViewId>("dashboard");
  const [settings, setSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = React.useState(false);
  const [seed, setSeed] = React.useState<SheetSeed | null>(null);
  const [draft, setDraft] = React.useState<SheetDraft | null>(null);
  const [incoming, setIncoming] = React.useState<IncomingFile>(null);
  const [toast, setToast] = React.useState<{ msg: string; kind: "ok" | "error" } | null>(null);

  React.useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setReady(true);
    });
  }, []);

  const patchSettings = React.useCallback((p: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...p };
      void persistSettings(next);
      return next;
    });
  }, []);

  const notify = React.useCallback((msg: string, kind: "ok" | "error" = "ok") => {
    setToast({ msg, kind });
    window.clearTimeout((window as unknown as { __tt?: number }).__tt);
    (window as unknown as { __tt?: number }).__tt = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const navigate = React.useCallback(
    (v: ViewId) => {
      setView(v);
    },
    [],
  );

  const toSheet = React.useCallback(
    (items: DocItem[], paper: Paper, title?: string) => {
      setSeed({ items, paper, title });
      setView(paper.w === 6 && paper.h === 4 ? "sheet46" : paper.w === 5 && paper.h === 4 ? "sheet45" : "custom");
    },
    [],
  );

  const consumeSeed = React.useCallback(() => {
    const s = seed;
    if (s) setSeed(null);
    return s;
  }, [seed]);

  const logExport = React.useCallback(
    (r: Omit<ExportRecord, "id">) => {
      void addExport({ ...r, id: `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` });
    },
    [],
  );

  const api = React.useMemo(
    () => ({
      store: storeRef.current,
      settings,
      patchSettings,
      navigate,
      view,
      toSheet,
      seed,
      consumeSeed,
      draft,
      setDraft,
      incoming,
      setIncoming,
      notify,
      logExport,
    }),
    [settings, patchSettings, navigate, view, toSheet, seed, consumeSeed, draft, incoming, notify, logExport],
  );

  const paper: Paper = settings.paperKey === "4x6" ? PAPERS["4x6"] : PAPERS["4x5"];
  const px = paperPixels(paper, settings.dpi);
  const quickRef = React.useRef<HTMLInputElement>(null);

  const quickUpload = (file: File) => {
    const kind = file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf" : "image";
    setIncoming({ file, kind, from: view });
    setView(kind === "pdf" ? "idcrop" : "passport");
  };

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <div className="flex items-center gap-3 text-muted">
          <Logo size={26} />
          <span className="num text-[12px] tracking-wide">LOADING STUDIO…</span>
        </div>
      </div>
    );
  }

  return (
    <StudioCtx.Provider value={api}>
      <div id="app-root" className="flex h-full w-full overflow-hidden bg-canvas">
        <Sidebar view={view} onNavigate={navigate} onQuickUpload={() => quickRef.current?.click()} />

        <div className="flex min-w-0 flex-1 flex-col">
          <input
            ref={quickRef}
            type="file"
            className="hidden"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) quickUpload(f);
              e.target.value = "";
            }}
          />
          <header className="flex h-[64px] shrink-0 items-center justify-between gap-6 border-b border-line bg-white px-6 2xl:h-[76px] 2xl:px-8">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5">
                <h1 className="truncate text-[17.5px] font-bold tracking-[-0.015em] text-ink 2xl:text-[21px]">
                  {TITLES[view].title}
                </h1>
                <span className="hidden truncate text-[13px] text-muted lg:block 2xl:text-[14.5px]">{TITLES[view].sub}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-lg border border-line bg-[#fafbfd] px-2.5 py-1.5 md:flex">
                <span className="label">Paper</span>
                <span className="num text-[13px] font-medium text-ink">
                  {paper.w.toFixed(2)} × {paper.h.toFixed(2)} in
                </span>
                <span className="h-3.5 w-px bg-line" />
                <span className="num text-[13px] font-medium text-brand">
                  {px.w} × {px.h} px
                </span>
                <span className="num rounded bg-wash px-1.5 py-0.5 text-[11px] font-medium text-brand">
                  {settings.dpi} DPI
                </span>
              </div>
              <button className="btn" onClick={() => setView("projects")}>
                Projects
              </button>
              <button className="btn btn-primary" onClick={() => quickRef.current?.click()}>
                New job
              </button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden bg-canvas">
            {view === "dashboard" && <Dashboard />}
            {view === "passport" && <PassportMaker />}
            {view === "idcrop" && <IdCropper />}
            {view === "sheet45" && <SheetEditor key="s45" fixedPaper={PAPERS["4x5"]} title="4 × 5 sheet" />}
            {view === "sheet46" && <SheetEditor key="s46" fixedPaper={PAPERS["4x6"]} title="4 × 6 sheet" />}
            {view === "custom" && <SheetEditor key="scustom" allowPaperSwitch title="Custom layout" />}
            {view === "projects" && <Projects />}
            {view === "settings" && <SettingsView />}
          </main>

          <footer className="flex h-[34px] shrink-0 items-center justify-between gap-4 border-t border-line bg-white px-6 text-[11.5px] text-muted 2xl:h-[38px] 2xl:text-[12.5px]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" /> Local session · nothing uploaded
              </span>
              <span className="hidden lg:inline">Ctrl+Z undo · Ctrl+Y redo · Del remove · Ctrl+S save · Ctrl+P print</span>
            </div>
            <div className="num flex items-center gap-3 text-[11.5px]">
              <span className="text-ink">
                {paper.w.toFixed(2)} × {paper.h.toFixed(2)} in
              </span>
              <span className="text-brand">
                {settings.dpi} DPI · {px.w} × {px.h} px
              </span>
            </div>
          </footer>
        </div>

        {toast && (
          <div
            className={cn(
              "fade-in fixed bottom-10 right-6 z-50 flex max-w-[420px] items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12.5px] shadow-lg",
              toast.kind === "ok"
                ? "border-[#bfe3d3] bg-[#eefaf5] text-[#146247]"
                : "border-[#f2c9c1] bg-[#fdf1ef] text-[#96321f]",
            )}
          >
            <span className="mt-px shrink-0">
              {toast.kind === "ok" ? <Check size={15} strokeWidth={2.4} /> : <TriangleExclamationPoint size={15} strokeWidth={2.2} />}
            </span>
            <span className="flex-1">{toast.msg}</span>
            <button onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </StudioCtx.Provider>
  );
}


