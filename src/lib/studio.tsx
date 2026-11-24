import React from "react";
import type { AppSettings, DocItem, ExportRecord, Paper, ViewId } from "./types";
import { ImageStore } from "./images";
import { DEFAULT_SETTINGS } from "./db";

export type SheetSeed = {
  paper: Paper;
  items: DocItem[];
  title?: string;
};

export type IncomingFile = { file: File; kind: "pdf" | "image"; from: ViewId } | null;

export interface SheetDraft {
  paper: Paper;
  items: DocItem[];
  title?: string;
}

interface StudioValue {
  store: ImageStore;
  settings: AppSettings;
  patchSettings: (p: Partial<AppSettings>) => void;
  draft: SheetDraft | null;
  setDraft: (d: SheetDraft | null) => void;
  navigate: (v: ViewId) => void;
  view: ViewId;
  /** push freshly cropped images into one of the sheet editors */
  toSheet: (items: DocItem[], paper: Paper, title?: string) => void;
  seed: SheetSeed | null;
  consumeSeed: () => SheetSeed | null;
  incoming: IncomingFile;
  setIncoming: (v: IncomingFile) => void;
  notify: (msg: string, kind?: "ok" | "error") => void;
  logExport: (r: Omit<ExportRecord, "id">) => void;
}

export const StudioCtx = React.createContext<StudioValue | null>(null);

export function useStudio(): StudioValue {
  const v = React.useContext(StudioCtx);
  if (!v) throw new Error("useStudio must be used inside the studio provider");
  return v;
}

export const emptySettings = DEFAULT_SETTINGS;
