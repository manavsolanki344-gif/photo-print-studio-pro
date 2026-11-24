import { jsPDF } from "jspdf";
import type { DocItem, ExportFormat } from "./types";
import { assertCanvasBudget, fmt, paperPixels, slug, stamp } from "./paper";

/* ------------------------------------------------------------------ *
 *  Sheet rendering — one pipeline used for preview, export and print  *
 * ------------------------------------------------------------------ */

export interface SheetRenderOptions {
  paperW: number;
  paperH: number;
  items: DocItem[];
  images: Map<string, HTMLImageElement>;
  /** pixels per inch */
  scale: number;
  guides: boolean;
  labels: boolean;
  /** safe margin in inches */
  margin: number;
  background?: string;
  selectionId?: string | null;
}

export function renderSheet(ctx: CanvasRenderingContext2D, o: SheetRenderOptions) {
  const W = Math.max(1, Math.round(o.paperW * o.scale));
  const H = Math.max(1, Math.round(o.paperH * o.scale));

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = o.background ?? "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (const it of o.items) {
    const img = o.images.get(it.imgId);
    if (!img) continue;
    ctx.save();
    ctx.translate((it.x + it.w / 2) * o.scale, (it.y + it.h / 2) * o.scale);
    if (it.rot) ctx.rotate((it.rot * Math.PI) / 180);
    try {
      ctx.drawImage(img, (-it.w / 2) * o.scale, (-it.h / 2) * o.scale, it.w * o.scale, it.h * o.scale);
      if (it.border) {
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = Math.max(1, o.scale * 0.003);
        ctx.strokeRect((-it.w / 2) * o.scale, (-it.h / 2) * o.scale, it.w * o.scale, it.h * o.scale);
      }
    } catch {
      /* image not decoded yet */
    }
    ctx.restore();
  }
  ctx.restore();

  if (o.guides) drawGuides(ctx, o, W, H);

  if (o.selectionId) {
    const it = o.items.find((i) => i.id === o.selectionId);
    if (it) {
      ctx.save();
      ctx.translate((it.x + it.w / 2) * o.scale, (it.y + it.h / 2) * o.scale);
      if (it.rot) ctx.rotate((it.rot * Math.PI) / 180);
      ctx.strokeStyle = "#1d5ae6";
      ctx.lineWidth = Math.max(1, o.scale * 0.02);
      ctx.strokeRect(it.x === 0 ? 0 : 0, 0, it.w * o.scale, it.h * o.scale);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawGuides(ctx: CanvasRenderingContext2D, o: SheetRenderOptions, W: number, H: number) {
  const s = o.scale;
  const m = o.margin * s;
  const ink = "#8b95a8";

  // safe margin
  ctx.save();
  ctx.strokeStyle = "rgba(224,134,42,0.75)";
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.setLineDash([Math.max(3, s * 0.06), Math.max(3, s * 0.05)]);
  ctx.strokeRect(m, m, W - m * 2, H - m * 2);
  ctx.setLineDash([]);

  // corner crop marks
  const len = Math.min(m * 0.75, s * 0.16) || s * 0.12;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, s * 0.01);
  const corners: [number, number, number, number][] = [
    [0, 0, 1, 1],
    [W, 0, -1, 1],
    [0, H, 1, -1],
    [W, H, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * m, cy);
    ctx.lineTo(cx + dx * (m + len), cy);
    ctx.moveTo(cx, cy + dy * m);
    ctx.lineTo(cx, cy + dy * (m + len));
    ctx.stroke();
  }
  ctx.restore();

  // frame numbers
  if (o.labels) {
    ctx.save();
    ctx.font = `600 ${Math.max(7, s * 0.1)}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = "top";
    o.items.forEach((it, i) => {
      const label = `${String.fromCharCode(65 + Math.floor(i / 9))}${(i % 9) + 1}`;
      const x = it.x * s + s * 0.04;
      const y = it.y * s + s * 0.04;
      const w = ctx.measureText(label).width + s * 0.08;
      const h = Math.max(7, s * 0.1) + s * 0.06;
      ctx.fillStyle = "rgba(15,27,45,0.72)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + s * 0.04, y + s * 0.03);
    });
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ *
 *  Automatic arrangement                                             *
 * ------------------------------------------------------------------ */

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Packs `count` photos of the given aspect ratio (w/h) onto the paper with an
 * equal gutter and safe margin, centred, never overlapping.
 */
export function layoutGrid(
  count: number,
  paperW: number,
  paperH: number,
  opts: { margin: number; gap: number; aspect: number },
): Cell[] {
  const n = Math.max(1, Math.floor(count));
  const availW = paperW - 2 * opts.margin;
  const availH = paperH - 2 * opts.margin;
  const aspect = opts.aspect > 0 ? opts.aspect : 1;

  let best: { cols: number; rows: number; fw: number; fh: number; score: number } | null = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (availW - (cols - 1) * opts.gap) / cols;
    const ch = (availH - (rows - 1) * opts.gap) / rows;
    if (cw <= 0.05 || ch <= 0.05) continue;
    let fw = cw;
    let fh = cw / aspect;
    if (fh > ch) {
      fh = ch;
      fw = ch * aspect;
    }
    const score = (fw * fh * n) / (paperW * paperH);
    if (!best || score > best.score + 1e-9) best = { cols, rows, fw, fh, score };
  }
  if (!best) best = { cols: 1, rows: 1, fw: availW, fh: availH, score: 0 };

  const cells: Cell[] = [];
  let i = 0;
  for (let r = 0; r < best.rows && i < n; r++) {
    const inRow = Math.min(best.cols, n - i);
    const rowW = inRow * best.fw + (inRow - 1) * opts.gap;
    const x0 = (paperW - rowW) / 2;
    const y0 = (paperH - (best.rows * best.fh + (best.rows - 1) * opts.gap)) / 2 + r * (best.fh + opts.gap);
    for (let c = 0; c < inRow; c++) {
      cells.push({ x: x0 + c * (best.fw + opts.gap), y: y0, w: best.fw, h: best.fh });
      i++;
    }
  }
  return cells;
}

/** Grid of equal cells (used for ID cards / arbitrary images in the sheet editors). */
export function layoutCells(count: number, paperW: number, paperH: number, opts: { margin: number; gap: number }): Cell[] {
  const n = Math.max(1, Math.floor(count));
  let best: { cols: number; rows: number; cw: number; ch: number; score: number } | null = null;
  const availW = paperW - 2 * opts.margin;
  const availH = paperH - 2 * opts.margin;
  const target = paperW / paperH;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (availW - (cols - 1) * opts.gap) / cols;
    const ch = (availH - (rows - 1) * opts.gap) / rows;
    if (cw <= 0.05 || ch <= 0.05) continue;
    const score = -Math.abs(cw / ch - target) + Math.min(cw, ch) * 0.001;
    if (!best || score > best.score) best = { cols, rows, cw, ch, score };
  }
  if (!best) best = { cols: 1, rows: 1, cw: availW, ch: availH, score: 0 };
  const cells: Cell[] = [];
  let i = 0;
  const totalH = best.rows * best.ch + (best.rows - 1) * opts.gap;
  const y0 = (paperH - totalH) / 2;
  for (let r = 0; r < best.rows && i < n; r++) {
    const inRow = Math.min(best.cols, n - i);
    const rowW = inRow * best.cw + (inRow - 1) * opts.gap;
    const x0 = (paperW - rowW) / 2;
    const y = y0 + r * (best.ch + opts.gap);
    for (let c = 0; c < inRow; c++) {
      cells.push({ x: x0 + c * (best.cw + opts.gap), y, w: best.cw, h: best.ch });
      i++;
    }
  }
  return cells;
}

/* ------------------------------------------------------------------ *
 *  Encoding + DPI metadata                                           *
 * ------------------------------------------------------------------ */

export function canvasToBlobPromise(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Browser could not encode the image. Try a lower DPI."))),
      type,
      quality,
    );
  });
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start: number, len: number): number {
  let c = 0xffffffff;
  for (let i = start; i < start + len; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Inserts a pHYs chunk so PNG viewers report the true DPI. */
export function patchPngDpi(png: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  if (png[0] !== 0x89 || png[1] !== 0x50) return png as Uint8Array<ArrayBuffer>;
  const ihdrEnd = 8 + 4 + 4 + 13 + 4; // sig + len + 'IHDR' + data + crc
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // unit = metre
  const crc = crc32(chunk, 4, 4 + 9);
  dv.setUint32(17, crc);
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

/** Rewrites the JFIF density header so photo apps report the true DPI. */
export function patchJpegDpi(jpeg: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  const b = jpeg;
  if (b[0] !== 0xff || b[1] !== 0xd8) return b as Uint8Array<ArrayBuffer>;
  // 0:FFD8 2:FFE0 4:len 6:'JFIF\0' 11:major 12:minor 13:units 14-15:Xdpi 16-17:Ydpi
  if (b[2] === 0xff && b[3] === 0xe0 && b[6] === 0x4a && b[7] === 0x46 && b[8] === 0x49 && b[9] === 0x46 && b[10] === 0x00) {
    const out = new Uint8Array(b);
    out[13] = 1; // units: dots per inch
    out[14] = (dpi >> 8) & 0xff;
    out[15] = dpi & 0xff;
    out[16] = (dpi >> 8) & 0xff;
    out[17] = dpi & 0xff;
    return out;
  }
  return b as Uint8Array<ArrayBuffer>;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ------------------------------------------------------------------ *
 *  Export pipeline                                                    *
 * ------------------------------------------------------------------ */

export interface ExportJob {
  paperW: number;
  paperH: number;
  paperName: string;
  items: DocItem[];
  images: Map<string, HTMLImageElement>;
  dpi: number;
  guides: boolean;
  labels: boolean;
  margin: number;
  format: ExportFormat;
  quality: number;
  name: string;
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  filename: string;
  ms: number;
}

export async function renderAtDpi(job: ExportJob): Promise<HTMLCanvasElement> {
  const { w, h } = paperPixels({ w: job.paperW, h: job.paperH }, job.dpi);
  assertCanvasBudget(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  renderSheet(ctx, {
    paperW: job.paperW,
    paperH: job.paperH,
    items: job.items,
    images: job.images,
    scale: job.dpi,
    guides: job.guides,
    labels: job.labels,
    margin: job.margin,
    background: "#ffffff",
  });
  return canvas;
}

export async function exportSheet(job: ExportJob): Promise<ExportResult> {
  const t0 = performance.now();
  const canvas = await renderAtDpi(job);
  const { w, h } = paperPixels({ w: job.paperW, h: job.paperH }, job.dpi);
  const base = `${slug(job.name)}_${fmt(job.paperW, 2)}x${fmt(job.paperH, 2)}in_${job.dpi}dpi_${stamp()}`;

  let blob: Blob;
  let filename: string;

  if (job.format === "png") {
    const raw = await canvasToBlobPromise(canvas, "image/png");
    const buf = new Uint8Array(await raw.arrayBuffer());
    blob = new Blob([patchPngDpi(buf, job.dpi)], { type: "image/png" });
    filename = `${base}.png`;
  } else if (job.format === "jpg") {
    const raw = await canvasToBlobPromise(canvas, "image/jpeg", clamp01(job.quality));
    const buf = new Uint8Array(await raw.arrayBuffer());
    blob = new Blob([patchJpegDpi(buf, job.dpi)], { type: "image/jpeg" });
    filename = `${base}.jpg`;
  } else {
    // Physical page size in INCHES, not pixels.
    const pdf = new jsPDF({
      unit: "in",
      format: [job.paperW, job.paperH],
      orientation: job.paperW >= job.paperH ? "landscape" : "portrait",
      compress: true,
    });
    pdf.setProperties({ title: base, creator: "Photo Print Studio Pro" });
    const dataUrl = canvas.toDataURL("image/jpeg", Math.max(0.9, clamp01(job.quality)));
    pdf.addImage(dataUrl, "JPEG", 0, 0, job.paperW, job.paperH, undefined, "FAST");
    const out = pdf.output("blob");
    blob = out as Blob;
    filename = `${base}.pdf`;
  }

  downloadBlob(blob, filename);
  return { blob, width: w, height: h, filename, ms: Math.round(performance.now() - t0) };
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0.5, v));
}

/** Print at physical size — the browser print dialog still owns paper/scaling. */
export async function printSheet(job: ExportJob): Promise<{ width: number; height: number }> {
  const canvas = await renderAtDpi({ ...job, dpi: Math.min(job.dpi, 600) });
  const { w, h } = paperPixels({ w: job.paperW, h: job.paperH }, Math.min(job.dpi, 600));
  const url = canvas.toDataURL("image/jpeg", 0.97);
  const root = document.getElementById("print-root");
  if (!root) throw new Error("Print surface missing.");
  root.innerHTML = "";
  const img = document.createElement("img");
  img.src = url;
  img.style.width = `${job.paperW}in`;
  img.style.height = `${job.paperH}in`;
  img.style.maxWidth = "none";
  root.appendChild(img);
  await new Promise((r) => setTimeout(r, 60));
  window.print();
  return { width: w, height: h };
}
