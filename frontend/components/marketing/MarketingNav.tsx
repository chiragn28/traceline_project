import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

export default function MarketingNav() {
  return (
    <header className="sticky top-0 z-20 h-16 border-b border-slate-200 bg-paper/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
        <span className="font-mono text-[15px] font-semibold tracking-tight text-ink dark:text-zinc-50">
          traceline
        </span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-emerald-600 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
