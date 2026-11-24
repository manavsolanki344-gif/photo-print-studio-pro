import React, { useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker&inline";
import { jsPDF } from "jspdf";
import {
  Upload,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  RotateCcw,
  RotateCw,
  Undo2,
  Redo2,
  Scissors,
  Check,
  FileDown,
  Images,
  Trash,
  FileImage,
  Plus,
  Minus,
  Printer,
  ArrowDown,
  X,
} from "lucide-react";
import emptyId from "@/assets/empty-id.jpg";
import { useStudio } from "@/lib/studio";
import type { ExportFormat } from "@/lib/types";
import { slug, stamp } from "@/lib/paper";
import { downloadBlob, patchJpegDpi, patchPngDpi } from "@/lib/sheet";
import { cropCanvas, loadImage } from "@/lib/images";
import { cn, Seg } from "@/components/ui";

try {
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
} catch { /* ignore */ }

type Side = "front" | "back";

interface Sel { page: number; rot: number; x: number; y: number; w: number; h: number; }
interface Result { url: string; w: number; h: number; page: number; }
interface PdfSource { kind: "pdf"; name: string; doc: any; pages: number; }
interface ImgSource { kind: "image"; name: string; img: HTMLImageElement; }
type Source = PdfSource | ImgSource | null;

const QUALITY_DPI = [150, 300, 450, 600];

/*
 * PORTRAIT paper sizes for stacked ID card layout
 * 4×6 = 4 in wide × 6 in tall = 10 cm × 15 cm  (standard photo print)
 * 4×5 = 4 in wide × 5 in tall = 10 cm × 12.7 cm
 *
 * Front card on TOP half, back card on BOTTOM half, cut line between.
 */
const ID_PAPERS = {
  "4x6": { w: 4, h: 6, label: "4×6 in (10×15 cm) Portrait" },
  "4x5": { w: 4, h: 5, label: "4×5 in (10×12.7 cm) Portrait" },
} as const;

async function buildStackedSheet(
  frontResult: Result,
  backResult: Result | undefined,
  paperKey: "4x5" | "4x6" = "4x6",
  dpi = 300,
  margin = 0.15,
  gap = 0.12,
): Promise<HTMLCanvasElement> {
  const paper = ID_PAPERS[paperKey];
  const pW = Math.round(paper.w * dpi);
  const pH = Math.round(paper.h * dpi);

  const out = document.createElement("canvas");
  out.width = pW;
  out.height = pH;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pW, pH);

  const mPx = Math.round(margin * dpi);
  const gPx = Math.round(gap * dpi);

  const frontImg = await loadImage(frontResult.url);
  const backImg = backResult ? await loadImage(backResult.url) : null;

  const usableW = pW - 2 * mPx;
  const usableH = pH - 2 * mPx;

  const slots = backImg ? 2 : 1;
  const slotH = slots === 2 ? Math.round((usableH - gPx) / 2) : usableH;

  const drawInSlot = (img: HTMLImageElement, slotY: number) => {
    const ar = img.naturalWidth / img.naturalHeight;
    let iw = usableW;
    let ih = iw / ar;
    if (ih > slotH) { ih = slotH; iw = ih * ar; }
    const x = mPx + (usableW - iw) / 2;
    const y = slotY + (slotH - ih) / 2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, iw, ih);
  };

  drawInSlot(frontImg, mPx);
  if (backImg) drawInSlot(backImg, mPx + slotH + gPx);

  // cut guide between front and back
  if (backImg) {
    const lineY = mPx + slotH + gPx / 2;
    ctx.save();
    ctx.strokeStyle = "#b9c1cf";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.moveTo(mPx * 0.4, lineY);
    ctx.lineTo(pW - mPx * 0.4, lineY);
    ctx.stroke();
    // scissors icon hint
    const txt = "✂  cut line  ✂";
    ctx.font = `bold ${Math.max(12, dpi * 0.028)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#8b95a8";
    ctx.fillText(txt, pW / 2, lineY + Math.max(8, dpi * 0.02));
    ctx.restore();
  }

  // margin marks
  ctx.save();
  ctx.strokeStyle = "#e3e7ed";
  ctx.lineWidth = 1;
  const mk = mPx * 0.6;
  const corners: [number, number][] = [[0, 0], [pW, 0], [0, pH], [pW, pH]];
  for (const [cx, cy] of corners) {
    const sx = cx === 0 ? mPx : pW - mPx;
    const sy = cy === 0 ? mPx : pH - mPx;
    ctx.beginPath();
    ctx.moveTo(sx - (cx === 0 ? mk : -mk), sy); ctx.lineTo(sx + (cx === 0 ? mk : -mk), sy);
    ctx.moveTo(sx, sy - (cy === 0 ? mk : -mk)); ctx.lineTo(sx, sy + (cy === 0 ? mk : -mk));
    ctx.stroke();
  }
  ctx.restore();

  return out;
}

/* ══════════════════════════════════════════════════════════════════= */

export default function IdCropper() {
  const { store, incoming, setIncoming, notify } = useStudio();

  const [source, setSource] = useState<Source>(null);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [showPages, setShowPages] = useState(false);
  const [page, setPage] = useState(1);
  const [rot, setRot] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const [quality, setQuality] = useState(300);

  /* Both selections live simultaneously — user can draw FRONT then BACK
     on the same page without losing the first selection */
  const [active, setActive] = useState<Side>("front");
  const [sides, setSides] = useState<{ front?: Sel; back?: Sel }>({});
  const [results, setResults] = useState<{ front?: Result; back?: Result }>({});

  const [pageDims, setPageDims] = useState({ w: 612, h: 792 });
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [printDpi, setPrintDpi] = useState(300);

  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 820, h: 560 });
  const displayRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<{ page: number; rot: number; scale: number; canvas: HTMLCanvasElement } | null>(null);

  /* drag state: mode + which side it belongs to */
  const dragRef = useRef<{
    mode: "new" | "move" | "nw" | "ne" | "sw" | "se";
    side: Side;
    start: Sel;
    px: { x: number; y: number };
  } | null>(null);

  const historyRef = useRef<{ sides: { front?: Sel; back?: Sel } }[]>([]);
  const redoRef = useRef<typeof historyRef.current>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── file open ───────────────────────────────────────────────── */

  const openFile = React.useCallback(async (file: File) => {
    setError(null);
    setThumbs([]);
    setSides({}); setResults({}); setActive("front"); setPreviewUrl(null); setPreviewOpen(false);
    try {
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
        setSource({ kind: "pdf", name: file.name, doc, pages: doc.numPages });
        setPage(1);
        const list: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i);
          const vp0 = p.getViewport({ scale: 1 });
          const vp = p.getViewport({ scale: 150 / vp0.width });
          const c = document.createElement("canvas");
          c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          await p.render({ canvas: c, viewport: vp }).promise;
          list.push(c.toDataURL("image/jpeg", 0.7));
        }
        setThumbs(list);
        notify(`Opened ${file.name} — ${doc.numPages} page${doc.numPages > 1 ? "s" : ""}`);
      } else {
        const url = URL.createObjectURL(file);
        const img = await loadImage(url);
        store.add(img, undefined, url);
        setSource({ kind: "image", name: file.name, img });
        setPage(1);
        notify(`Opened ${file.name} — ${img.naturalWidth} × ${img.naturalHeight} px`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [notify, store]);

  const consumedRef = useRef<File | null>(null);
  React.useEffect(() => {
    const needs = incoming && (incoming.kind === "pdf" || incoming.from !== "passport");
    if (needs && incoming!.file !== consumedRef.current) {
      consumedRef.current = incoming!.file;
      void openFile(incoming!.file);
      setIncoming(null);
    }
  }, [incoming, openFile, setIncoming]);

  /* ── page render ─────────────────────────────────────────────── */

  const ensureSource = React.useCallback(async (forPage: number, rotation: number, q: number, keepCache = true) => {
    const cache = sourceRef.current;
    if (cache && cache.page === forPage && cache.rot === rotation && cache.scale === q) return cache.canvas;
    if (!source) throw new Error("Open a document first.");
    if (source.kind === "image") {
      const c = document.createElement("canvas");
      const swap = rotation % 180 !== 0;
      c.width = swap ? source.img.naturalHeight : source.img.naturalWidth;
      c.height = swap ? source.img.naturalWidth : source.img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(source.img, -source.img.naturalWidth / 2, -source.img.naturalHeight / 2);
      if (keepCache) sourceRef.current = { page: forPage, rot: rotation, scale: q, canvas: c };
      return c;
    }
    const p = await source.doc.getPage(forPage);
    const scale = q / 72;
    const vp = p.getViewport({ scale, rotation });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    await p.render({ canvas: c, viewport: vp }).promise;
    if (keepCache) sourceRef.current = { page: forPage, rot: rotation, scale: q, canvas: c };
    return c;
  }, [source]);

  React.useEffect(() => {
    let alive = true;
    if (!source) return;
    (async () => {
      setRendering(true);
      try {
        if (source.kind === "image") {
          const swap = rot % 180 !== 0;
          setPageDims({ w: swap ? source.img.naturalHeight : source.img.naturalWidth, h: swap ? source.img.naturalWidth : source.img.naturalHeight });
        } else {
          const p = await source.doc.getPage(page);
          const vp = p.getViewport({ scale: 1, rotation: rot });
          if (alive) setPageDims({ w: vp.width, h: vp.height });
        }
        await ensureSource(page, rot, source.kind === "image" ? 0 : quality);
        if (alive) setTick(t => t + 1);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setRendering(false);
      }
    })();
    return () => { alive = false; };
  }, [source, page, rot, quality, ensureSource]);

  /* ── canvas draw ─────────────────────────────────────────────── */

  React.useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitScale = useMemo(
    () => Math.max(0.05, Math.min((box.w - 24) / pageDims.w, (box.h - 24) / pageDims.h)),
    [box.w, box.h, pageDims.w, pageDims.h],
  );
  const scale = fitScale * (zoom ?? 1);

  React.useEffect(() => {
    const canvas = displayRef.current;
    const src = sourceRef.current?.canvas;
    if (!canvas || !src) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(pageDims.w * scale));
    const H = Math.max(1, Math.round(pageDims.h * scale));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, W, H);
  }, [pageDims, scale, tick, source]);

  /* ── history ─────────────────────────────────────────────────── */

  const push = () => {
    historyRef.current.push({ sides: { front: sides.front ? { ...sides.front } : undefined, back: sides.back ? { ...sides.back } : undefined } });
    if (historyRef.current.length > 60) historyRef.current.shift();
    redoRef.current = [];
    setTick(t => t + 1);
  };
  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    redoRef.current.push({ sides: { ...sides } });
    setSides(prev.sides);
    setTick(t => t + 1);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push({ sides: { ...sides } });
    setSides(next.sides);
    setTick(t => t + 1);
  };

  /* ── pointer selection (BOTH rects on the same canvas) ───────── */

  const toPage = (e: React.PointerEvent) => {
    // Use the canvas element directly so scroll offsets don't corrupt coordinates
    const canvas = displayRef.current;
    const r = canvas ? canvas.getBoundingClientRect() : (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cW = r.width  || 1;
    const cH = r.height || 1;
    return {
      x: ((e.clientX - r.left) / cW) * pageDims.w,
      y: ((e.clientY - r.top)  / cH) * pageDims.h,
    };
  };

  const clamp = (s: Sel): Sel => {
    const w = Math.max(6, Math.min(s.w, pageDims.w));
    const h = Math.max(6, Math.min(s.h, pageDims.h));
    return { ...s, w: Math.round(w), h: Math.round(h), x: Math.round(Math.max(0, Math.min(s.x, pageDims.w - w))), y: Math.round(Math.max(0, Math.min(s.y, pageDims.h - h))) };
  };

  const hitHandle = (p: { x: number; y: number }, s: Sel): "nw" | "ne" | "sw" | "se" | "move" | null => {
    const tol = 14 / scale;
    for (const h of ["nw", "ne", "sw", "se"] as const) {
      const hx = s.x + (h.includes("w") ? 0 : s.w);
      const hy = s.y + (h.includes("n") ? 0 : s.h);
      if (Math.hypot(p.x - hx, p.y - hy) <= tol) return h;
    }
    if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) return "move";
    return null;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = toPage(e);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    push();

    // hit-test existing rects in reverse priority: active side first, then other side
    const otherSide: Side = active === "front" ? "back" : "front";
    const activeSel = sides[active];
    const otherSel = sides[otherSide];

    // check active side handles/body
    if (activeSel) {
      const h = hitHandle(p, activeSel);
      if (h) {
        dragRef.current = { mode: h === "move" ? "move" : h, side: active, start: { ...activeSel }, px: p };
        return;
      }
    }
    // check other side handles/body
    if (otherSel) {
      const h = hitHandle(p, otherSel);
      if (h) {
        setActive(otherSide);
        dragRef.current = { mode: h === "move" ? "move" : h, side: otherSide, start: { ...otherSel }, px: p };
        return;
      }
    }

    // start a new rect for the active side
    const start: Sel = { page, rot, x: Math.round(p.x), y: Math.round(p.y), w: 1, h: 1 };
    dragRef.current = { mode: "new", side: active, start, px: p };
    setSides(v => ({ ...v, [active]: start }));
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toPage(e);
    const { side } = d;

    if (d.mode === "new") {
      const x = Math.min(d.px.x, p.x);
      const y = Math.min(d.px.y, p.y);
      const updated = clamp({ page, rot, x, y, w: Math.abs(p.x - d.px.x), h: Math.abs(p.y - d.px.y) });
      setSides(v => ({ ...v, [side]: updated }));
      return;
    }
    if (d.mode === "move") {
      setSides(v => ({ ...v, [side]: clamp({ ...d.start, x: d.start.x + (p.x - d.px.x), y: d.start.y + (p.y - d.px.y) }) }));
      return;
    }
    // resize handle
    const s = d.start;
    const fx = d.mode.includes("w") ? s.x + s.w : s.x;
    const fy = d.mode.includes("n") ? s.y + s.h : s.y;
    const dirX = d.mode.includes("w") ? -1 : 1;
    const dirY = d.mode.includes("n") ? -1 : 1;
    const nw = Math.max(6, Math.abs(p.x - fx));
    const nh = Math.max(6, Math.abs(p.y - fy));
    setSides(v => ({ ...v, [side]: clamp({ ...s, x: dirX < 0 ? fx - nw : fx, y: dirY < 0 ? fy - nh : fy, w: nw, h: nh }) }));
  };

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) { dragRef.current = null; try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ } setTick(t => t + 1); }
  };

  /* ── confirm ─────────────────────────────────────────────────── */

  const confirmSide = async (side: Side) => {
    const s = sides[side];
    if (!s || s.w < 6 || s.h < 6) return notify(`Draw the ${side} selection on the page first.`, "error");
    setBusy(side.toUpperCase());
    try {
      const isImage = source?.kind === "image";
      const src = await ensureSource(s.page, s.rot, isImage ? 0 : quality, s.page === page && s.rot === rot);
      const factor = isImage ? 1 : quality / 72;
      const rect = { x: s.x * factor, y: s.y * factor, w: s.w * factor, h: s.h * factor };
      const cropped = cropCanvas(src, rect, { maxSide: 9000 });
      const url = cropped.toDataURL("image/png");
      setResults(r => ({ ...r, [side]: { url, w: cropped.width, h: cropped.height, page: s.page } }));
      if (side === "front") {
        setActive("back");
        notify(`FRONT confirmed — ${cropped.width} × ${cropped.height} px. BACK mode is now active: drag on the page to select the back side.`);
      } else {
        notify(`BACK confirmed — ${cropped.width} × ${cropped.height} px. Both sides ready — click Print 4×6.`);
      }
      setDockOpen(true); // open dock so user sees the result
      // Keep the same page visible so the operator can draw both sides from one image/page
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const confirmBoth = async () => {
    if (sides.front && !results.front) await confirmSide("front");
    if (sides.back && !results.back) await confirmSide("back");
  };

  /* ── print / export ──────────────────────────────────────────── */

  const buildSheet = async (paperKey: "4x5" | "4x6" = "4x6", dpiOut = printDpi): Promise<HTMLCanvasElement> => {
    if (!results.front) throw new Error("Confirm the front side first.");
    return buildStackedSheet(results.front, results.back, paperKey, dpiOut);
  };

  const printStacked = async (paperKey: "4x5" | "4x6" = "4x6") => {
    if (!results.front) return notify("Confirm at least the front side first.", "error");
    setBusy("BUILDING");
    try {
      const paper = ID_PAPERS[paperKey];
      const canvas = await buildSheet(paperKey, Math.min(printDpi, 600));
      const url = canvas.toDataURL("image/jpeg", 0.97);
      const root = document.getElementById("print-root");
      if (!root) return;
      root.innerHTML = "";
      const img = document.createElement("img");
      img.src = url;
      img.style.width = `${paper.w}in`;
      img.style.height = `${paper.h}in`;
      img.style.maxWidth = "none";
      img.style.display = "block";
      img.style.margin = "0 auto";
      root.appendChild(img);
      await new Promise(r => setTimeout(r, 80));
      window.print();
      notify("Print dialog opened — set scaling to 100% / Actual size.");
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const exportStacked = async (fmt: "jpg" | "png" | "pdf", paperKey: "4x5" | "4x6" = "4x6") => {
    if (!results.front) return notify("Confirm the front side first.", "error");
    setBusy(`EXPORTING ${fmt.toUpperCase()}`);
    try {
      const canvas = await buildSheet(paperKey, printDpi);
      const paper = ID_PAPERS[paperKey];
      const base = `id-card-${paper.w}x${paper.h}in-${printDpi}dpi-${stamp()}`;
      if (fmt === "jpg") {
        const raw = await canvasToBlob(canvas, "image/jpeg", 0.96);
        downloadBlob(new Blob([patchJpegDpi(new Uint8Array(await raw.arrayBuffer()), printDpi)], { type: "image/jpeg" }), `${base}.jpg`);
      } else if (fmt === "png") {
        const raw = await canvasToBlob(canvas, "image/png");
        downloadBlob(new Blob([patchPngDpi(new Uint8Array(await raw.arrayBuffer()), printDpi)], { type: "image/png" }), `${base}.png`);
      } else {
        // PDF: portrait page — width < height
        const pdf = new jsPDF({ unit: "in", format: [paper.w, paper.h], orientation: "portrait", compress: true });
        pdf.setProperties({ title: base, creator: "Photo Print Studio Pro" });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, paper.w, paper.h, undefined, "FAST");
        downloadBlob(pdf.output("blob") as Blob, `${base}.pdf`);
      }
      notify(`Saved ${base}.${fmt} — ${canvas.width} × ${canvas.height} px`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const [previewPaper, setPreviewPaper] = useState<"4x5" | "4x6">("4x6");

  const showPreview = async (paperKey: "4x5" | "4x6" = "4x6") => {
    if (!results.front) return notify("Confirm at least the front side first.", "error");
    setBusy("PREVIEW");
    setPreviewPaper(paperKey);
    try {
      const canvas = await buildSheet(paperKey, 150);
      setPreviewUrl(canvas.toDataURL("image/jpeg", 0.9));
      setPreviewOpen(true);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const downloadSide = async (side: Side, fmt: ExportFormat) => {
    const r = results[side];
    if (!r) return notify(`Confirm the ${side} side first.`, "error");
    try {
      const img = await loadImage(r.url);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      const base = `${slug(source?.name ?? "id")}-${side}-${stamp()}`;
      if (fmt === "jpg") {
        const raw = await canvasToBlob(c, "image/jpeg", 0.96);
        downloadBlob(new Blob([patchJpegDpi(new Uint8Array(await raw.arrayBuffer()), quality)], { type: "image/jpeg" }), `${base}.jpg`);
      } else {
        const raw = await canvasToBlob(c, "image/png");
        downloadBlob(new Blob([patchPngDpi(new Uint8Array(await raw.arrayBuffer()), quality)], { type: "image/png" }), `${base}.png`);
      }
      notify(`Saved ${base}.${fmt}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  /* ── derived ─────────────────────────────────────────────────── */

  const hasFront = !!results.front;
  const hasBack = !!results.back;
  const hasBothSel = !!sides.front && !!sides.back;
  const selFront = sides.front;
  const selBack = sides.back;
  const waitingForBack = hasFront && !hasBack;

  const pxLabel = (s?: Sel) => s ? `${Math.round(s.w)} × ${Math.round(s.h)}` : null;


  /* ── step status ─────────────────────────────────────────────── */


  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ══════════════ TOP TOOLBAR ══════════════ */}
      <div className="flex h-[48px] shrink-0 items-center gap-2 border-b border-line bg-white px-3">
        {/* upload */}
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={15} /> {source ? "Replace" : "Upload"}
        </button>
        <input ref={fileRef} type="file" className="hidden"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={e => { const f = e.target.files?.[0]; if (f) void openFile(f); e.target.value = ""; }} />

        {/* pdf page nav */}
        {source?.kind === "pdf" && source.pages > 1 && (
          <div className="relative flex items-center gap-1.5 rounded-lg border border-line bg-[#fafbfd] px-2 py-1">
            <button className="icon-btn h-7 w-7 border-0" onClick={() => { setPage(p => Math.max(1, p - 1)); setZoom(null); }} disabled={page <= 1}>
              <ChevronLeft size={14} />
            </button>
            <button className="num min-w-[52px] text-center text-[13px] font-semibold text-ink hover:text-brand" onClick={() => setShowPages(v => !v)}>
              {page} / {source.pages}
            </button>
            <button className="icon-btn h-7 w-7 border-0" onClick={() => { setPage(p => Math.min(source.pages, p + 1)); setZoom(null); }} disabled={page >= source.pages}>
              <ChevronRight size={14} />
            </button>
            {showPages && (
              <div className="absolute left-0 top-full z-30 mt-1 max-h-[400px] w-[320px] overflow-y-auto rounded-xl border border-line bg-white p-3 shadow-2xl">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-ink">Pages ({source.pages})</span>
                  <button className="btn btn-sm" onClick={() => setShowPages(false)}>Close</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {thumbs.map((t, i) => (
                    <button key={i} onClick={() => { setPage(i + 1); setShowPages(false); setZoom(null); }}
                      className={cn("relative overflow-hidden rounded-lg border-2 p-1 transition-all", page === i + 1 ? "border-brand bg-wash" : "border-line hover:border-brand/40")}>
                      <img src={t} alt={`Page ${i + 1}`} className="h-[80px] w-full rounded bg-white object-contain" />
                      <span className="num absolute bottom-1 right-1 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-bold text-white">{i + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <span className="h-5 w-px bg-line" />

        {/* side switch — visual only, both rects stay on canvas */}
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-muted">Drawing:</span>
          <Seg value={active} onChange={v => setActive(v as Side)}
            options={[
              {
                value: "front" as Side,
                label: (
                  <span className="flex items-center gap-1.5">
                    {hasFront ? <Check size={12} className="text-ok" /> : <span className="h-2 w-2 rounded-full border-2 border-current" />}
                    FRONT
                  </span>
                ),
              },
              {
                value: "back" as Side,
                label: (
                  <span className="flex items-center gap-1.5">
                    {hasBack ? <Check size={12} className="text-ok" /> : <span className="h-2 w-2 rounded-full border-2 border-current" />}
                    BACK
                  </span>
                ),
              },
            ]}
          />
        </div>

        <span className={cn("hidden text-[13px] xl:block", waitingForBack ? "font-semibold text-amber-700" : "text-muted")}>
          {waitingForBack
            ? "FRONT is done. BACK mode is active now — drag on the page to draw the back side."
            : active === "front"
              ? "Draw FRONT → confirm it → app switches to BACK automatically"
              : "BACK mode: drag on the page to draw the back side"}
        </span>

        {error && <span className="ml-2 text-[12px] text-danger truncate max-w-[200px]">{error}</span>}

        {/* right controls */}
        <div className="ml-auto flex items-center gap-2">
          <button className="icon-btn" title="Undo" onClick={undo} disabled={!historyRef.current.length}><Undo2 size={15} /></button>
          <button className="icon-btn" title="Redo" onClick={redo} disabled={!redoRef.current.length}><Redo2 size={15} /></button>
          <button className="icon-btn" title="Rotate left" onClick={() => setRot(r => (r + 270) % 360)}><RotateCcw size={15} /></button>
          <button className="icon-btn" title="Rotate right" onClick={() => setRot(r => (r + 90) % 360)}><RotateCw size={15} /></button>
          <button className="btn btn-sm" onClick={() => { push(); setSides(v => ({ ...v, [active]: undefined })); }}><Trash size={13} /> Clear {active}</button>
          <span className="h-5 w-px bg-line" />
          <button className="btn" onClick={() => void confirmSide("front")} disabled={!!busy || !sides.front}>
            <Check size={15} /> Confirm front
          </button>
          <button
            className={cn("btn", waitingForBack && "border-[#f4c37d] bg-[#fff6e8] text-[#a35a00]")}
            onClick={() => void confirmSide("back")}
            disabled={!!busy || !sides.back}
          >
            <Check size={15} /> Confirm back
          </button>
          <button className="btn btn-primary" onClick={() => void confirmBoth()} disabled={!!busy || !hasBothSel}>
            <Check size={15} /> Confirm both
          </button>
        </div>
      </div>



      {/* ══════════════ MAIN STAGE ══════════════ */}
      <div className="relative min-h-0 flex-1 bg-[#dadde3]">
        <div ref={boxRef} className="h-full w-full overflow-auto"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void openFile(f); }}>
          {source ? (
            <div className="flex min-h-full items-center justify-center" style={{ padding: "6px" }}>
              <div className="relative select-none">
                {/* actual page canvas */}
                <canvas ref={displayRef} className="block bg-white"
                  style={{ boxShadow: "0 2px 6px rgba(15,27,45,.18), 0 20px 50px rgba(15,27,45,.24)" }} />

                {/* interaction overlay — same size as canvas */}
                <div
                  className="absolute inset-0 touch-none"
                  style={{ cursor: "crosshair", userSelect: "none" }}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                >

                  {/* render BOTH selections simultaneously */}
                  {([
                    { side: "front" as Side, color: "#1d5ae6", bg: "rgba(29,90,230,0.08)", labelBg: "#1d5ae6", selData: selFront },
                    { side: "back" as Side, color: "#d97706", bg: "rgba(217,119,6,0.08)", labelBg: "#d97706", selData: selBack },
                  ]).map(({ side, color, bg, labelBg, selData: s }) => s && s.w > 4 ? (
                    <React.Fragment key={side}>
                      {/* dim overlay for active side */}
                      {active === side && (
                        <>
                          <div className="pointer-events-none absolute bg-black/35" style={{ left: 0, top: 0, right: 0, height: Math.max(0, s.y * scale) }} />
                          <div className="pointer-events-none absolute bg-black/35" style={{ left: 0, top: (s.y + s.h) * scale, right: 0, bottom: 0 }} />
                          <div className="pointer-events-none absolute bg-black/35" style={{ left: 0, top: s.y * scale, width: Math.max(0, s.x * scale), height: s.h * scale }} />
                          <div className="pointer-events-none absolute bg-black/35" style={{ left: (s.x + s.w) * scale, top: s.y * scale, right: 0, height: s.h * scale }} />
                        </>
                      )}

                      {/* selection box — NOT pointer-events-none so handles work */}
                      <div className="absolute rounded-sm"
                        style={{ left: s.x * scale, top: s.y * scale, width: s.w * scale, height: s.h * scale, background: bg, outline: `2.5px solid ${color}`, outlineOffset: "-1px", pointerEvents: "none" }}>
                        {/* label */}
                        <span className="absolute -top-7 left-0 flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-bold uppercase text-white shadow"
                          style={{ background: labelBg }}>
                          {results[side] ? <Check size={12} strokeWidth={3} /> : <Scissors size={12} />}
                          {side} {results[side] ? "✓" : ""} {pxLabel(s)}
                        </span>
                        {/* corner handles — large, easy to grab */}
                        {(["nw", "ne", "sw", "se"] as const).map(h => (
                          <span key={h} data-h={h}
                            className="absolute rounded-full border-[3px] border-white shadow-xl"
                            style={{
                              background: color,
                              width: 22, height: 22,
                              left: h.includes("w") ? -11 : s.w * scale - 11,
                              top: h.includes("n") ? -11 : s.h * scale - 11,
                              cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize",
                              pointerEvents: "auto",
                              zIndex: 10,
                            }} />
                        ))}
                        {/* move handle — centre of selection */}
                        <span data-h="move" className="absolute grid rounded-full border-[3px] border-white shadow-xl"
                          style={{ background: color, width: 30, height: 30, left: s.w * scale / 2 - 15, top: s.h * scale / 2 - 15, cursor: "move", pointerEvents: "auto", zIndex: 10, display: "grid", placeItems: "center" }}>
                          <Plus size={15} color="white" strokeWidth={3} />
                        </span>
                      </div>
                    </React.Fragment>
                  ) : null)}
                </div>


              </div>
            </div>
          ) : (
            /* empty drop target */
            <div className="grid h-full place-items-center p-6">
              <div className="flex max-w-[560px] cursor-pointer flex-col items-center gap-5 overflow-hidden rounded-2xl border-2 border-dashed border-[#b9c5d8] bg-white px-8 py-10 text-center shadow-sm transition-colors hover:border-brand hover:bg-wash"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void openFile(f); }}>
                <img src={emptyId} alt="" className="h-[140px] w-full rounded-xl object-cover" />
                <Upload size={36} className="text-brand" strokeWidth={1.5} />
                <div className="text-[22px] font-bold tracking-tight text-ink">Upload Aadhaar / ID document</div>
                <p className="max-w-[400px] text-[14px] leading-relaxed text-body">
                  Drop a <b>PDF</b>, <b>JPG</b> or <b>PNG</b>. The full page fills the stage.
                  Draw the <span className="font-semibold text-brand">FRONT</span> box, then draw the <span className="font-semibold text-amber-600">BACK</span> box — both stay visible at once.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* in-stage workflow hint */}
        {source && waitingForBack && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
            <div className="rounded-xl border border-[#f4c37d] bg-[#fff6e8] px-4 py-2 text-center shadow-lg">
              <div className="text-[13px] font-bold text-[#a35a00]">Step 2: Draw the BACK side</div>
              <div className="text-[12px] text-[#8a5a1d]">FRONT is confirmed. BACK is already selected above — now drag on the page.</div>
            </div>
          </div>
        )}

        {/* rendering spinner */}
        {rendering && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-[#e2e5eb]/80">
            <div className="rounded-xl bg-[#0f1b2d] px-6 py-3 text-center shadow-2xl">
              <div className="num text-[14px] font-semibold text-white">RENDERING…</div>
            </div>
          </div>
        )}

        {/* floating zoom + quality */}
        {source && (
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-xl border border-line bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur-sm">
            <button className="icon-btn h-8 w-8 border-0" onClick={() => setZoom(z => Math.max(0.25, (z ?? 1) - 0.25))}><Minus size={15} /></button>
            <button className="num h-8 min-w-[58px] rounded-lg px-2 text-center text-[13px] font-semibold text-ink hover:bg-wash" onClick={() => setZoom(null)}>
              {Math.round((zoom ?? 1) * 100)}%
            </button>
            <button className="icon-btn h-8 w-8 border-0" onClick={() => setZoom(z => Math.min(5, (z ?? 1) + 0.25))}><Plus size={15} /></button>
            <span className="mx-1 h-5 w-px bg-line" />
            <button className="icon-btn h-8 w-8 border-0" title="Fit page" onClick={() => setZoom(null)}><Maximize2 size={15} /></button>
            <span className="mx-1 h-5 w-px bg-line" />
            <span className="text-[11.5px] font-medium text-muted">Qual</span>
            <Seg value={quality} onChange={v => setQuality(v)} options={QUALITY_DPI.map(q => ({ value: q, label: `${q}` }))} />
          </div>
        )}

        {/* floating badge */}
        {source && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-xl bg-[#0f1b2d]/85 px-3 py-2 text-[12px] text-white shadow-lg">
            <span className="rounded bg-white/15 px-1.5 py-0.5 font-bold">{source.kind === "pdf" ? "PDF" : "IMG"}</span>
            <span>{source.kind === "pdf" ? `Page ${page}/${source.pages}` : source.name.slice(0, 24)}</span>
            {selFront && <span className="rounded bg-[#1d5ae6]/80 px-1.5 py-0.5 font-semibold">F: {pxLabel(selFront)}</span>}
            {selBack && <span className="rounded bg-amber-500/80 px-1.5 py-0.5 font-semibold">B: {pxLabel(selBack)}</span>}
          </div>
        )}
      </div>

      {/* ══════════════ DOWNLOAD DOCK — Front ↑ Back ↓ on 4×5 or 4×6 ══════════════ */}
      {source && (
        <div className="shrink-0 border-t-2 border-brand/20 bg-white">
          {/* dock header toggle */}
          <button
            className="flex h-[44px] w-full items-center justify-between gap-4 px-5 hover:bg-[#f7f9fc] transition-colors"
            onClick={() => setDockOpen(v => !v)}
          >
            <div className="flex items-center gap-3">
              <span className="text-[14px] font-bold text-ink">Download & Print — Front ↑ Back ↓</span>
              <span className={cn("flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold", hasFront ? "bg-ok/10 text-ok" : "bg-line text-muted")}>
                {hasFront ? <Check size={11} /> : null} Front
              </span>
              <span className={cn("flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold", hasBack ? "bg-ok/10 text-ok" : "bg-line text-muted")}>
                {hasBack ? <Check size={11} /> : null} Back
              </span>
            </div>
            <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
              <span className="label">DPI</span>
              <Seg value={printDpi} onChange={v => setPrintDpi(v)} options={[300, 450, 600].map(d => ({ value: d, label: `${d}` }))} />
              <span className="text-[12px] text-muted">{dockOpen ? "▲ Hide" : "▼ Show"}</span>
            </div>
          </button>

          {/* dock body */}
          {dockOpen && (
          <div className="border-t border-line2 px-5 py-3">
            <div className="flex flex-wrap items-stretch gap-4">
              {/* ── FRONT preview ── */}
              <SideCard side="front" result={results.front} sel={selFront} onConfirm={() => void confirmSide("front")} onDownload={downloadSide} busy={busy} />

              {/* ── stacked arrow ── */}
              <div className="flex flex-col items-center justify-center gap-1 text-muted">
                <ArrowDown size={22} />
                <span className="text-[10px] font-bold">TOP</span>
                <span className="text-[10px] font-bold">BTM</span>
              </div>

              {/* ── BACK preview ── */}
              <SideCard side="back" result={results.back} sel={selBack} onConfirm={() => void confirmSide("back")} onDownload={downloadSide} busy={busy} />

              {/* ═══ DOWNLOAD PANEL — the main thing ═══ */}
              <div className="flex min-w-[340px] flex-[1.5] flex-col gap-3 rounded-xl border-2 border-brand/30 bg-[#f0f4ff] p-4">
                <div className="text-[15px] font-bold text-ink">Download Stacked ID Card</div>
                <div className="text-[13px] text-body">Front on top · Back on bottom · Cut line between · Your glossy paper size</div>

                {/* ── 4×6 = 10×15 cm PORTRAIT row ── */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-brand/40 bg-white px-3 py-2.5">
                  <span className="text-[14px] font-bold text-ink min-w-[90px]">4 × 6 in</span>
                  <span className="rounded bg-brand/10 px-2 py-0.5 text-[12px] font-semibold text-brand">10 × 15 cm</span>
                  <span className="num text-[12px] text-muted">{ID_PAPERS["4x6"].w * printDpi} × {ID_PAPERS["4x6"].h * printDpi} px portrait</span>
                  <div className="ml-auto flex gap-2">
                    <button className="btn btn-primary" onClick={() => void exportStacked("jpg", "4x6")} disabled={!!busy || !hasFront}>
                      <FileDown size={14} /> JPG
                    </button>
                    <button className="btn" onClick={() => void exportStacked("png", "4x6")} disabled={!!busy || !hasFront}>
                      <FileImage size={14} /> PNG
                    </button>
                    <button className="btn btn-sm" onClick={() => void exportStacked("pdf", "4x6")} disabled={!!busy || !hasFront}>
                      <FileDown size={13} /> PDF
                    </button>
                    <button className="btn btn-sm" onClick={() => void printStacked("4x6")} disabled={!!busy || !hasFront}>
                      <Printer size={13} /> Print
                    </button>
                    <button className="btn btn-sm" onClick={() => void showPreview("4x6")} disabled={!!busy || !hasFront}>
                      <Images size={13} /> Preview
                    </button>
                  </div>
                </div>

                {/* ── 4×5 = 10×12.7 cm PORTRAIT row ── */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-3 py-2.5">
                  <span className="text-[14px] font-bold text-ink min-w-[90px]">4 × 5 in</span>
                  <span className="rounded bg-line px-2 py-0.5 text-[12px] font-semibold text-muted">10 × 12.7 cm</span>
                  <span className="num text-[12px] text-muted">{ID_PAPERS["4x5"].w * printDpi} × {ID_PAPERS["4x5"].h * printDpi} px portrait</span>
                  <div className="ml-auto flex gap-2">
                    <button className="btn btn-primary" onClick={() => void exportStacked("jpg", "4x5")} disabled={!!busy || !hasFront}>
                      <FileDown size={14} /> JPG
                    </button>
                    <button className="btn" onClick={() => void exportStacked("png", "4x5")} disabled={!!busy || !hasFront}>
                      <FileImage size={14} /> PNG
                    </button>
                    <button className="btn btn-sm" onClick={() => void exportStacked("pdf", "4x5")} disabled={!!busy || !hasFront}>
                      <FileDown size={13} /> PDF
                    </button>
                    <button className="btn btn-sm" onClick={() => void printStacked("4x5")} disabled={!!busy || !hasFront}>
                      <Printer size={13} /> Print
                    </button>
                    <button className="btn btn-sm" onClick={() => void showPreview("4x5")} disabled={!!busy || !hasFront}>
                      <Images size={13} /> Preview
                    </button>
                  </div>
                </div>

                <div className="text-[11.5px] leading-snug text-muted">
                  Front on top half · cut line · back on bottom half. Set printer to <b className="text-ink">100% / Actual size</b>.
                  DPI metadata embedded in file.
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      )}

      {/* ══════════════ PRINT PREVIEW MODAL ══════════════ */}
      {previewOpen && previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1b2d]/60 p-6"
          onClick={() => setPreviewOpen(false)}>
          <div className="card max-w-[700px] w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
              <span className="text-[15px] font-bold text-ink">{previewPaper === "4x5" ? "4×5" : "4×6"} Print Preview — Front (top) · Back (bottom)</span>
              <button className="icon-btn" onClick={() => setPreviewOpen(false)}><X size={16} /></button>
            </div>
            <div className="bg-[#e2e5eb] p-6">
              <img src={previewUrl} alt="4×6 stacked preview" className="mx-auto max-h-[60vh] rounded-lg shadow-2xl" />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
              <span className="text-[13px] text-muted">{previewPaper === "4x5" ? "4×5" : "4×6"} in landscape · Front above cut line · Back below</span>
              <div className="flex gap-2">
                <button className="btn" onClick={() => setPreviewOpen(false)}>Close</button>
                <button className="btn btn-primary" onClick={() => void printStacked(previewPaper)} disabled={!!busy}>
                  <Printer size={14} /> Print Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ SideCard sub-component ═══ */

function SideCard({ side, result, sel, onConfirm, onDownload, busy }: {
  side: Side;
  result?: Result;
  sel?: Sel;
  onConfirm: () => void;
  onDownload: (side: Side, fmt: ExportFormat) => Promise<void>;
  busy: string | null;
}) {
  const color = side === "front" ? "#1d5ae6" : "#d97706";
  const confirmed = !!result;

  return (
    <div className="flex min-w-[220px] flex-1 items-stretch gap-3 rounded-xl border-2 p-3"
      style={{ borderColor: confirmed ? (side === "front" ? "#bfe3d3" : "#fde68a") : "#e3e7ed", background: confirmed ? (side === "front" ? "#f0faf6" : "#fffbeb") : "#fafbfd" }}>
      {/* thumbnail */}
      <div className="grid h-[100px] w-[136px] shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-white">
        {result ? (
          <img src={result.url} alt={side} className="max-h-full max-w-full object-contain" />
        ) : (
          <div className="text-center px-2">
            <Scissors size={20} className="mx-auto mb-1 text-muted" strokeWidth={1.5} />
            <span className="text-[11px] text-muted leading-tight block">{sel ? "Selection ready\npress Confirm" : `No ${side} crop yet`}</span>
          </div>
        )}
      </div>
      {/* info */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <span className="text-[14px] font-bold capitalize" style={{ color }}>{side} side</span>
          {confirmed && <Check size={14} className="text-ok" />}
        </div>
        <div className="mt-0.5 text-[12px] text-muted">
          {result ? `${result.w} × ${result.h} px` : sel ? "Selection drawn" : "Not selected yet"}
        </div>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {!confirmed ? (
            <button className="btn btn-sm btn-primary" disabled={!!busy || !sel} onClick={onConfirm}>
              <Check size={13} /> Confirm {side}
            </button>
          ) : (
            <>
              <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void onDownload(side, "jpg")}>
                <FileDown size={13} /> JPG
              </button>
              <button className="btn btn-sm" disabled={!!busy} onClick={() => void onDownload(side, "png")}>
                <FileImage size={13} /> PNG
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══ helpers ═══ */

function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("Encode failed")), type, quality));
}
