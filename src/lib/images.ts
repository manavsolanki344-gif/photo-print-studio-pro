export type FilterState = {
  brightness: number; // 100 = unchanged
  contrast: number;
  saturation: number;
};

export const NEUTRAL_FILTER: FilterState = { brightness: 100, contrast: 100, saturation: 100 };

export function filterCss(f: FilterState): string {
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%)`;
}

/** Owns every raster asset used by the app and revokes object URLs on removal. */
export class ImageStore {
  private map = new Map<string, HTMLImageElement>();
  private urls = new Map<string, string>();

  add(img: HTMLImageElement, id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, url?: string) {
    this.map.set(id, img);
    if (url) this.urls.set(id, url);
    return id;
  }

  get(id: string): HTMLImageElement | undefined {
    return this.map.get(id);
  }

  has(id: string) {
    return this.map.has(id);
  }

  ids(): string[] {
    return [...this.map.keys()];
  }

  entries() {
    return [...this.map.entries()];
  }

  remove(id: string) {
    const url = this.urls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(id);
    this.map.delete(id);
  }

  clear() {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.map.clear();
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image file. It may be damaged or in an unsupported format."));
    img.src = src;
  });
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/jpg", "image/bmp"];

export function isAcceptedImage(file: File): boolean {
  if (ACCEPTED.includes(file.type.toLowerCase())) return true;
  return /\.(jpe?g|png|webp|bmp)$/i.test(file.name);
}

/** Reads an image file into memory. The object URL stays attached to the element
 *  and is revoked by ImageStore.remove()/clear(). */
export async function fileToImage(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  if (!isAcceptedImage(file)) {
    throw new Error(`“${file.name}” is not a supported image. Use JPG, PNG or WebP.`);
  }
  if (file.size > 120 * 1024 * 1024) {
    throw new Error(`“${file.name}” is larger than 120 MB. Please use a smaller file.`);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return { img, url };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function filesToImages(files: FileList | File[]) {
  const out: { img: HTMLImageElement; url: string; name: string }[] = [];
  const errors: string[] = [];
  for (const file of Array.from(files)) {
    try {
      const { img, url } = await fileToImage(file);
      out.push({ img, url, name: file.name });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { out, errors };
}

/** Draws the source image rotated by whole quarter turns onto a fresh canvas. */
export function rotateQuarter(src: CanvasImageSource, w: number, h: number, turns: number): HTMLCanvasElement {
  const t = ((turns % 4) + 4) % 4;
  const c = document.createElement("canvas");
  const swap = t % 2 === 1;
  c.width = swap ? h : w;
  c.height = swap ? w : h;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((t * 90 * Math.PI) / 180);
  ctx.drawImage(src, -w / 2, -h / 2);
  return c;
}

/** Intrinsic size of a drawable source (never the laid-out CSS size). */
export function sourceSize(src: CanvasImageSource): { w: number; h: number } {
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) {
    return { w: src.naturalWidth, h: src.naturalHeight };
  }
  if (typeof HTMLCanvasElement !== "undefined" && src instanceof HTMLCanvasElement) {
    return { w: src.width, h: src.height };
  }
  if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) {
    return { w: src.width, h: src.height };
  }
  const anySrc = src as unknown as { width?: number; height?: number };
  return { w: anySrc.width ?? 0, h: anySrc.height ?? 0 };
}

export function cropCanvas(
  src: CanvasImageSource,
  rect: { x: number; y: number; w: number; h: number },
  opts: { filter?: FilterState; maxSide?: number } = {},
): HTMLCanvasElement {
  const intrinsic = sourceSize(src);
  let { x, y, w, h } = rect;
  x = Math.max(0, Math.round(x));
  y = Math.max(0, Math.round(y));
  w = Math.max(1, Math.round(Math.min(w, intrinsic.w || w)));
  h = Math.max(1, Math.round(Math.min(h, intrinsic.h || h)));
  if (intrinsic.w) x = Math.min(x, Math.max(0, intrinsic.w - 1));
  if (intrinsic.h) y = Math.min(y, Math.max(0, intrinsic.h - 1));

  let dw = w;
  let dh = h;
  const maxSide = opts.maxSide ?? 8000;
  if (Math.max(dw, dh) > maxSide) {
    const k = maxSide / Math.max(dw, dh);
    dw = Math.round(dw * k);
    dh = Math.round(dh * k);
  }

  const c = document.createElement("canvas");
  c.width = dw;
  c.height = dh;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (opts.filter) ctx.filter = filterCss(opts.filter);
  ctx.drawImage(src, x, y, w, h, 0, 0, dw, dh);
  return c;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser could not encode this image. Try a lower resolution."))),
      type,
      quality,
    );
  });
}

export function loadImageFromCanvas(c: HTMLCanvasElement): Promise<HTMLImageElement> {
  return loadImage(c.toDataURL("image/png"));
}

export function revokeAll(urls: (string | undefined | null)[]) {
  for (const u of urls) if (u) URL.revokeObjectURL(u);
}
