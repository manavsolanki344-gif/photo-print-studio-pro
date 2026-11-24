import React from "react";
import {
  LayoutDashboard,
  Aperture,
  ScanLine,
  Grid2x2,
  Images,
  Layers,
  FolderClock,
  Settings2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { ViewId } from "@/lib/types";
import { cn } from "@/components/ui";

const NAV: { group: string; items: { id: ViewId; label: string; icon: React.ElementType }[] }[] = [
  {
    group: "Workspace",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "passport", label: "Passport Photo Maker", icon: Aperture },
      { id: "idcrop", label: "ID Card Cropper", icon: ScanLine },
    ],
  },
  {
    group: "Print sheets",
    items: [
      { id: "sheet45", label: "4 × 5 Photo Printing", icon: Grid2x2 },
      { id: "sheet46", label: "4 × 6 Photo Printing", icon: Images },
      { id: "custom", label: "Custom Print Layout", icon: Layers },
    ],
  },
  {
    group: "System",
    items: [
      { id: "projects", label: "Recent Projects", icon: FolderClock },
      { id: "settings", label: "Settings", icon: Settings2 },
    ],
  },
];

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect x="0.9" y="0.9" width="38.2" height="38.2" rx="9" fill="#0f1b2d" />
      {/* crop marks */}
      <path d="M7 4v6M4 7h6M33 4v6M36 7h-6M7 36v-6M4 33h6M33 36v-6M36 33h-6" stroke="#1d5ae6" strokeWidth="1.7" strokeLinecap="round" />
      {/* aperture */}
      <circle cx="20" cy="20" r="8.4" stroke="#ffffff" strokeWidth="1.7" />
      <path d="M20 11.6 26.5 15.3M26.5 15.3l.1 7.6M26.6 22.9 20 26.6M20 26.6l-6.5-3.7M13.5 22.9l-.1-7.6M13.4 15.3 20 11.6" stroke="#1d5ae6" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="3.1" fill="#ffffff" />
    </svg>
  );
}

export function Sidebar({
  view,
  onNavigate,
  onQuickUpload,
}: {
  view: ViewId;
  onNavigate: (v: ViewId) => void;
  onQuickUpload: (file: File) => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-line bg-white 2xl:w-[276px]">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3.5">
        <Logo />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold leading-tight tracking-[-0.01em] text-ink 2xl:text-[16.5px]">
            PHOTO PRINT
          </div>
          <div className="label mt-0.5 !tracking-[0.18em] text-brand">STUDIO PRO</div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button className="btn btn-primary w-full" onClick={() => input.current?.click()}>
          <Upload size={14} strokeWidth={2.2} /> Quick upload
        </button>
        <input
          ref={input}
          type="file"
          className="hidden"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onQuickUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-3">
            <div className="label px-2.5 pb-1.5 pt-1">{g.group}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const on = view === it.id;
                const Icon = it.icon;
                return (
                  <li key={it.id}>
                    <button
                      onClick={() => onNavigate(it.id)}
                      className={cn(
                        "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] font-medium transition-colors 2xl:text-[14px]",
                        on ? "bg-wash text-ink" : "text-body hover:bg-[#f5f7fa] hover:text-ink",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-brand transition-opacity",
                          on ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <Icon
                        size={17}
                        strokeWidth={1.9}
                        className={on ? "text-brand" : "text-muted group-hover:text-body"}
                      />
                      <span className="truncate">{it.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-lg border border-[#cfe8dc] bg-[#f1faf6] px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#146247]">
          <ShieldCheck size={14} strokeWidth={2} /> 100% local processing
        </div>
        <p className="mt-1 text-[11px] leading-snug text-[#3d7a66]">
          Photos and Aadhaar documents never leave this computer. No upload, no server.
        </p>
      </div>
    </aside>
  );
}
