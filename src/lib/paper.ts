import type { Paper, PassportSize } from "./types";

export const MM_PER_IN = 25.4;

/** Permanent glossy paper presets — landscape, exact physical size. */
export const PAPERS: Record<"4x5" | "4x6", Paper> = {
  "4x5": { w: 5, h: 4, label: "4 × 5 in" },
  "4x6": { w: 6, h: 4, label: "4 × 6 in" },
};

export const DPI_OPTIONS = [300, 450, 600, 900] as const;

export const COPY_PRESETS = [1, 2, 4, 6, 8, 10, 12] as const;

export const PASSPORT_SIZES: PassportSize[] = [
  { id: "35x45", label: "35 × 45 mm (India / ICAO)", w: 35, h: 45, unit: "mm" },
  { id: "2x2", label: "2 × 2 in (US visa)", w: 2, h: 2, unit: "in" },
  { id: "35x35", label: "35 × 35 mm (square)", w: 35, h: 35, unit: "mm" },
  { id: "50x50", label: "50 × 50 mm", w: 50, h: 50, unit: "mm" },
  { id: "40x50", label: "40 × 50 mm", w: 40, h: 50, unit: "mm" },
  { id: "custom", label: "Custom size…", w: 35, h: 45, unit: "mm" },
];

export function mmToIn(mm: number): number {
  return mm / MM_PER_IN;
}
export function inToMm(inch: number): number {
  return inch * MM_PER_IN;
}

/** Convert a passport size definition to inches (portrait, w × h). */
export function sizeToInches(s: { w: number; h: number; unit: "mm" | "in" }) {
  return s.unit === "mm" ? { w: mmToIn(s.w), h: mmToIn(s.h) } : { w: s.w, h: s.h };
}

export function px(inches: number, dpi: number): number {
  return Math.round(inches * dpi);
}

export function paperPixels(paper: { w: number; h: number }, dpi: number) {
  return { w: px(paper.w, dpi), h: px(paper.h, dpi) };
}

export function paperLabel(paper: { w: number; h: number }): string {
  if (paper.w === 5 && paper.h === 4) return "4 × 5 in";
  if (paper.w === 6 && paper.h === 4) return "4 × 6 in";
  return `${fmt(paper.w)} × ${fmt(paper.h)} in`;
}

export function fmt(n: number, d = 2): string {
  const v = Number(n.toFixed(d));
  return String(v);
}

export function inchesText(n: number): string {
  return `${fmt(n)} in`;
}

export function dpiText(dpi: number): string {
  return `${dpi} DPI`;
}

/** Short human label for a file name. */
export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "sheet"
  );
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}`;
}

/** Rough memory guard — refuse absurd canvases instead of crashing the tab. */
export function assertCanvasBudget(w: number, h: number) {
  const pixels = w * h;
  const max = 90_000_000; // ~360 MB RGBA
  if (w > 32767 || h > 32767 || pixels > max) {
    throw new Error(
      `Requested output ${w} × ${h} px exceeds the browser canvas limit. ` +
        `Lower the DPI (try 300 or 450) or use a smaller paper size.`,
    );
  }
}
