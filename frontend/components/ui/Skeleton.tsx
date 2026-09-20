export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded bg-slate-200/70 dark:bg-zinc-800 ${className}`} />;
}

// Placeholder rows shaped like the table they stand in for, so the page
// doesn't jump when the data lands.
export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}>
              <Skeleton className={`h-3.5 ${c === 0 ? "w-40" : c === cols - 1 ? "w-16" : "w-24"}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
