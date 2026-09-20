import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";

export function EmptyState({
  icon: IconCmp,
  title,
  hint,
  action,
  compact = false,
}: {
  icon: Icon;
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "px-6 py-10" : "px-6 py-16"}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500">
        <IconCmp size={20} />
      </span>
      <p className="mt-4 text-sm font-medium text-slate-800 dark:text-zinc-100">{title}</p>
      {hint && <p className="mt-1 max-w-[44ch] text-sm text-slate-500 dark:text-zinc-400">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
