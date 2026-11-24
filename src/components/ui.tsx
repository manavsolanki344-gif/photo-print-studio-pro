import React from "react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { Upload, X, TriangleExclamationPoint } from "lucide-react";

export function cn(...parts: unknown[]) {
  return twMerge(clsx(parts as never));
}

export function Panel({
  title,
  right,
  children,
  className,
  bodyClass,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cn("card overflow-hidden", className)}>
      {(title || right) && (
        <div className="panel-head">
          <div className="label">{title}</div>
          {right}
        </div>
      )}
      <div className={cn("p-3", bodyClass)}>{children}</div>
    </section>
  );
}

export function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[12.5px] text-body">
        {label}
        {hint && <span className="ml-1 text-[11px] text-muted">{hint}</span>}
      </span>
      <span className="flex items-center gap-2">{children}</span>
    </label>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("seg", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          data-on={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <span className="flex w-[168px] items-center gap-2">
      <input
        type="range"
        className="min-w-0 flex-1 cursor-pointer accent-brand"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="num w-[52px] shrink-0 text-right text-[11.5px] text-ink">
        {value}
        {suffix}
      </span>
    </span>
  );
}

export function NumInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  width = 84,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  width?: number;
}) {
  return (
    <span className="relative inline-flex items-center">
      <input
        type="number"
        className="field num pr-7 text-right text-[12.5px]"
        style={{ width }}
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {suffix && <span className="num pointer-events-none absolute right-2 text-[10.5px] text-muted">{suffix}</span>}
    </span>
  );
}

export function Dropzone({
  onFiles,
  accept,
  multiple = false,
  title,
  hint,
  icon,
  className,
}: {
  onFiles: (files: FileList) => void;
  accept?: string;
  multiple?: boolean;
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const [over, setOver] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-5 py-6 text-center transition-colors",
        over ? "border-brand bg-wash" : "border-[#cfd6e2] bg-white hover:border-brand hover:bg-wash/60",
        className,
      )}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
    >
      <span className={cn("mb-0.5 text-brand", over && "scale-105 transition-transform")}>
        {icon ?? <Upload size={20} strokeWidth={1.75} />}
      </span>
      <span className="text-[13px] font-semibold text-ink">{title}</span>
      {hint && <span className="max-w-[320px] text-[11.5px] leading-snug text-muted">{hint}</span>}
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function Notice({
  kind = "info",
  children,
  action,
}: {
  kind?: "info" | "warn" | "error" | "ok";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    info: "border-[#cfdcfb] bg-wash text-[#17408f]",
    warn: "border-[#f3d5ab] bg-[#fdf5ea] text-[#8a5312]",
    error: "border-[#f2c9c1] bg-[#fdf1ef] text-[#96321f]",
    ok: "border-[#bfe3d3] bg-[#eefaf5] text-[#146247]",
  };
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-snug", tones[kind])}>
      {kind !== "ok" && (
        <span className="mt-px shrink-0">
          {kind === "info" ? <InfoDot /> : <TriangleExclamationPoint size={14} strokeWidth={2} />}
        </span>
      )}
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

function InfoDot() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 6.2v4M7 4.1v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1b2d]/35 p-6" onClick={onClose}>
      <div
        className="card fade-in w-full max-w-[440px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="panel-head">
          <div className="text-[14px] font-semibold text-ink">{title}</div>
          <button className="icon-btn h-7 w-7" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="p-4 text-[13px]">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line2 bg-[#fafbfd] px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "blue" | "amber" }) {
  return (
    <div className="min-w-0">
      <div className="label mb-0.5">{label}</div>
      <div className={cn("num truncate text-[13px] font-medium", tone === "blue" ? "text-brand" : "text-ink")}>
        {value}
      </div>
    </div>
  );
}

export function ToolbarSep() {
  return <span className="mx-1 h-5 w-px bg-line" />;
}
