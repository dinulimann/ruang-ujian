import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

export function Button({ variant = "primary", size = "md", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "flag"; size?: "sm" | "md" | "lg" }) {
  const v = { primary: "bg-brand text-white hover:bg-brand-2", secondary: "border border-line bg-panel hover:bg-panel-2", ghost: "text-muted hover:bg-panel-2 hover:text-fg",
    danger: "border border-bad/30 bg-panel text-bad hover:bg-bad-soft", flag: "border border-flag/40 bg-flag-soft text-flag hover:brightness-95" }[variant];
  const s = { sm: "h-9 px-3 text-[13px]", md: "h-11 px-4 text-sm", lg: "h-13 px-6 text-base" }[size];
  return <button {...rest} className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold whitespace-nowrap transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${s} ${v} ${className}`} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "bad" | "warn" | "brand" | "flag"; children: ReactNode }) {
  const t = { neutral: "bg-panel-2 text-muted", good: "bg-good-soft text-good", bad: "bg-bad-soft text-bad", warn: "bg-warn-soft text-warn", brand: "bg-brand-soft text-brand", flag: "bg-flag-soft text-flag" }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${t}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, width = "max-w-lg" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => (ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>("input, textarea, select, button"))?.focus(), 40);
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", on);
    return () => { removeEventListener("keydown", on); prev?.focus?.(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="fixed inset-0 bg-[#1b1b2f]/45" onClick={onClose} />
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={title} initial={{ y: 16 }} animate={{ y: 0 }} exit={{ y: 8 }} className={`relative w-full ${width} rounded-2xl bg-panel shadow-2xl`}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} aria-label="Tutup" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-panel-2"><X size={18} /></button></div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? <span className="mt-1 block text-xs font-semibold text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const input = (err?: string) => `h-11 w-full rounded-xl border bg-panel px-3.5 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 ${err ? "border-bad" : "border-line"}`;

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden />;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center"><p className="font-bold">{title}</p>{children && <div className="mt-1 text-sm text-muted">{children}</div>}</div>;
}
