import React from "react";
import { Keyboard, ShieldCheck, Trash, Save, Info, Ruler } from "lucide-react";
import { useStudio } from "@/lib/studio";
import { DPI_OPTIONS, PAPERS, paperLabel, paperPixels } from "@/lib/paper";
import { DEFAULT_SETTINGS, clearAllData, listProjects, persistSettings } from "@/lib/db";
import { Notice, Panel, Row, Seg, Slider } from "@/components/ui";

const SHORTCUTS: [string, string][] = [
  ["Ctrl + Z", "Undo"],
  ["Ctrl + Y / Ctrl + Shift + Z", "Redo"],
  ["Delete / Backspace", "Remove selected object"],
  ["Ctrl + D", "Duplicate selected object"],
  ["Ctrl + S", "Save project locally"],
  ["Ctrl + P", "Print at actual size"],
  ["Arrow keys", "Nudge selection (hold Shift for 0.1 in)"],
  ["Shift + drag handle", "Resize keeping proportions"],
];

export default function SettingsView() {
  const { settings, patchSettings, notify } = useStudio();
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    listProjects().then((p) => setCount(p.length));
  }, []);

  const resetDefaults = async () => {
    patchSettings(DEFAULT_SETTINGS);
    await persistSettings(DEFAULT_SETTINGS);
    notify("Settings restored to defaults.");
  };

  const clearEverything = async () => {
    if (!window.confirm("Delete ALL local projects, images and export history from this browser?")) return;
    await clearAllData();
    patchSettings(DEFAULT_SETTINGS);
    notify("All local data cleared.");
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div className="mx-auto grid max-w-[1200px] grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <Panel title="Paper & resolution defaults" right={<Ruler size={14} className="text-muted" />} bodyClass="p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12.5px] text-body">Default glossy paper</span>
              <Seg
                value={settings.paperKey}
                onChange={(v) => patchSettings({ paperKey: v })}
                options={[
                  { value: "4x5", label: "4 × 5 in" },
                  { value: "4x6", label: "4 × 6 in" },
                ]}
              />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12.5px] text-body">Export resolution</span>
              <Seg
                value={settings.dpi}
                onChange={(v) => patchSettings({ dpi: v })}
                options={DPI_OPTIONS.map((d) => ({ value: d, label: String(d) }))}
              />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12.5px] text-body">Default format</span>
              <Seg
                value={settings.format}
                onChange={(v) => patchSettings({ format: v })}
                options={[
                  { value: "jpg", label: "JPG" },
                  { value: "png", label: "PNG" },
                  { value: "pdf", label: "PDF" },
                ]}
              />
            </div>
            <Row label="JPG quality">
              <Slider
                value={Math.round(settings.quality * 100)}
                min={70}
                max={100}
                onChange={(v) => patchSettings({ quality: v / 100 })}
                suffix="%"
              />
            </Row>
            <Row label="Safe margin">
              <Slider value={settings.margin} min={0} max={1.5} step={0.01} onChange={(v) => patchSettings({ margin: v })} suffix=" in" />
            </Row>
            <Row label="Photo spacing">
              <Slider value={settings.gap} min={0} max={1.5} step={0.01} onChange={(v) => patchSettings({ gap: v })} suffix=" in" />
            </Row>

            <div className="mt-3 rounded-lg border border-line bg-[#fafbfd] p-2.5">
              <div className="label mb-1.5">Physical size reference</div>
              <table className="num w-full text-[11.5px]">
                <thead>
                  <tr className="label text-left">
                    <th className="pb-1">Paper</th>
                    <th className="pb-1 text-right">300 DPI</th>
                    <th className="pb-1 text-right">450 DPI</th>
                    <th className="pb-1 text-right">600 DPI</th>
                    <th className="pb-1 text-right">900 DPI</th>
                  </tr>
                </thead>
                <tbody>
                  {(["4x5", "4x6"] as const).map((k) => (
                    <tr key={k} className="border-t border-line2">
                      <td className="py-1.5 font-medium text-ink">{paperLabel(PAPERS[k])}</td>
                      {DPI_OPTIONS.map((d) => {
                        const px = paperPixels(PAPERS[k], d);
                        return (
                          <td key={d} className="py-1.5 text-right text-body">
                            {px.w}×{px.h}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="mt-4">
            <Notice kind="info">
              Defaults apply to new sheets: {settings.margin.toFixed(2)} in safe margin and {settings.gap.toFixed(2)} in
              spacing between photos, both recalculated whenever the paper size changes.
            </Notice>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <Panel title="Keyboard shortcuts" right={<Keyboard size={14} className="text-muted" />} bodyClass="p-0">
            <ul className="divide-y divide-line2">
              {SHORTCUTS.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="text-[12.5px] text-body">{v}</span>
                  <span className="num rounded border border-line bg-[#fafbfd] px-2 py-0.5 text-[11px] text-ink">{k}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="mt-4">
            <Panel title="Privacy & local storage" right={<ShieldCheck size={14} className="text-ok" />} bodyClass="p-3">
              <ul className="space-y-1.5 text-[12.5px] leading-snug text-body">
                <li>· Every crop, layout and export runs in this browser using the HTML5 canvas.</li>
                <li>· No account, no login, no server, no analytics and no external image API.</li>
                <li>· Aadhaar and passport files are read with the File API and never uploaded.</li>
                <li>· Object URLs are revoked when images are removed from a session.</li>
              </ul>
              <div className="num mt-3 flex items-center justify-between rounded-lg border border-line bg-[#fafbfd] px-3 py-2 text-[12px]">
                <span className="text-muted">Projects on this device</span>
                <span className="text-ink">{count}</span>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn flex-1" onClick={() => void resetDefaults()}>
                  <Info size={14} /> Restore defaults
                </button>
                <button className="btn flex-1" onClick={() => void clearEverything()}>
                  <Trash size={14} /> Clear all data
                </button>
              </div>
            </Panel>
          </div>

          <div className="mt-4">
            <Panel title="Supported inputs" right={<Save size={14} className="text-muted" />} bodyClass="p-3">
              <div className="grid grid-cols-2 gap-2 text-[12.5px] text-body">
                <div>
                  <div className="label mb-1">Images</div>
                  JPG · JPEG · PNG · WebP (large files handled with object URLs)
                </div>
                <div>
                  <div className="label mb-1">Documents</div>
                  PDF (multi-page, PDF.js) via drag &amp; drop or file picker
                </div>
                <div>
                  <div className="label mb-1">Outputs</div>
                  JPG with JFIF DPI header · PNG with pHYs DPI chunk · PDF with true inch page size
                </div>
                <div>
                  <div className="label mb-1">Printing</div>
                  Browser print dialog at 100 % / Actual size; guides hidden from the print surface
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
