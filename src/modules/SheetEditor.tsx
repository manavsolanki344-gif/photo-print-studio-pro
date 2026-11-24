import React from "react";
import {
  Undo2,
  Redo2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash,
  Copy,
  Printer,
  FileDown,
  Eye,
  Save,
  Lock,
  LockOpen,
  ArrowUp,
  ArrowDown,
  Ruler,
  Upload,
  Sparkles,
  Layers,
} from "lucide-react";
import { useStudio } from "@/lib/studio";
import type { DocItem, ExportFormat, Paper, ProjectRecord } from "@/lib/types";
import { DPI_OPTIONS, PAPERS, fmt, paperLabel, paperPixels, stamp } from "@/lib/paper";
import { exportSheet, layoutCells, layoutGrid, printSheet, renderAtDpi, renderSheet, type ExportJob } from "@/lib/sheet";
import { filesToImages } from "@/lib/images";
import { saveProject } from "@/lib/db";
import { cn, Panel, Row, Seg, NumInput, Notice, Modal } from "@/components/ui";

const HANDLE_KEYS = ["nw", "ne", "sw", "se"] as const;
type Handle = (typeof HANDLE_KEYS)[number];

type Drag =
  | { mode: "move"; start: { x: number; y: number }; item: DocItem }
  | { mode: "resize"; handle: Handle; item: DocItem }
  | { mode: "rotate"; item: DocItem }
  | null;

interface GuideLines {
  v: number[];
  h: number[];
}

export default function SheetEditor({
  fixedPaper,
  allowPaperSwitch,
  title,
}: {
  fixedPaper?: Paper;
  allowPaperSwitch?: boolean;
  title: string;
}) {
  const { store, settings, patchSettings, seed, consumeSeed, draft, setDraft, notify, logExport } = useStudio();
  const init = React.useRef(seed ?? draft).current;

  const [paper, setPaper] = React.useState<Paper>(() => fixedPaper ?? init?.paper ?? PAPERS[settings.paperKey]);
  const [items, setItems] = React.useState<DocItem[]>(() => init?.items ?? []);
  const [name, setName] = React.useState(() => init?.title ?? `${title} ${stamp()}`);
  const [sel, setSel] = React.useState<string | null>(null);
  const [margin, setMargin] = React.useState(settings.margin);
  const [gap, setGap] = React.useState(settings.gap);
  const [guides, setGuides] = React.useState(settings.guides);
  const [labels, setLabels] = React.useState(settings.labels);
  const [dpi, setDpi] = React.useState<number>(settings.dpi);
  const [format, setFormat] = React.useState<ExportFormat>(settings.format);
  const [zoomPct, setZoomPct] = React.useState<number | null>(null); // null = fit
  const [autoCount, setAutoCount] = React.useState(8);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const [guideLines, setGuideLines] = React.useState<GuideLines>({ v: [], h: [] });
  const [dropOver, setDropOver] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [box, setBox] = React.useState({ w: 900, h: 620 });
  const boxRef = React.useRef(box);
  boxRef.current = box;
  const dragRef = React.useRef<Drag>(null);
  const undoRef = React.useRef<DocItem[][]>([]);
  const redoRef = React.useRef<DocItem[][]>([]);
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const selRef = React.useRef(sel);
  selRef.current = sel;

  React.useEffect(() => {
    consumeSeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    setDraft({ paper, items, title: name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper, items]);

  // keep the global header/status readout in step with this module's paper
  React.useEffect(() => {
    if (fixedPaper) patchSettings({ paperKey: fixedPaper.w === 6 && fixedPaper.h === 4 ? "4x6" : "4x5" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedPaper]);

  /* ---------------- measurement / fit ---------------- */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.w, paper.h]);

  const fitScale = React.useMemo(
    () => Math.max(14, Math.min((box.w - 96) / paper.w, (box.h - 96) / paper.h, 340)),
    [paper.w, paper.h, box.w, box.h],
  );
  const scale = zoomPct ? (fitScale * zoomPct) / 100 : fitScale;

  /* ---------------- history ---------------- */
  const pushHistory = React.useCallback(() => {
    undoRef.current.push(itemsRef.current.map((i) => ({ ...i })));
    if (undoRef.current.length > 80) undoRef.current.shift();
    redoRef.current = [];
    setTick((t) => t + 1);
  }, []);

  const undo = React.useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(itemsRef.current.map((i) => ({ ...i })));
    setItems(prev);
    setTick((t) => t + 1);
  }, []);

  const redo = React.useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(itemsRef.current.map((i) => ({ ...i })));
    setItems(next);
    setTick((t) => t + 1);
  }, []);

  const commit = React.useCallback(
    (fn: (list: DocItem[]) => DocItem[]) => {
      pushHistory();
      setItems((list) => fn(list.map((i) => ({ ...i }))));
    },
    [pushHistory],
  );

  /* ---------------- drawing ---------------- */
  const draw = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = scale;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(paper.w * s));
    const H = Math.max(1, Math.round(paper.h * s));
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderSheet(ctx, {
      paperW: paper.w,
      paperH: paper.h,
      items,
      images: new Map(store.entries()),
      scale: s,
      guides,
      labels,
      margin,
      background: "#ffffff",
      selectionId: sel,
    });

    const it = items.find((i) => i.id === sel);
    if (it) {
      const hs = Math.max(5, Math.min(11, 160 / s)); // handle size in inches
      const c = { x: it.x + it.w / 2, y: it.y + it.h / 2 };
      const th = (it.rot * Math.PI) / 180;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      const toWorld = (lx: number, ly: number) => ({
        x: c.x + lx * cos - ly * sin,
        y: c.y + lx * sin + ly * cos,
      });
      ctx.save();
      ctx.strokeStyle = "#1d5ae6";
      ctx.lineWidth = Math.max(1.25, s * 0.016);
      for (const hk of HANDLE_KEYS) {
        const p = toWorld(hk.includes("w") ? -it.w / 2 : it.w / 2, hk.includes("n") ? -it.h / 2 : it.h / 2);
        ctx.strokeRect(p.x * s - hs, p.y * s - hs, hs * 2, hs * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(p.x * s - hs + 1, p.y * s - hs + 1, hs * 2 - 2, hs * 2 - 2);
        ctx.fillStyle = "#1d5ae6";
        ctx.fillRect(p.x * s - hs + 1, p.y * s - hs + 1, hs * 2 - 2, hs * 2 - 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(p.x * s - 2, p.y * s - 2, 4, 4);
      }
      // rotate handle
      const top = toWorld(0, -it.h / 2 - hs * 1.7);
      const anchor = toWorld(0, -it.h / 2);
      ctx.beginPath();
      ctx.moveTo(anchor.x * s, anchor.y * s);
      ctx.lineTo(top.x * s, top.y * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(top.x * s, top.y * s, hs, 0, Math.PI * 2);
      ctx.fillStyle = "#0f1b2d";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(top.x * s, top.y * s, hs * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();
    }

    // snapping guides
    if (guideLines.v.length || guideLines.h.length) {
      ctx.save();
      ctx.strokeStyle = "#e0862a";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      guideLines.v.forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x * s, 0);
        ctx.lineTo(x * s, paper.h * s);
        ctx.stroke();
      });
      guideLines.h.forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(0, y * s);
        ctx.lineTo(paper.w * s, y * s);
        ctx.stroke();
      });
      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, paper, scale, guides, labels, margin, sel, guideLines, store]);

  React.useEffect(() => {
    draw();
  }, [draw, tick]);

  /* ---------------- pointer interaction ---------------- */
  const toPaper = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * paper.w,
      y: ((e.clientY - r.top) / r.height) * paper.h,
    };
  };

  const hitHandles = (p: { x: number; y: number }): Handle | null => {
    const it = items.find((i) => i.id === sel);
    if (!it || it.lock) return null;
    const c = { x: it.x + it.w / 2, y: it.y + it.h / 2 };
    const th = (it.rot * Math.PI) / 180;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    const tol = 14 / scale;
    for (const hk of HANDLE_KEYS) {
      const lx = hk.includes("w") ? -it.w / 2 : it.w / 2;
      const ly = hk.includes("n") ? -it.h / 2 : it.h / 2;
      const wx = c.x + lx * cos - ly * sin;
      const wy = c.y + lx * sin + ly * cos;
      if (Math.hypot(p.x - wx, p.y - wy) <= tol) return hk;
    }
    return null;
  };

  const hitItem = (p: { x: number; y: number }): DocItem | null => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const c = { x: it.x + it.w / 2, y: it.y + it.h / 2 };
      const th = (-it.rot * Math.PI) / 180;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      if (Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.h / 2) return it;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const p = toPaper(e);
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);

    const hk = hitHandles(p);
    const current = items.find((i) => i.id === sel);
    if (hk && current) {
      pushHistory();
      dragRef.current = { mode: "resize", handle: hk, item: { ...current } };
      return;
    }
    if (current && !current.lock) {
      const th = (current.rot * Math.PI) / 180;
      const c = { x: current.x + current.w / 2, y: current.y + current.h / 2 };
      const lx = 0;
      const ly = -current.h / 2 - (14 / scale) * 1.7;
      const wx = c.x + lx * Math.cos(th) - ly * Math.sin(th);
      const wy = c.y + lx * Math.sin(th) + ly * Math.cos(th);
      if (Math.hypot(p.x - wx, p.y - wy) <= 16 / scale) {
        pushHistory();
        dragRef.current = { mode: "rotate", item: { ...current } };
        return;
      }
    }

    const hit = hitItem(p);
    if (hit) {
      setSel(hit.id);
      if (!hit.lock) {
        pushHistory();
        dragRef.current = { mode: "move", start: p, item: { ...hit } };
      }
    } else {
      setSel(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toPaper(e);

    if (drag.mode === "move") {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      let nx = drag.item.x + dx;
      let ny = drag.item.y + dy;
      const lines: GuideLines = { v: [], h: [] };
      const tol = 0.055;
      const candsX = [margin, paper.w / 2, paper.w - margin];
      const candsY = [margin, paper.h / 2, paper.h - margin];
      for (const o of items) {
        if (o.id === drag.item.id) continue;
        candsX.push(o.x, o.x + o.w / 2, o.x + o.w);
        candsY.push(o.y, o.y + o.h / 2, o.y + o.h);
      }
      const px = [nx, nx + drag.item.w / 2, nx + drag.item.w];
      const py = [ny, ny + drag.item.h / 2, ny + drag.item.h];
      for (let i = 0; i < 3; i++) {
        for (const c of candsX) {
          if (Math.abs(px[i] - c) < tol) {
            nx += c - px[i];
            lines.v.push(c);
            break;
          }
        }
        for (const c of candsY) {
          if (Math.abs(py[i] - c) < tol) {
            ny += c - py[i];
            lines.h.push(c);
            break;
          }
        }
      }
      setGuideLines(lines);
      setItems((list) =>
        list.map((i) => (i.id === drag.item.id ? { ...i, x: round3(nx), y: round3(ny) } : i)),
      );
      return;
    }

    if (drag.mode === "rotate") {
      const c = { x: drag.item.x + drag.item.w / 2, y: drag.item.y + drag.item.h / 2 };
      let ang = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
      const snaps = [-180, -90, 0, 90, 180, 270];
      for (const s of snaps) if (Math.abs(ang - s) < 4) ang = s;
      setItems((list) => list.map((i) => (i.id === drag.item.id ? { ...i, rot: Math.round(ang * 10) / 10 } : i)));
      return;
    }

    if (drag.mode === "resize") {
      const start = drag.item;
      const c = { x: start.x + start.w / 2, y: start.y + start.h / 2 };
      const th = (start.rot * Math.PI) / 180;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      const ox = drag.handle.includes("w") ? start.w / 2 : -start.w / 2;
      const oy = drag.handle.includes("n") ? start.h / 2 : -start.h / 2;
      const minS = 0.2;
      let nw = Math.max(minS, Math.abs(lx - ox));
      let nh = Math.max(minS, Math.abs(ly - oy));
      if (e.shiftKey) {
        const ratio = start.w / start.h;
        if (nw / nh > ratio) nw = nh * ratio;
        else nh = nw / ratio;
      }
      const sx = Math.sign(lx - ox) || 1;
      const sy = Math.sign(ly - oy) || 1;
      const mx = ox + (sx * nw) / 2;
      const my = oy + (sy * nh) / 2;
      const wx = c.x + mx * cos - my * sin;
      const wy = c.y + mx * sin + my * cos;
      setItems((list) =>
        list.map((i) =>
          i.id === start.id
            ? { ...i, w: round3(nw), h: round3(nh), x: round3(wx - nw / 2), y: round3(wy - nh / 2) }
            : i,
        ),
      );
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      setGuideLines({ v: [], h: [] });
      try {
        (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setTick((t) => t + 1);
    }
  };

  /* ---------------- object operations ---------------- */
  const selected = items.find((i) => i.id === sel) ?? null;

  const patchSel = (p: Partial<DocItem>) => {
    if (!sel) return;
    commit((list) => list.map((i) => (i.id === sel ? { ...i, ...p } : i)));
  };

  const removeSel = React.useCallback(() => {
    const id = selRef.current;
    if (!id) return;
    commit((list) => list.filter((i) => i.id !== id));
    setSel(null);
  }, [commit]);

  const duplicateSel = React.useCallback(() => {
    const id = selRef.current;
    const src = itemsRef.current.find((i) => i.id === id) ?? itemsRef.current[itemsRef.current.length - 1];
    if (!src) return;
    pushHistory();
    const copy: DocItem = { ...src, id: uid(), x: round3(src.x + 0.15), y: round3(src.y + 0.15) };
    setItems((l) => [...l, copy]);
    setSel(copy.id);
  }, [pushHistory]);

  const addImages = React.useCallback(
    async (files: FileList | File[]) => {
      const { out, errors } = await filesToImages(files as FileList);
      if (errors.length) notify(errors[0], "error");
      if (!out.length) return;
      pushHistory();
      const added: DocItem[] = out.map((o, idx) => {
        const id = store.add(o.img, undefined, o.url);
        const ar = o.img.naturalWidth / o.img.naturalHeight || 1;
        let h = paper.h - 2 * margin;
        let w = h * ar;
        if (w > paper.w - 2 * margin) {
          w = paper.w - 2 * margin;
          h = w / ar;
        }
        return {
          id: uid(),
          imgId: id,
          x: 0.2 + idx * 0.1,
          y: 0.2 + idx * 0.1,
          w,
          h,
          rot: 0,
          name: o.name,
        };
      });
      const next = [...itemsRef.current, ...added];
      setItems(next);
      setSel(added[added.length - 1].id);
      notify(`${out.length} image${out.length > 1 ? "s" : ""} added`);
    },
    [margin, notify, paper.h, paper.w, pushHistory, store],
  );

  const autoArrange = React.useCallback(
    (count: number) => {
      if (!itemsRef.current.length) {
        notify("Add a photo first — then choose how many copies you want on the sheet.", "error");
        return;
      }
      pushHistory();
      let list = itemsRef.current.map((i) => ({ ...i }));
      if (count > list.length) {
        const src = list[list.length - 1];
        while (list.length < count) list.push({ ...src, id: uid() });
      } else if (count < list.length) {
        list = list.slice(0, count);
      }
      const sameAspect = list.every((i) => Math.abs(i.w / i.h - list[0].w / list[0].h) < 0.01);
      const rects = sameAspect
        ? layoutGrid(list.length, paper.w, paper.h, { margin, gap, aspect: list[0].w / list[0].h })
        : layoutCells(list.length, paper.w, paper.h, { margin, gap });
      const arranged = list.map((it, i) => {
        const r = rects[i];
        if (!r) return it;
        const ar = it.w / it.h;
        let w = r.w;
        let h = w / ar;
        if (h > r.h) {
          h = r.h;
          w = h * ar;
        }
        return { ...it, x: round3(r.x + (r.w - w) / 2), y: round3(r.y + (r.h - h) / 2), w: round3(w), h: round3(h), rot: 0 };
      });
      setItems(arranged);
      notify(`Arranged ${arranged.length} photo${arranged.length > 1 ? "s" : ""} on ${paperLabel(paper)}`);
    },
    [gap, margin, notify, paper, pushHistory],
  );

  const alignTo = (mode: "left" | "centerX" | "right" | "top" | "middleY" | "bottom") => {
    if (!selected) return;
    commit((list) =>
      list.map((i) => {
        if (i.id !== selected.id) return i;
        if (mode === "left") return { ...i, x: margin };
        if (mode === "centerX") return { ...i, x: round3((paper.w - i.w) / 2) };
        if (mode === "right") return { ...i, x: round3(paper.w - margin - i.w) };
        if (mode === "top") return { ...i, y: margin };
        if (mode === "middleY") return { ...i, y: round3((paper.h - i.h) / 2) };
        return { ...i, y: round3(paper.h - margin - i.h) };
      }),
    );
  };

  const moveLayer = (dir: 1 | -1) => {
    if (!sel) return;
    commit((list) => {
      const idx = list.findIndex((i) => i.id === sel);
      if (idx < 0) return list;
      const j = idx + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  };

  const resetAll = () => {
    pushHistory();
    setItems([]);
    setSel(null);
    notify("Workspace cleared — Ctrl+Z to undo");
  };

  /* ---------------- export ---------------- */
  const buildJob = (fmtOut: ExportFormat = format): ExportJob => ({
    paperW: paper.w,
    paperH: paper.h,
    paperName: paperLabel(paper),
    items,
    images: new Map(store.entries()),
    dpi,
    guides,
    labels,
    margin,
    format: fmtOut,
    quality: settings.quality,
    name,
  });

  const runExport = async (fmtOut?: ExportFormat) => {
    const f = fmtOut ?? format;
    if (!items.length) return notify("Nothing on the sheet yet — add photos first.", "error");
    setBusy(`EXPORTING ${f.toUpperCase()}`);
    try {
      const res = await exportSheet(buildJob(f));
      logExport({
        name: res.filename,
        kind: f,
        at: Date.now(),
        paper: paperLabel(paper),
        dpi,
        pixels: `${res.width} × ${res.height}`,
      });
      patchSettings({ dpi, format: f, guides, labels, margin, gap });
      setFormat(f);
      notify(`Saved ${res.filename} — ${res.width} × ${res.height} px in ${res.ms} ms`);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const runPrint = async () => {
    if (!items.length) return notify("Nothing on the sheet yet.", "error");
    setBusy("PREPARING PRINT");
    try {
      await printSheet(buildJob());
      notify("Print dialog opened — set scaling to 100 % / Actual size.");
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const showPreview = async () => {
    if (!items.length) return notify("Add photos to preview the sheet.", "error");
    try {
      const canvas = await exportSheetPreview(buildJob());
      setPreview(canvas);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "error");
    }
  };

  const save = React.useCallback(async () => {
    const images: Record<string, string> = {};
    for (const it of itemsRef.current) {
      if (images[it.imgId]) continue;
      const el = store.get(it.imgId);
      if (!el) continue;
      images[it.imgId] = await toDataURL(el);
    }
    const rec: ProjectRecord = {
      id: `prj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || "Untitled sheet",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      paper,
      items: itemsRef.current.map((i) => ({ ...i })),
      images,
      settings: { dpi, format, guides, labels, margin, gap },
    };
    const ok = await saveProject(rec);
    notify(ok ? `Project “${rec.name}” saved locally in this browser.` : "Could not save — local storage is unavailable.", ok ? "ok" : "error");
  }, [dpi, format, gap, guides, labels, margin, name, notify, paper, store]);

  /* ---------------- keyboard ---------------- */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSel();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void runPrint();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selRef.current) {
        e.preventDefault();
        removeSel();
      } else if (e.key.startsWith("Arrow") && selRef.current) {
        e.preventDefault();
        const step = e.shiftKey ? 0.1 : 0.01;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (d) commit((list) => list.map((i) => (i.id === selRef.current ? { ...i, x: round3(i.x + d[0]), y: round3(i.y + d[1]) } : i)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, duplicateSel, removeSel, save, commit]);

  const px = paperPixels(paper, dpi);
  const rulerInchesW = Math.round(paper.w);
  const rulerInchesH = Math.round(paper.h);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* ---------------- LEFT RAIL ---------------- */}
        <aside className="flex w-[292px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-white p-3 xl:w-[326px] 2xl:w-[352px]">
          <Panel title="Project" bodyClass="p-2.5">
            <input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
            <div className="mt-1.5 text-[11.5px] leading-snug text-muted">
              Ctrl+S stores this project in the browser only — images included.
            </div>
          </Panel>

          <Panel title="Paper" bodyClass="p-2.5">
            {allowPaperSwitch ? (
              <Seg
                className="w-full"
                value={`${paper.w}x${paper.h}`}
                onChange={(v) => {
                  const p = v === "5x4" ? PAPERS["4x5"] : PAPERS["4x6"];
                  setPaper(p);
                  patchSettings({ paperKey: v === "5x4" ? "4x5" : "4x6" });
                }}
                options={[
                  { value: "5x4", label: "4 × 5 in" },
                  { value: "6x4", label: "4 × 6 in" },
                ]}
              />
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-ink">{paperLabel(paper)}</span>
                <span className="num text-[11px] text-muted">landscape</span>
              </div>
            )}
            <div className="num mt-1.5 flex justify-between text-[11px] text-muted">
              <span>
                {px.w} × {px.h} px
              </span>
              <span>{fmt(paper.w, 2)} × {fmt(paper.h, 2)} in</span>
            </div>
          </Panel>

          <Panel title="Add photos" bodyClass="p-2.5">
            <label className="block cursor-pointer">
              <div
                className="flex items-center gap-2 rounded-lg border border-dashed border-[#cfd6e2] px-2.5 py-2.5 text-[12px] text-body transition-colors hover:border-brand hover:bg-wash"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropOver(true);
                }}
                onDragLeave={() => setDropOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropOver(false);
                  if (e.dataTransfer.files?.length) void addImages(e.dataTransfer.files);
                }}
              >
                <Upload size={15} className="text-brand" /> Drop or browse…
              </div>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void addImages(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>

            {items.length > 0 && (
              <ul className="mt-2 max-h-[168px] space-y-1 overflow-y-auto pr-0.5">
                {items.map((it, i) => {
                  const el = store.get(it.imgId);
                  return (
                    <li key={it.id}>
                      <button
                        onClick={() => setSel(it.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border px-1.5 py-1 text-left transition-colors",
                          sel === it.id ? "border-brand bg-wash" : "border-line2 hover:border-[#c8d3e6]",
                        )}
                      >
                        <span className="num w-4 shrink-0 text-center text-[10px] text-muted">{i + 1}</span>
                        <img src={el?.src} alt="" className="h-7 w-7 shrink-0 rounded border border-line object-cover" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11.5px] font-medium text-ink">
                            {it.name || `Object ${i + 1}`}
                          </span>
                          <span className="num block text-[10px] text-muted">
                            {fmt(it.w, 2)} × {fmt(it.h, 2)} in{it.rot ? ` · ${Math.round(it.rot)}°` : ""}
                          </span>
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted hover:bg-white hover:text-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            pushHistory();
                            setItems((l) => l.filter((x) => x.id !== it.id));
                          }}
                        >
                          <Trash size={12} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="Auto layout"
            right={<Sparkles size={13} className="text-amber" />}
            bodyClass="p-2.5"
          >
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 2, 4, 6, 8, 10, 12].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setAutoCount(n);
                    autoArrange(n);
                  }}
                  className={cn(
                    "num h-7 rounded-md border text-[11.5px] font-medium transition-colors",
                    autoCount === n ? "border-brand bg-wash text-brand" : "border-line text-body hover:border-[#b9c8e6]",
                  )}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => autoArrange(autoCount)}
                title="Re-run arrangement"
                className="grid h-7 place-items-center rounded-md border border-line text-body hover:border-brand hover:text-brand"
              >
                <RefreshCw size={12} />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11.5px] text-body">Custom count</span>
              <NumInput value={autoCount} min={1} max={200} onChange={(v) => setAutoCount(Math.max(1, Math.round(v)))} width={64} />
            </div>
            <div className="mt-1 text-[11px] leading-snug text-muted">
              Equal gutters, centred rows, no overlap — recalculated for the selected paper.
            </div>
          </Panel>

          <Panel title="Sheet geometry" bodyClass="p-2.5">
            <Row label="Safe margin">
              <NumInput value={margin} min={0} max={1} step={0.01} suffix="in" onChange={(v) => setMargin(clamp(v, 0, 1.5))} width={78} />
            </Row>
            <Row label="Spacing">
              <NumInput value={gap} min={0} max={1} step={0.01} suffix="in" onChange={(v) => setGap(clamp(v, 0, 1.5))} width={78} />
            </Row>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <button className={cn("btn btn-sm", guides && "border-brand bg-wash text-brand")} onClick={() => setGuides((g) => !g)}>
                <Ruler size={12} /> Guides
              </button>
              <button className={cn("btn btn-sm", labels && "border-brand bg-wash text-brand")} onClick={() => setLabels((l) => !l)}>
                Frame labels
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <button className="btn btn-sm" onClick={() => alignTo("left")} title="Align left">
                ⇤
              </button>
              <button className="btn btn-sm" onClick={() => alignTo("centerX")} title="Centre horizontally">
                ↔
              </button>
              <button className="btn btn-sm" onClick={() => alignTo("right")} title="Align right">
                ⇥
              </button>
              <button className="btn btn-sm" onClick={() => alignTo("top")} title="Align top">
                ⇧
              </button>
              <button className="btn btn-sm" onClick={() => alignTo("middleY")} title="Centre vertically">
                ↕
              </button>
              <button className="btn btn-sm" onClick={() => alignTo("bottom")} title="Align bottom">
                ⇩
              </button>
            </div>
          </Panel>

          <Panel title={selected ? "Selected object" : "No selection"} bodyClass="p-2.5">
            {selected ? (
              <>
                <div className="grid grid-cols-2 gap-x-2">
                  <NumField label="X" value={round3(selected.x)} onChange={(v) => patchSel({ x: v })} />
                  <NumField label="Y" value={round3(selected.y)} onChange={(v) => patchSel({ y: v })} />
                  <NumField label="Width" value={round3(selected.w)} onChange={(v) => patchSel({ w: Math.max(0.2, v) })} />
                  <NumField label="Height" value={round3(selected.h)} onChange={(v) => patchSel({ h: Math.max(0.2, v) })} />
                  <NumField label="Rotate" value={Math.round(selected.rot)} onChange={(v) => patchSel({ rot: v })} step={1} />
                  <NumField
                    label="Aspect"
                    value={round3(selected.w / selected.h)}
                    onChange={(v) => {
                      if (v > 0) patchSel({ h: round3(selected.w / v) });
                    }}
                    step={0.01}
                  />
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button className="btn btn-sm flex-1" onClick={() => patchSel({ lock: !selected.lock })}>
                    {selected.lock ? <Lock size={12} /> : <LockOpen size={12} />} {selected.lock ? "Locked" : "Lock"}
                  </button>
                  <button className="btn btn-sm flex-1" onClick={duplicateSel}>
                    <Copy size={12} /> Duplicate
                  </button>
                  <button className="btn btn-sm flex-1" onClick={removeSel}>
                    <Trash size={12} /> Delete
                  </button>
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  <button className="btn btn-sm flex-1" onClick={() => moveLayer(1)}>
                    <ArrowUp size={12} /> Bring forward
                  </button>
                  <button className="btn btn-sm flex-1" onClick={() => moveLayer(-1)}>
                    <ArrowDown size={12} /> Send backward
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[12.5px] leading-snug text-muted">
                Click an object on the sheet to move, resize, rotate or lock it. Hold <span className="num">Shift</span>{" "}
                while resizing to keep proportions.
              </p>
            )}
          </Panel>

          <Panel title="Export" bodyClass="p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-body">Resolution</span>
              <Seg value={dpi} onChange={setDpi} options={DPI_OPTIONS.map((d) => ({ value: d, label: String(d) }))} />
            </div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-body">Format</span>
              <Seg
                value={format}
                onChange={setFormat}
                options={[
                  { value: "jpg", label: "JPG" },
                  { value: "png", label: "PNG" },
                  { value: "pdf", label: "PDF" },
                ]}
              />
            </div>
            <div className="num flex items-center justify-between rounded-lg border border-line bg-[#fafbfd] px-2.5 py-2 text-[12.5px]">
              <span className="text-muted">Output</span>
              <span className="font-medium text-ink">
                {px.w} × {px.h} px
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <button className="btn btn-sm" onClick={() => void runExport("jpg")}>
                JPG
              </button>
              <button className="btn btn-sm" onClick={() => void runExport("png")}>
                PNG
              </button>
              <button className="btn btn-sm" onClick={() => void runExport("pdf")}>
                PDF
              </button>
            </div>
            <button className="btn btn-primary mt-1.5 w-full" onClick={() => void runExport()} disabled={!!busy}>
              <FileDown size={14} /> {busy ?? `Export ${format.toUpperCase()} at ${dpi} DPI`}
            </button>
            <button className="btn mt-1.5 w-full" onClick={() => void runPrint()} disabled={!!busy}>
              <Printer size={14} /> Print at actual size
            </button>
            <div className="mt-2">
              <Notice kind="info">
                PDF pages are written as {fmt(paper.w, 2)} × {fmt(paper.h, 2)} in. Set the printer driver to{" "}
                <b>100 % / Actual size</b>; DPI metadata never forces the printer's own resolution.
              </Notice>
            </div>
          </Panel>
        </aside>

        {/* ---------------- CANVAS ---------------- */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            className={cn("relative flex-1 overflow-auto bg-[#e9ecf1] p-8", dropOver && "ring-2 ring-inset ring-brand")}
            onDragOver={(e) => {
              e.preventDefault();
              setDropOver(true);
            }}
            onDragLeave={() => setDropOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropOver(false);
              if (e.dataTransfer.files?.length) void addImages(e.dataTransfer.files);
            }}
          >
            <div className="relative mx-auto" style={{ width: paper.w * scale + 22, height: paper.h * scale + 22 }}>
              {/* top ruler */}
              <div
                className="absolute border-b border-[#b9c1cf] bg-[#f7f8fa]"
                style={{ left: 22, top: 0, width: paper.w * scale, height: 22 }}
              >
                {Array.from({ length: rulerInchesW * 4 + 1 }).map((_, i) => {
                  const inch = i / 4;
                  const major = i % 4 === 0;
                  return (
                    <span key={i}>
                      <span
                        className="absolute bottom-0 w-px bg-[#b9c1cf]"
                        style={{ left: inch * scale, height: major ? 9 : i % 2 === 0 ? 6 : 4 }}
                      />
                      {major && (
                        <span className="num absolute top-0.5 text-[9px] leading-none text-muted" style={{ left: inch * scale + 2 }}>
                          {inch}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
              {/* left ruler */}
              <div
                className="absolute border-r border-[#b9c1cf] bg-[#f7f8fa]"
                style={{ top: 22, left: 0, width: 22, height: paper.h * scale }}
              >
                {Array.from({ length: rulerInchesH * 4 + 1 }).map((_, i) => {
                  const inch = i / 4;
                  const major = i % 4 === 0;
                  return (
                    <span key={i}>
                      <span
                        className="absolute right-0 h-px bg-[#b9c1cf]"
                        style={{ top: inch * scale, width: major ? 9 : i % 2 === 0 ? 6 : 4 }}
                      />
                      {major && inch > 0 && (
                        <span
                          className="num absolute left-0.5 text-[9px] leading-none text-muted"
                          style={{ top: inch * scale + 2, writingMode: "vertical-rl" }}
                        >
                          {inch}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>

              <canvas
                ref={canvasRef}
                className="absolute touch-none bg-white"
                style={{
                  left: 22,
                  top: 22,
                  boxShadow: "0 1px 2px rgba(15,27,45,.16), 0 14px 34px rgba(15,27,45,.14)",
                  cursor: "default",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            </div>

            {items.length === 0 && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="max-w-[380px] rounded-xl border border-dashed border-[#b9c1cf] bg-white/85 px-6 py-5 text-center backdrop-blur-sm">
                  <Layers size={22} className="mx-auto text-brand" strokeWidth={1.75} />
                  <div className="mt-2 text-[15.5px] font-semibold text-ink 2xl:text-[18px]">Empty {paperLabel(paper)} sheet</div>
                  <p className="mt-1.5 text-[13px] leading-snug text-muted 2xl:text-[14.5px]">
                    Drop photos here, or send a passport / ID crop straight from another module with
                    <span className="num text-ink"> Arrange on sheet</span>.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ---------------- BOTTOM TOOLBAR ---------------- */}
          <div className="flex h-[46px] shrink-0 items-center justify-between gap-3 border-t border-line bg-white px-3">
            <div className="flex items-center gap-1.5">
              <button className="icon-btn" onClick={undo} disabled={!undoRef.current.length} title="Undo (Ctrl+Z)">
                <Undo2 size={15} />
              </button>
              <button className="icon-btn" onClick={redo} disabled={!redoRef.current.length} title="Redo (Ctrl+Y)">
                <Redo2 size={15} />
              </button>
              <button className="icon-btn" onClick={resetAll} title="Clear workspace">
                <RefreshCw size={15} />
              </button>
              <span className="mx-1 h-5 w-px bg-line" />
              <button className="icon-btn" onClick={() => setZoomPct(null)} title="Fit to screen">
                <Maximize2 size={15} />
              </button>
              <button className="icon-btn" onClick={() => setZoomPct(Math.min(400, (zoomPct ?? 100) + 25))} title="Zoom in">
                <ZoomIn size={15} />
              </button>
              <button className="icon-btn" onClick={() => setZoomPct(Math.max(25, (zoomPct ?? 100) - 25))} title="Zoom out">
                <ZoomOut size={15} />
              </button>
              <span className="num ml-1 w-[46px] text-[11.5px] text-muted">
                {Math.round((scale / fitScale) * 100)}%
              </span>
            </div>

            <div className="hidden min-w-0 max-w-[46%] items-center gap-4 overflow-hidden 2xl:flex">
              <span className="num truncate text-[11.5px] text-muted">
                {items.length} object{items.length === 1 ? "" : "s"} · {paperLabel(paper)} · margin {fmt(margin, 2)} in · gap{" "}
                {fmt(gap, 2)} in
              </span>
              {selected && (
                <span className="num text-[11.5px] text-ink">
                  x {fmt(selected.x, 2)} y {fmt(selected.y, 2)} · {fmt(selected.w, 2)} × {fmt(selected.h, 2)} in ·{" "}
                  {Math.round(selected.rot)}°
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button className="btn" onClick={showPreview} title="Full-sheet preview">
                <Eye size={14} /> Preview
              </button>
              <button className="btn" onClick={() => void save()} title="Save project locally (Ctrl+S)">
                <Save size={14} /> Save
              </button>
              <button className="btn" onClick={() => void runPrint()} disabled={!!busy} title="Print (Ctrl+P)">
                <Printer size={14} /> Print
              </button>
              <button className="btn btn-primary" onClick={() => void runExport()} disabled={!!busy}>
                <FileDown size={14} /> {busy ?? `Export ${format.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ---------------- PREVIEW MODAL ---------------- */}
      <Modal
        open={!!preview}
        title={`Print preview — ${paperLabel(paper)} landscape`}
        onClose={() => setPreview(null)}
        footer={
          <>
            <button className="btn" onClick={() => setPreview(null)}>
              Close
            </button>
            <button className="btn btn-primary" onClick={() => void runPrint()}>
              <Printer size={14} /> Print actual size
            </button>
          </>
        }
      >
        <div className="grid place-items-center rounded-lg bg-[#e9ecf1] p-4">
          {preview && (
            <img
              src={preview}
              alt="Sheet preview"
              className="max-h-[46vh] w-auto shadow-[0_10px_30px_rgba(15,27,45,.2)]"
            />
          )}
        </div>
        <div className="num mt-3 grid grid-cols-4 gap-2 text-[11.5px] text-body">
          <div>
            <div className="label">Paper</div>
            {fmt(paper.w, 2)} × {fmt(paper.h, 2)} in
          </div>
          <div>
            <div className="label">Orientation</div>
            Landscape
          </div>
          <div>
            <div className="label">Pixels</div>
            {px.w} × {px.h} @ {dpi}
          </div>
          <div>
            <div className="label">Margin / gap</div>
            {fmt(margin, 2)} / {fmt(gap, 2)} in
          </div>
        </div>
        <div className="mt-3">
          <Notice kind="warn">
            Set the print dialog to <b>100 % / Actual size</b> and disable “Fit to page” or “Scale to paper” — some
            printer drivers apply their own scaling regardless of the file.
          </Notice>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NumField({
  label,
  value,
  onChange,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="mb-1.5 flex items-center justify-between gap-2">
      <span className="label">{label}</span>
      <NumInput value={value} onChange={onChange} step={step} width={74} suffix="in" />
    </label>
  );
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}
function uid() {
  return `it_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function toDataURL(el: HTMLImageElement): Promise<string> {
  if (!el.src.startsWith("blob:")) return el.src;
  const c = document.createElement("canvas");
  c.width = el.naturalWidth;
  c.height = el.naturalHeight;
  c.getContext("2d")!.drawImage(el, 0, 0);
  return c.toDataURL("image/jpeg", 0.94);
}

async function exportSheetPreview(job: ExportJob): Promise<string> {
  const canvas = await renderAtDpi({ ...job, dpi: Math.min(220, job.dpi) });
  return canvas.toDataURL("image/jpeg", 0.9);
}
