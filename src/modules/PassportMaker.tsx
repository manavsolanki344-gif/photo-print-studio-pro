import React from "react";
import {
  Aperture,
  Upload,
  RotateCcw,
  RotateCw,
  Undo2,
  Redo2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  FileDown,
  Printer,
  Eye,
  Scissors,
  Ruler,
} from "lucide-react";
import emptyPassport from "@/assets/empty-passport.jpg";
import { useStudio } from "@/lib/studio";
import type { CropRect, DocItem, ExportFormat, Paper, PassportSize } from "@/lib/types";
import {
  DPI_OPTIONS,
  PAPERS,
  PASSPORT_SIZES,
  COPY_PRESETS,
  fmt,
  inToMm,
  paperLabel,
  paperPixels,
  sizeToInches,
} from "@/lib/paper";
import { exportSheet, layoutGrid, printSheet, renderSheet, type ExportJob } from "@/lib/sheet";
import {
  NEUTRAL_FILTER,
  cropCanvas,
  fileToImage,
  filterCss,
  rotateQuarter,
  loadImageFromCanvas,
  type FilterState,
} from "@/lib/images";
import { cn, NumInput, Row, Seg, Slider } from "@/components/ui";

interface EditSnap {
  rot: number;
  crop: CropRect;
  filter: FilterState;
  sizeId: string;
}

export default function PassportMaker() {
  const { settings, patchSettings, incoming, setIncoming, notify, toSheet, logExport, store } = useStudio();

  const [src, setSrc] = React.useState<{ img: HTMLImageElement; name: string } | null>(null);
  const [rot, setRot] = React.useState(0);
  const [crop, setCrop] = React.useState<CropRect>({ x: 0, y: 0, w: 100, h: 100 });
  const [filter, setFilter] = React.useState<FilterState>(NEUTRAL_FILTER);
  const [sizeId, setSizeId] = React.useState("35x45");
  const [custom, setCustom] = React.useState({ w: 68, h: 45, unit: "mm" as "mm" | "in" });
  const [paperKey, setPaperKey] = React.useState<"4x5" | "4x6">(settings.paperKey);
  const [copies, setCopies] = React.useState(8);
  const [margin, setMargin] = React.useState(settings.margin);
  const [gap, setGap] = React.useState(settings.gap);
  const [guides, setGuides] = React.useState(true);
  const [labels, setLabels] = React.useState(false);
  const [photoBorder, setPhotoBorder] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [aspectLock, setAspectLock] = React.useState(true);
  const [tab, setTab] = React.useState<"photo" | "sheet">("photo");
  const [dpi, setDpi] = React.useState<number>(settings.dpi);
  const [format, setFormat] = React.useState<ExportFormat>(settings.format);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [tick, setTick] = React.useState(0);

  const undoRef = React.useRef<EditSnap[]>([]);
  const redoRef = React.useRef<EditSnap[]>([]);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState({ w: 700, h: 520 });
  const displayRef = React.useRef<HTMLCanvasElement>(null);
  const sheetRef = React.useRef<HTMLCanvasElement>(null);
  const dragRef = React.useRef<
    | { mode: "new" | "move" | "nw" | "ne" | "sw" | "se"; start: CropRect; px: { x: number; y: number } }
    | null
  >(null);


  const size: PassportSize = sizeId === "custom" ? { id: "custom", label: "Custom", ...custom } : PASSPORT_SIZES.find((s) => s.id === sizeId)!;
  const photoIn = sizeToInches(size);
  const aspect = photoIn.w / photoIn.h;
  const paper: Paper = PAPERS[paperKey];

  const working = React.useMemo<HTMLCanvasElement | HTMLImageElement | null>(() => {
    if (!src) return null;
    if (!rot) return src.img;
    return rotateQuarter(src.img, src.img.naturalWidth, src.img.naturalHeight, rot);
  }, [src, rot]);

  const workingSize = !working
    ? { w: 0, h: 0 }
    : working instanceof HTMLImageElement
      ? { w: working.naturalWidth, h: working.naturalHeight }
      : { w: working.width, h: working.height };

  /* ---------------- history ---------------- */
  const snapshot = (): EditSnap => ({ rot, crop: { ...crop }, filter: { ...filter }, sizeId });
  const applySnap = (s: EditSnap) => {
    setRot(s.rot);
    setCrop(s.crop);
    setFilter(s.filter);
    setSizeId(s.sizeId);
  };
  const push = React.useCallback(() => {
    undoRef.current.push(snapshot());
    if (undoRef.current.length > 60) undoRef.current.shift();
    redoRef.current = [];
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rot, crop, filter, sizeId]);

  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(snapshot());
    applySnap(prev);
    setTick((t) => t + 1);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(snapshot());
    applySnap(next);
    setTick((t) => t + 1);
  };

  /* ---------------- crop fitting ---------------- */
  const fitCrop = React.useCallback(
    (w: number, h: number, ar: number) => {
      let cw = w * 0.94;
      let ch = cw / ar;
      if (ch > h * 0.94) {
        ch = h * 0.94;
        cw = ch * ar;
      }
      return { x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), w: Math.round(cw), h: Math.round(ch) };
    },
    [],
  );

  React.useEffect(() => {
    if (!working) return;
    setCrop(fitCrop(workingSize.w, workingSize.h, aspect));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working, aspect, src]);

  /* ---------------- incoming file ---------------- */
  const loadFile = React.useCallback(
    async (file: File) => {
      try {
        const { img, url } = await fileToImage(file);
        setSrc({ img, name: file.name });
        store.add(img, undefined, url);
        setRot(0);
        setFilter(NEUTRAL_FILTER);
        undoRef.current = [];
        redoRef.current = [];
        setErrors([]);
        notify(`Loaded ${file.name} — ${img.naturalWidth} × ${img.naturalHeight} px`);
      } catch (e) {
        setErrors([e instanceof Error ? e.message : String(e)]);
      }
    },
    [notify, store],
  );

  const consumedRef = React.useRef<File | null>(null);
  React.useEffect(() => {
    if (incoming?.kind === "image" && incoming.file !== consumedRef.current) {
      consumedRef.current = incoming.file;
      void loadFile(incoming.file);
      setIncoming(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  /* ---------------- display ---------------- */
  React.useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitScale = React.useMemo(
    () => (workingSize.w ? Math.max(0.02, Math.min((box.w - 72) / workingSize.w, (box.h - 72) / workingSize.h, 1)) : 0.1),
    [box.w, box.h, workingSize.w, workingSize.h],
  );
  const scale = fitScale * zoom;

  React.useEffect(() => {
    const canvas = displayRef.current;
    if (!canvas || !working) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(workingSize.w * scale));
    const H = Math.max(1, Math.round(workingSize.h * scale));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.filter = filterCss(filter);
    ctx.drawImage(working, 0, 0, W, H);
    ctx.filter = "none";
  }, [working, scale, filter, workingSize.w, workingSize.h, tick]);

  /* ---------------- pointer crop ---------------- */
  const toImage = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const clampRect = (r: CropRect): CropRect => {
    const w = workingSize.w;
    const h = workingSize.h;
    const rw = Math.max(8, Math.min(r.w, w));
    const rh = Math.max(8, Math.min(r.h, h));
    return {
      x: Math.round(Math.max(0, Math.min(r.x, w - rw))),
      y: Math.round(Math.max(0, Math.min(r.y, h - rh))),
      w: Math.round(rw),
      h: Math.round(rh),
    };
  };

  const onCropDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!working) return;
    const handle = (e.target as HTMLElement).dataset?.h as "nw" | "ne" | "sw" | "se" | "move" | undefined;
    const p = toImage(e);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const inside =
      p.x >= crop.x && p.x <= crop.x + crop.w && p.y >= crop.y && p.y <= crop.y + crop.h;
    const mode = handle ?? (inside ? "move" : "new");
    push();
    dragRef.current = { mode, start: { ...crop }, px: p };
    if (mode === "new") setCrop({ x: Math.round(p.x), y: Math.round(p.y), w: 1, h: 1 });
  };

  const onCropMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toImage(e);

    if (d.mode === "new") {
      let x = Math.min(d.px.x, p.x);
      let y = Math.min(d.px.y, p.y);
      let cw = Math.abs(p.x - d.px.x);
      let ch = Math.abs(p.y - d.px.y);
      if (aspectLock) {
        if (cw / Math.max(1, ch) > aspect) ch = cw / aspect;
        else cw = ch * aspect;
        if (p.x < d.px.x) x = d.px.x - cw;
        if (p.y < d.px.y) y = d.px.y - ch;
      }
      setCrop(clampRect({ x, y, w: cw, h: ch }));
      return;
    }

    if (d.mode === "move") {
      setCrop(clampRect({ x: d.start.x + (p.x - d.px.x), y: d.start.y + (p.y - d.px.y), w: d.start.w, h: d.start.h }));
      return;
    }

    const s = d.start;
    const fx = d.mode.includes("w") ? s.x + s.w : s.x;
    const fy = d.mode.includes("n") ? s.y + s.h : s.y;
    const dirX = d.mode.includes("w") ? -1 : 1;
    const dirY = d.mode.includes("n") ? -1 : 1;
    let nw = Math.max(8, Math.abs(p.x - fx));
    let nh = Math.max(8, Math.abs(p.y - fy));
    if (aspectLock) {
      if (nw / nh > aspect) nh = nw / aspect;
      else nw = nh * aspect;
    }
    const nx = dirX < 0 ? fx - nw : fx;
    const ny = dirY < 0 ? fy - nh : fy;
    setCrop(clampRect({ x: nx, y: ny, w: nw, h: nh }));
  };

  const endCrop = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setTick((t) => t + 1);
    }
  };

  /* ---------------- generated sheet ---------------- */
  const [sheetImage, setSheetImage] = React.useState<HTMLImageElement | null>(null);
  const [sheetImgId, setSheetImgId] = React.useState<string | null>(null);

  const generate = React.useCallback(async () => {
    if (!working) return notify("Upload a photograph first.", "error");
    try {
      const cropped = cropCanvas(working, crop, { filter });
      const img = await loadImageFromCanvas(cropped);
      if (sheetImgId) store.remove(sheetImgId);
      const id = store.add(img);
      setSheetImage(img);
      setSheetImgId(id);
      setTab("sheet");
      notify(`${copies} passport photo${copies > 1 ? "s" : ""} ready on ${paperLabel(paper)}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  }, [working, crop, filter, sheetImgId, store, copies, paper, notify]);

  const buildItems = React.useCallback((): DocItem[] => {
    if (!sheetImage) return [];
    const id = sheetImgId ?? sheetImage.src.slice(0, 0);
    if (!id) return [];
    const cells = layoutGrid(copies, paper.w, paper.h, { margin, gap, aspect });
    return cells.map((c, i) => ({ id: `p_${i}_${Date.now().toString(36)}`, imgId: id, x: c.x, y: c.y, w: c.w, h: c.h, rot: 0, border: photoBorder, name: `Passport ${i + 1}` }));
  }, [sheetImage, sheetImgId, copies, paper, margin, gap, aspect, photoBorder]);

  const items = buildItems();
  const capacity = React.useMemo(() => {
    const cells = layoutGrid(copies, paper.w, paper.h, { margin, gap, aspect });
    if (!cells.length) return null;
    const photoW = cells[0].w;
    const photoH = cells[0].h;
    const need = photoIn.w;
    return { photoW, photoH, ratio: photoW / need, fits: photoW >= need - 0.005 };
  }, [copies, paper, margin, gap, aspect, photoIn.w]);

  /* sheet preview drawing */
  React.useEffect(() => {
    const canvas = sheetRef.current;
    if (!canvas || tab !== "sheet") return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availW = Math.max(200, box.w - 96);
    const availH = Math.max(160, box.h - 96);
    const s = Math.min(availW / paper.w, availH / paper.h, 320);
    const W = Math.round(paper.w * s);
    const H = Math.round(paper.h * s);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const imgs = new Map<string, HTMLImageElement>();
    if (sheetImage && sheetImgId) imgs.set(sheetImgId, sheetImage);
    renderSheet(ctx, {
      paperW: paper.w,
      paperH: paper.h,
      items,
      images: imgs,
      scale: s,
      guides,
      labels,
      margin,
      background: "#ffffff",
    });
  }, [tab, items, paper, margin, gap, guides, labels, sheetImage, sheetImgId, box.w, box.h, tick]);

  /* ---------------- export ---------------- */
  const job = (): ExportJob => ({
    paperW: paper.w,
    paperH: paper.h,
    paperName: paperLabel(paper),
    items,
    images: new Map(items.length && sheetImage && sheetImgId ? [[sheetImgId, sheetImage]] : []),
    dpi,
    guides,
    labels,
    margin,
    format,
    quality: settings.quality,
    name: `passport-${copies}-up`,
  });

  const doExport = async (fmt?: ExportFormat) => {
    if (!items.length) return notify("Click GENERATE SHEET first.", "error");
    const f = fmt ?? format;
    setBusy(`EXPORTING ${f.toUpperCase()}`);
    try {
      const res = await exportSheet({ ...job(), format: f });
      logExport({
        name: res.filename,
        kind: f,
        at: Date.now(),
        paper: paperLabel(paper),
        dpi,
        pixels: `${res.width} × ${res.height}`,
      });
      setFormat(f);
      patchSettings({ dpi, format: f, paperKey });
      notify(`Saved ${res.filename} — ${res.width} × ${res.height} px`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const doPrint = async () => {
    if (!items.length) return notify("Click GENERATE SHEET first.", "error");
    setBusy("PREPARING PRINT");
    try {
      await printSheet(job());
      notify("Print dialog opened — choose 100 % / Actual size, no scaling.");
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const openInEditor = () => {
    if (!items.length) return notify("Generate the sheet first.", "error");
    toSheet(items, paper, `Passport ${copies}-up ${paperLabel(paper)}`);
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  React.useEffect(() => {
    if (settings.paperKey !== paperKey) patchSettings({ paperKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperKey]);

  const px = paperPixels(paper, dpi);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* ═══════════════ LEFT PANEL — fully expanded, large text ═══════════════ */}
        <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-r border-line bg-white xl:w-[360px] 2xl:w-[400px]">

          {/* ── STEP 1: UPLOAD ── */}
          <div className="border-b border-line2 bg-[#f7f9fc] px-4 py-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand">Step 1 · Upload Photo</div>
            <label className="block cursor-pointer">
              <div
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[#b9c8e6] bg-white px-4 py-5 text-center transition-colors hover:border-brand hover:bg-wash"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
              >
                <Upload size={28} className="text-brand" strokeWidth={1.6} />
                <span className="text-[15px] font-bold text-ink">
                  {src ? "Replace photo" : "Upload your photo"}
                </span>
                <span className="text-[13px] text-muted">JPG · PNG · WebP · drag & drop</span>
              </div>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }} />
            </label>
            {src && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2">
                <img src={src.img.src} alt="" className="h-14 w-14 rounded-lg border border-line object-cover" />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-ink">{src.name}</div>
                  <div className="num mt-0.5 text-[12px] text-muted">
                    {src.img.naturalWidth} × {src.img.naturalHeight} px
                    {rot ? ` · rotated ${rot * 90}°` : ""}
                  </div>
                </div>
              </div>
            )}
            {errors.length > 0 && <div className="mt-2 text-[13px] font-medium text-danger">{errors[0]}</div>}
          </div>

          {/* ── STEP 2: PHOTO SIZE ── */}
          <div className="border-b border-line2 px-4 py-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand">Step 2 · Photo Size</div>
            <select
              className="field w-full text-[14px]"
              style={{ height: 38 }}
              value={sizeId}
              onChange={(e) => { push(); setSizeId(e.target.value); }}
            >
              {PASSPORT_SIZES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            {sizeId === "custom" && (
              <div className="mt-2 flex items-center gap-2">
                <NumInput value={custom.w} onChange={(v) => setCustom((c) => ({ ...c, w: v }))} suffix="w" width={80} />
                <span className="text-[16px] font-medium text-muted">×</span>
                <NumInput value={custom.h} onChange={(v) => setCustom((c) => ({ ...c, h: v }))} suffix="h" width={80} />
                <Seg value={custom.unit} onChange={(v) => setCustom((c) => ({ ...c, unit: v }))}
                  options={[{ value: "mm", label: "mm" }, { value: "in", label: "in" }]} />
              </div>
            )}
            <div className="num mt-2 flex items-center justify-between rounded-lg bg-[#f7f9fc] px-3 py-2 text-[13px]">
              <span className="text-muted">Size:</span>
              <span className="font-semibold text-ink">
                {inToMm(photoIn.w).toFixed(1)} × {inToMm(photoIn.h).toFixed(1)} mm
              </span>
              <span className="text-muted">/</span>
              <span className="font-semibold text-ink">
                {fmt(photoIn.w, 3)} × {fmt(photoIn.h, 3)} in
              </span>
            </div>
          </div>

          {/* ── STEP 3: COPIES & PAPER ── */}
          <div className="border-b border-line2 px-4 py-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand">Step 3 · Copies & Paper</div>

            {/* Paper size selector */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(["4x5", "4x6"] as const).map(k => {
                const p = PAPERS[k];
                const on = paperKey === k;
                return (
                  <button key={k} onClick={() => setPaperKey(k)}
                    className={cn("flex flex-col items-center rounded-xl border-2 p-3 transition-all",
                      on ? "border-brand bg-wash" : "border-line hover:border-brand/40")}>
                    <span className={cn("num text-[18px] font-black", on ? "text-brand" : "text-ink")}>
                      {k === "4x5" ? "4×5" : "4×6"}
                    </span>
                    <span className="text-[12px] font-medium text-muted">inches</span>
                    <span className={cn("num mt-1 text-[11px]", on ? "text-brand" : "text-muted")}>
                      {p.w}×{p.h} in
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Number of copies */}
            <div className="mb-1 text-[13px] font-semibold text-ink">Number of copies</div>
            <div className="grid grid-cols-4 gap-2">
              {COPY_PRESETS.map((n) => (
                <button key={n} onClick={() => setCopies(n)}
                  className={cn("num h-10 rounded-xl border-2 text-[16px] font-bold transition-all",
                    copies === n ? "border-brand bg-brand text-white shadow-md" : "border-line text-ink hover:border-brand hover:bg-wash")}>
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-[13px] text-body">Custom:</span>
              <NumInput value={copies} min={1} max={60} onChange={(v) => setCopies(Math.max(1, Math.min(60, Math.round(v))))} width={80} />
              <span className="text-[13px] text-muted">copies</span>
            </div>

            {/* Margin / Gap */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-[12px] font-semibold text-ink">Margin</div>
                <NumInput value={margin} step={0.01} suffix="in" width={100} onChange={(v) => setMargin(Math.max(0, v))} />
              </div>
              <div>
                <div className="mb-1 text-[12px] font-semibold text-ink">Gap between</div>
                <NumInput value={gap} step={0.01} suffix="in" width={100} onChange={(v) => setGap(Math.max(0, v))} />
              </div>
            </div>

            <div className="mt-2 flex gap-2">
              <button className={cn("btn btn-sm flex-1 text-[13px]", guides && "border-brand bg-wash text-brand")} onClick={() => setGuides((g) => !g)}>
                <Ruler size={13} /> Guides
              </button>
              <button className={cn("btn btn-sm flex-1 text-[13px]", labels && "border-brand bg-wash text-brand")} onClick={() => setLabels((l) => !l)}>
                Labels
              </button>
            </div>
            <div className="mt-2">
              <button className={cn("btn btn-sm w-full text-[13px]", photoBorder && "border-brand bg-wash text-brand")} onClick={() => setPhotoBorder((b) => !b)}>
                <div className="flex items-center gap-1.5 w-full justify-center">
                  <div className={cn("h-3 w-3 border", photoBorder ? "border-brand bg-white" : "border-muted")} />
                  {photoBorder ? "Photo border: ON" : "Photo border: OFF"}
                </div>
              </button>
            </div>
          </div>

          {/* ── STEP 4: ADJUSTMENTS ── */}
          <div className="border-b border-line2 px-4 py-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand">Step 4 · Adjustments</div>
            <Row label="Brightness">
              <Slider value={filter.brightness} min={50} max={150} onChange={(v) => { push(); setFilter((f) => ({ ...f, brightness: v })); }} suffix="%" />
            </Row>
            <Row label="Contrast">
              <Slider value={filter.contrast} min={50} max={150} onChange={(v) => { push(); setFilter((f) => ({ ...f, contrast: v })); }} suffix="%" />
            </Row>
            <Row label="Saturation">
              <Slider value={filter.saturation} min={0} max={200} onChange={(v) => { push(); setFilter((f) => ({ ...f, saturation: v })); }} suffix="%" />
            </Row>
            <button className="btn btn-sm mt-2 w-full" onClick={() => { push(); setFilter(NEUTRAL_FILTER); }}>
              <RefreshCw size={13} /> Reset adjustments
            </button>
          </div>

          {/* ── STEP 5: GENERATE & EXPORT ── */}
          <div className="px-4 py-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand">Step 5 · Generate & Download</div>

            {capacity && (
              <div className={cn("mb-3 rounded-xl px-3 py-2 text-[13px]", capacity.fits ? "bg-[#eefaf5] text-[#146247]" : "bg-[#fff6e8] text-[#a35a00]")}>
                {capacity.fits ? "✓ " : "⚠ "}
                {copies} copies at {fmt(capacity.photoW, 2)} × {fmt(capacity.photoH, 2)} in each
                {!capacity.fits && " — reduce copies or use 4×6"}
              </div>
            )}

            {/* BIG generate button */}
            <button className="btn btn-primary mb-3 h-12 w-full text-[16px] font-bold" onClick={() => void generate()} disabled={!src}>
              <Scissors size={18} /> Generate {copies} Copies
            </button>

            {/* Paper info */}
            <div className="num mb-3 flex items-center justify-between rounded-lg bg-[#f7f9fc] px-3 py-2 text-[13px]">
              <span className="text-muted">{paperLabel(paper)} output:</span>
              <span className="font-bold text-ink">{px.w} × {px.h} px</span>
            </div>

            {/* Resolution selector */}
            <div className="mb-3">
              <div className="mb-1.5 text-[13px] font-semibold text-ink">Resolution (DPI)</div>
              <div className="grid grid-cols-4 gap-1.5">
                {DPI_OPTIONS.map(d => (
                  <button key={d} onClick={() => setDpi(d)}
                    className={cn("num h-9 rounded-xl border-2 text-[13px] font-bold transition-all",
                      dpi === d ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand")}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Download buttons */}
            <div className="mb-2 text-[13px] font-semibold text-ink">Download as:</div>
            <div className="grid grid-cols-3 gap-2">
              <button className="btn btn-primary h-11 flex-col gap-0.5 text-[14px] font-bold"
                onClick={() => void doExport("jpg")} disabled={!!busy || !items.length}>
                <FileDown size={15} />
                <span>JPG</span>
              </button>
              <button className="btn h-11 flex-col gap-0.5 text-[14px] font-bold"
                onClick={() => void doExport("png")} disabled={!!busy || !items.length}>
                <FileDown size={15} />
                <span>PNG</span>
              </button>
              <button className="btn h-11 flex-col gap-0.5 text-[14px] font-bold"
                onClick={() => void doExport("pdf")} disabled={!!busy || !items.length}>
                <FileDown size={15} />
                <span>PDF</span>
              </button>
            </div>
            <button className="btn mt-2 w-full text-[14px]" onClick={() => void doPrint()} disabled={!!busy || !items.length}>
              <Printer size={15} /> Print at actual size
            </button>
            <button className="btn mt-1.5 w-full text-[13px]" onClick={openInEditor} disabled={!items.length}>
              <Eye size={14} /> Open in layout editor
            </button>

            {/* Crop readout — compact */}
            {src && (
              <div className="num mt-3 rounded-lg bg-[#f7f9fc] px-3 py-2 text-[12px]">
                <div className="mb-1 font-semibold text-ink">Crop info</div>
                <div className="flex justify-between text-muted">
                  <span>Source</span><span className="text-ink">{Math.round(crop.w)} × {Math.round(crop.h)} px</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Print</span><span className="text-ink">{inToMm(photoIn.w).toFixed(1)} × {inToMm(photoIn.h).toFixed(1)} mm</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Sheet</span><span className="text-brand font-semibold">{px.w} × {px.h} px @ {dpi} DPI</span>
                </div>
              </div>
            )}

            <div className="mt-3 rounded-lg bg-[#eef3ff] px-3 py-2 text-[12px] text-[#17408f]">
              ℹ️ Set printer to <b>100% / Actual size</b> (no scaling). PDF page = {fmt(paper.w, 2)} × {fmt(paper.h, 2)} in.
            </div>
          </div>
        </aside>

        {/* ---------------- CENTER ---------------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[46px] shrink-0 items-center justify-between gap-3 overflow-hidden border-b border-line bg-white px-3">
            <div className="flex items-center gap-2">
              <span className="label">Workspace</span>
              <Seg
                value={tab}
                onChange={(v) => setTab(v)}
                options={[
                  { value: "photo", label: "Edit photo" },
                  { value: "sheet", label: "Print sheet" },
                ]}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button className="icon-btn" title="Rotate left" onClick={() => { push(); setRot((r) => (r + 3) % 4); }}>
                <RotateCcw size={15} />
              </button>
              <button className="icon-btn" title="Rotate right" onClick={() => { push(); setRot((r) => (r + 1) % 4); }}>
                <RotateCw size={15} />
              </button>
              <button className="icon-btn" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
                <ZoomOut size={15} />
              </button>
              <span className="num w-[44px] text-center text-[11.5px] text-muted">{Math.round(zoom * 100)}%</span>
              <button className="icon-btn" title="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
                <ZoomIn size={15} />
              </button>
              <button className="icon-btn" title="Fit" onClick={() => setZoom(1)}>
                <Eye size={15} />
              </button>
              <span className="mx-1 h-5 w-px bg-line" />
              <button className="icon-btn" title="Undo (Ctrl+Z)" onClick={undo} disabled={!undoRef.current.length}>
                <Undo2 size={15} />
              </button>
              <button className="icon-btn" title="Redo (Ctrl+Y)" onClick={redo} disabled={!redoRef.current.length}>
                <Redo2 size={15} />
              </button>
              <button
                className="icon-btn"
                title="Reset editing"
                onClick={() => {
                  push();
                  setFilter(NEUTRAL_FILTER);
                  setRot(0);
                  if (working) setCrop(fitCrop(workingSize.w, workingSize.h, aspect));
                  notify("Editing reset");
                }}
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          <div ref={boxRef} className="relative min-h-0 flex-1 overflow-auto bg-[#e9ecf1] p-6">
            {tab === "photo" ? (
              src && working ? (
                <div className="flex min-h-full items-center justify-center">
                  <div className="relative shadow-[0_1px_2px_rgba(15,27,45,.2),0_16px_40px_rgba(15,27,45,.18)]">
                    <canvas ref={displayRef} className="block bg-white" />
                    <div
                      className="absolute inset-0 touch-none"
                      style={{ cursor: "crosshair" }}
                      onPointerDown={onCropDown}
                      onPointerMove={onCropMove}
                      onPointerUp={endCrop}
                      onPointerCancel={endCrop}
                    >
                      {/* dim outside */}
                      <div
                        className="pointer-events-none absolute bg-[#0f1b2d]/45"
                        style={{ left: 0, top: 0, right: 0, height: Math.max(0, crop.y * scale) }}
                      />
                      <div
                        className="pointer-events-none absolute bg-[#0f1b2d]/45"
                        style={{ left: 0, top: (crop.y + crop.h) * scale, right: 0, bottom: 0 }}
                      />
                      <div
                        className="pointer-events-none absolute bg-[#0f1b2d]/45"
                        style={{ left: 0, top: crop.y * scale, width: Math.max(0, crop.x * scale), height: crop.h * scale }}
                      />
                      <div
                        className="pointer-events-none absolute bg-[#0f1b2d]/45"
                        style={{ left: (crop.x + crop.w) * scale, top: crop.y * scale, right: 0, height: crop.h * scale }}
                      />

                      <div
                        className="absolute border-2 border-white/95 shadow-[0_0_0_1px_rgba(15,27,45,.55)]"
                        style={{
                          left: crop.x * scale,
                          top: crop.y * scale,
                          width: crop.w * scale,
                          height: crop.h * scale,
                        }}
                      >
                        <svg
                          className="pointer-events-none absolute -left-[3px] -top-[3px]"
                          style={{ width: "calc(100% + 6px)", height: "calc(100% + 6px)", overflow: "visible" }}
                        >
                          <rect
                            x="0"
                            y="0"
                            width="100%"
                            height="100%"
                            fill="none"
                            stroke="#1d5ae6"
                            strokeWidth="3"
                            strokeDasharray="9 5"
                          >
                            <animate attributeName="stroke-dashoffset" from="0" to="-28" dur="1.4s" repeatCount="indefinite" />
                          </rect>
                        </svg>
                        {/* thirds */}
                        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-35">
                          {Array.from({ length: 9 }).map((_, i) => (
                            <span key={i} className="border border-white/70" />
                          ))}
                        </div>
                        {(["nw", "ne", "sw", "se"] as const).map((h) => (
                          <span
                            key={h}
                            data-h={h}
                            className="absolute h-3.5 w-3.5 rounded-[2px] border border-white bg-brand shadow"
                            style={{
                              left: h.includes("w") ? -7 : undefined,
                              right: h.includes("e") ? -7 : undefined,
                              top: h.includes("n") ? -7 : undefined,
                              bottom: h.includes("s") ? -7 : undefined,
                              cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize",
                            }}
                          />
                        ))}
                      </div>

                      <div className="num pointer-events-none absolute bottom-2 left-2 rounded bg-[#0f1b2d]/85 px-2 py-1 text-[11px] text-white">
                        {Math.round(crop.w)} × {Math.round(crop.h)} px crop · {fmt((crop.w * 25.4) / (crop.h * 25.4 || 1), 3)} AR
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-full place-items-center">
                  <div className="max-w-[440px] overflow-hidden rounded-2xl border border-[#cfd6e2] bg-white text-center shadow-sm">
                    <img src={emptyPassport} alt="" className="h-[190px] w-full object-cover" />
                    <div className="p-5">
                      <Aperture size={22} className="mx-auto text-brand" strokeWidth={1.75} />
                      <div className="mt-2 text-[17px] font-bold text-ink 2xl:text-[20px]">Passport Photo Maker</div>
                      <p className="mt-2 text-[13.5px] leading-snug text-body 2xl:text-[15px]">
                        Drop a portrait photograph to crop it to size, then generate up to 12 identical copies on one
                        4 × 5 or 4 × 6 glossy sheet.
                      </p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="flex min-h-full flex-col items-center justify-center gap-3">
                <div
                  className="relative"
                  style={{ boxShadow: "0 1px 2px rgba(15,27,45,.2), 0 16px 40px rgba(15,27,45,.18)" }}
                >
                  <canvas ref={sheetRef} className="block bg-white" />
                </div>
                <div className="num text-[11.5px] text-body">
                  {paperLabel(paper)} landscape · {copies} copies · {fmt(margin, 2)} in margin · {fmt(gap, 2)} in gap
                </div>
              </div>
            )}
          </div>

          {/* bottom toolbar */}
          <div className="flex h-[46px] shrink-0 items-center justify-between gap-3 border-t border-line bg-white px-3">
            <div className="flex items-center gap-2">
              <button className={cn("btn btn-sm", !aspectLock && "border-brand text-brand")} onClick={() => setAspectLock((v) => !v)}>
                <Scissors size={12} /> {aspectLock ? "Aspect locked" : "Free aspect"}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  push();
                  setCrop(fitCrop(workingSize.w, workingSize.h, aspect));
                }}
                disabled={!working}
              >
                Refit crop
              </button>
              <span className="num hidden text-[11.5px] text-muted xl:inline">
                Photo {fmt(photoIn.w, 3)} × {fmt(photoIn.h, 3)} in ({inToMm(photoIn.w).toFixed(1)} × {inToMm(photoIn.h).toFixed(1)} mm)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="btn" onClick={() => void generate()} disabled={!src}>
                <Scissors size={14} /> Generate sheet
              </button>
              <button className="btn" onClick={openInEditor} disabled={!items.length}>
                <Eye size={14} /> Edit in layout
              </button>
              <button className="btn" onClick={() => void doPrint()} disabled={!!busy || !items.length}>
                <Printer size={14} /> Print
              </button>
              <button className="btn btn-primary" onClick={() => void doExport()} disabled={!!busy || !items.length}>
                <FileDown size={14} /> {busy ?? `Export ${format.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
