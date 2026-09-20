export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  const past = seconds >= 0;
  const s = Math.abs(seconds);
  const wrap = (v: string) => (past ? `${v} ago` : `in ${v}`);
  if (s < 45) return "just now";
  if (s < 3600) return wrap(`${Math.max(1, Math.round(s / 60))}m`);
  if (s < 86400) return wrap(`${Math.round(s / 3600)}h`);
  if (s < 86400 * 30) return wrap(`${Math.round(s / 86400)}d`);
  if (s < 86400 * 365) return wrap(`${Math.round(s / (86400 * 30))}mo`);
  return wrap(`${Math.round(s / (86400 * 365))}y`);
}

export function formatAbsolute(iso: string, withTime = true): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(d);
}

export function Time({
  value,
  mode = "relative",
  className = "",
}: {
  value: string | null | undefined;
  mode?: "relative" | "date" | "datetime";
  className?: string;
}) {
  if (!value) return <span className="text-slate-400 dark:text-zinc-500">—</span>;
  const abs = formatAbsolute(value, true);
  const text = mode === "relative" ? formatRelative(value) : mode === "date" ? formatAbsolute(value, false) : abs;
  return (
    <time dateTime={value} title={abs} className={`whitespace-nowrap tabular-nums ${className}`}>
      {text}
    </time>
  );
}
