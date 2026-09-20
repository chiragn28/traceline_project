import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">{eyebrow}</p>
        )}
        <h1 className="mt-1.5 text-[1.65rem] font-semibold leading-tight tracking-tight text-ink dark:text-zinc-50">{title}</h1>
        {description && (
          <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed text-slate-500 dark:text-zinc-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  count,
  description,
  actions,
}: {
  title: string;
  count?: number;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-zinc-100">
          {title}
          {typeof count === "number" && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
              {count}
            </span>
          )}
        </h2>
        {description && <p className="mt-1 max-w-[62ch] text-sm text-slate-500 dark:text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
