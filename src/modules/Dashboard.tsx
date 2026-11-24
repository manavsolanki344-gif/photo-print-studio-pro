import React from "react";
import {
  Aperture,
  ScanLine,
  Grid2x2,
  Images,
  Layers,
  ArrowRight,
  Upload,
  Clock3,
  FileDown,
  FolderOpen,
  ChevronRight,
  Settings2,
} from "lucide-react";
import hero from "@/assets/hero-lab.jpg";
import { useStudio } from "@/lib/studio";
import type { ExportRecord, ProjectRecord, ViewId } from "@/lib/types";
import { DPI_OPTIONS, PAPERS, paperPixels, paperLabel, fmt } from "@/lib/paper";
import { listExports, listProjects } from "@/lib/db";
import { cn, Panel, Seg, Notice } from "@/components/ui";

interface CardDef {
  id: ViewId;
  title: string;
  desc: string;
  meta: string;
  icon: React.ElementType;
  span: string;
}

const CARDS: CardDef[] = [
  {
    id: "passport",
    title: "Create Passport Photos",
    desc:
      "Crop to 35 × 45 mm, 2 × 2 in or any custom size, tune brightness and contrast, then duplicate eight identical copies onto one glossy sheet with cutting guides.",
    meta: "Workflow A · crop → 8 copies → 4 × 5 sheet → export",
    icon: Aperture,
    span: "col-span-6 lg:col-span-4 lg:row-span-2",
  },
  {
    id: "idcrop",
    title: "Crop ID Card Front & Back",
    desc: "Open a PDF or scan, drag a rectangle around the front, then the back. Two clean images, full original resolution.",
    meta: "PDF · JPG · PNG · WebP",
    icon: ScanLine,
    span: "col-span-6 lg:col-span-2 lg:row-span-2",
  },
  { id: "sheet45", title: "Create 4 × 5 Print Sheet", desc: "Landscape gloss paper, 5.00 × 4.00 in exactly.", meta: "1500 × 1200 px @ 300 DPI", icon: Grid2x2, span: "col-span-6 sm:col-span-2" },
  { id: "sheet46", title: "Create 4 × 6 Print Sheet", desc: "Landscape gloss paper, 6.00 × 4.00 in exactly.", meta: "1800 × 1200 px @ 300 DPI", icon: Images, span: "col-span-6 sm:col-span-2" },
  { id: "custom", title: "Custom Photo Layout", desc: "Free drag, resize, rotate, lock and layer order.", meta: "4 × 5 or 4 × 6 paper", icon: Layers, span: "col-span-6 sm:col-span-2" },
];

export default function Dashboard() {
  const { settings, patchSettings, navigate, setIncoming } = useStudio();
  const paper = settings.paperKey === "4x6" ? PAPERS["4x6"] : PAPERS["4x5"];
  const [projects, setProjects] = React.useState<ProjectRecord[]>([]);
  const [exports, setExports] = React.useState<ExportRecord[]>([]);
  const [dropOver, setDropOver] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let alive = true;
    listProjects().then((p) => alive && setProjects(p));
    listExports().then((e) => alive && setExports(e));
    return () => {
      alive = false;
    };
  }, []);

  const accept = (files: FileList) => {
    const f = files[0];
    if (!f) return;
    const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    setIncoming({ file: f, kind: isPdf ? "pdf" : "image", from: "dashboard" });
    navigate(isPdf ? "idcrop" : "passport");
  };

  const openProject = () => {
    navigate("projects");
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-6 2xl:px-8 2xl:py-8" onDragOver={(e) => e.preventDefault()}>
      <div className="mx-auto grid max-w-[1700px] grid-cols-12 gap-4 2xl:max-w-[1920px] 2xl:gap-5">
        {/* ---------------- hero: the job ticket ---------------- */}
        <div
          className={cn(
            "card relative col-span-12 overflow-hidden lg:col-span-8",
            dropOver && "ring-2 ring-brand ring-offset-2 ring-offset-canvas",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDropOver(true);
          }}
          onDragLeave={() => setDropOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropOver(false);
            if (e.dataTransfer.files?.length) accept(e.dataTransfer.files);
          }}
        >
          <div className="relative z-10 max-w-[62%] p-6 2xl:p-9">
            <div className="flex items-center gap-2">
              <span className="num rounded border border-line bg-[#fafbfd] px-2 py-0.5 text-[10.5px] tracking-wider text-muted">
                JOB TICKET
              </span>
              <span className="num text-[10.5px] tracking-wider text-muted">{new Date().toLocaleDateString()}</span>
            </div>
            <h2 className="mt-3 text-[34px] font-bold leading-[1.04] tracking-[-0.03em] text-ink 2xl:text-[46px]">
              Print the sheet,
              <br />
              not the settings.
            </h2>
            <p className="mt-3 max-w-[520px] text-[13.5px] leading-relaxed text-body 2xl:text-[15.5px]">
              Passport photos, Aadhaar front &amp; back crops and glossy 4 × 5 / 4 × 6 sheets — every pixel processed
              on this computer, exported at the exact paper size you hand to the printer.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                <Upload size={14} strokeWidth={2.2} /> Quick upload
              </button>
              <button className="btn" onClick={() => navigate("passport")}>
                <Aperture size={14} /> New passport sheet
              </button>
              <button className="btn" onClick={() => navigate("idcrop")}>
                <ScanLine size={14} /> Open document
              </button>
              <button className="btn" onClick={() => navigate("settings")}>
                <Settings2 size={14} /> Settings
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {(["4x5", "4x6"] as const).map((k) => {
                const p = PAPERS[k];
                const on = settings.paperKey === k;
                const px = paperPixels(p, settings.dpi);
                return (
                  <button
                    key={k}
                    onClick={() => patchSettings({ paperKey: k })}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all",
                      on ? "border-brand bg-wash" : "border-line bg-white hover:border-[#b9c8e6]",
                    )}
                  >
                    <span
                      className={cn("block rounded-[3px] border", on ? "border-brand bg-brand/15" : "border-[#b9c1cf] bg-[#f0f2f6]")}
                      style={{ width: p.w * 7, height: p.h * 7 }}
                    />
                    <span>
                      <span className="block text-[12.5px] font-semibold text-ink">{paperLabel(p)}</span>
                      <span className="num block text-[11px] text-muted">
                        {px.w} × {px.h} px @ {settings.dpi} DPI
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="absolute inset-y-0 right-0 w-[46%]">
            <img src={hero} alt="" className="h-full w-full object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/45 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-white/55 to-transparent" />
          </div>

          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              if (e.target.files?.length) accept(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* ---------------- right rail ---------------- */}
        <div className="col-span-12 flex flex-col gap-4 lg:col-span-4">
          <Panel
            title="Resolution · live pixel size"
            right={
              <Seg
                value={settings.dpi}
                onChange={(v) => patchSettings({ dpi: v })}
                options={DPI_OPTIONS.map((d) => ({ value: d, label: `${d}`, title: `${d} DPI` }))}
              />
            }
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[12.5px] text-body">{paperLabel(paper)} landscape</span>
              <span className="num text-[12.5px] font-medium text-brand">
                {paperPixels(paper, settings.dpi).w} × {paperPixels(paper, settings.dpi).h} px
              </span>
            </div>
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr className="label border-b border-line2 text-left">
                  <th className="pb-1 font-semibold">DPI</th>
                  <th className="pb-1 text-right font-semibold">Width</th>
                  <th className="pb-1 text-right font-semibold">Height</th>
                  <th className="pb-1 text-right font-semibold">Aspect</th>
                </tr>
              </thead>
              <tbody className="num">
                {DPI_OPTIONS.map((d) => {
                  const px = paperPixels(paper, d);
                  const on = d === settings.dpi;
                  return (
                    <tr
                      key={d}
                      onClick={() => patchSettings({ dpi: d })}
                      className={cn(
                        "cursor-pointer border-b border-line2 last:border-0",
                        on ? "bg-wash text-brand" : "text-body hover:bg-[#f7f9fc]",
                      )}
                    >
                      <td className="py-1.5 font-medium">{d}</td>
                      <td className="py-1.5 text-right">{px.w}</td>
                      <td className="py-1.5 text-right">{px.h}</td>
                      <td className="py-1.5 text-right text-muted">{fmt(paper.w / paper.h, 3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] leading-snug text-muted">
              Output DPI is written into the file; physical print size is set by the printer driver — keep it at
              100 % / Actual size.
            </p>
          </Panel>

          <div className="card p-3">
            <div className="label mb-2">Quick upload</div>
            <div
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[#cfd6e2] px-3 py-3 transition-colors hover:border-brand hover:bg-wash"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) accept(e.dataTransfer.files);
              }}
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-wash text-brand">
                <Upload size={17} strokeWidth={1.9} />
              </span>
              <span>
                <span className="block text-[12.5px] font-semibold text-ink">Drop a photo or Aadhaar PDF</span>
                <span className="block text-[11px] text-muted">JPG · PNG · WebP · PDF — routed to the right tool</span>
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button className="btn btn-sm" onClick={() => navigate("passport")}>
                Passport
              </button>
              <button className="btn btn-sm" onClick={() => navigate("idcrop")}>
                ID crop
              </button>
              <button className="btn btn-sm" onClick={() => navigate("custom")}>
                Layout
              </button>
            </div>
          </div>
        </div>

        {/* ---------------- module cards ---------------- */}
        <div className="col-span-12 grid grid-cols-6 gap-4">
          {CARDS.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                onClick={() => navigate(c.id)}
                className={cn(
                  "card group relative flex flex-col overflow-hidden p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[#b9c8e6] hover:shadow-[0_10px_30px_rgba(15,27,45,0.10)] 2xl:p-6",
                  c.span,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-wash text-brand transition-colors group-hover:bg-brand group-hover:text-white 2xl:h-12 2xl:w-12">
                    <Icon size={19} strokeWidth={1.9} />
                  </span>
                  <ArrowRight
                    size={16}
                    className="mt-1 text-muted transition-all group-hover:translate-x-0.5 group-hover:text-brand"
                  />
                </div>
                <div className="mt-3.5 text-[16px] font-bold tracking-[-0.01em] text-ink 2xl:text-[18px]">{c.title}</div>
                <p className="mt-2 text-[13.5px] leading-snug text-body 2xl:text-[14.5px]">{c.desc}</p>
                <div className="num mt-auto pt-4 text-[11.5px] tracking-wide text-muted 2xl:text-[12.5px]">{c.meta}</div>
              </button>
            );
          })}
        </div>

        {/* ---------------- lists ---------------- */}
        <div className="col-span-12 grid grid-cols-12 gap-4 pb-4">
          <div className="col-span-12 xl:col-span-6">
            <Panel
              title="Recent projects"
              right={
                <button className="btn btn-sm" onClick={() => navigate("projects")}>
                  <FolderOpen size={13} /> Open
                </button>
              }
              bodyClass="p-0"
            >
              {projects.length === 0 ? (
                <div className="flex items-center gap-3 px-4 py-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f2f4f8] text-muted">
                    <Clock3 size={16} />
                  </span>
                  <p className="text-[12.5px] leading-snug text-muted">
                    Nothing saved yet. Press <span className="num text-ink">Ctrl + S</span> inside any editor to keep a
                    project in this browser.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line2">
                  {projects.slice(0, 5).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-semibold text-ink">{p.name}</div>
                        <div className="num text-[11px] text-muted">
                          {paperLabel(p.paper)} · {p.items.length} objects ·{" "}
                          {new Date(p.updatedAt).toLocaleString()}
                        </div>
                      </div>
                      <button className="btn btn-sm" onClick={openProject}>
                        Open <ChevronRight size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="col-span-12 xl:col-span-6">
            <Panel title="Recently exported files" bodyClass="p-0">
              {exports.length === 0 ? (
                <div className="flex items-center gap-3 px-4 py-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f2f4f8] text-muted">
                    <FileDown size={16} />
                  </span>
                  <p className="text-[12.5px] leading-snug text-muted">
                    Exports appear here with their paper size and resolution — JPG, PNG and print-ready PDF.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line2">
                  {exports.slice(0, 5).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-semibold text-ink">{e.name}</div>
                        <div className="num text-[11px] text-muted">
                          {e.kind.toUpperCase()} · {e.paper} · {e.dpi} DPI · {e.pixels} px
                        </div>
                      </div>
                      <span className="num shrink-0 text-[11px] text-muted">
                        {new Date(e.at).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <div className="col-span-12 pb-6">
          <Notice kind="info">
            Privacy: files are read with the browser File API and rendered on the HTML5 canvas. Nothing is transmitted —
            the app keeps working with the network switched off.
          </Notice>
        </div>
      </div>
    </div>
  );
}
