export type ViewId =
  | "dashboard"
  | "passport"
  | "idcrop"
  | "sheet45"
  | "sheet46"
  | "custom"
  | "projects"
  | "settings";

/** An object placed on a print sheet. All units are INCHES. */
export interface DocItem {
  id: string;
  imgId: string;
  /** top-left of the unrotated bounding box, in inches */
  x: number;
  y: number;
  w: number;
  h: number;
  /** rotation in degrees around the item centre */
  rot: number;
  lock?: boolean;
  name?: string;
  border?: boolean;
}

export interface Paper {
  w: number;
  h: number;
  label: string;
}

export type ExportFormat = "jpg" | "png" | "pdf";

export interface ExportPrefs {
  dpi: number;
  format: ExportFormat;
  quality: number; // 0..1 for JPG
  guides: boolean; // safe margin + crop marks in exports
  labels: boolean; // frame numbers in exports
}

export interface AppSettings extends ExportPrefs {
  paperKey: "4x5" | "4x6";
  margin: number; // inches
  gap: number; // inches
  rememberProjects: boolean;
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  paper: { w: number; h: number; label: string };
  items: DocItem[];
  /** image id -> data URL (only stored when the operator explicitly saves) */
  images: Record<string, string>;
  settings?: Partial<AppSettings>;
}

export interface ExportRecord {
  id: string;
  name: string;
  kind: ExportFormat;
  at: number;
  paper: string;
  dpi: number;
  pixels: string;
}

export interface PassportSize {
  id: string;
  label: string;
  w: number;
  h: number;
  unit: "mm" | "in";
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
