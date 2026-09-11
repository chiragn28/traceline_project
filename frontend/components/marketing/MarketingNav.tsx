import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

export default function MarketingNav() {
  return (
    <header className="sticky top-0 z-20 h-16 border-b border-slate-200 bg-paper/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center">
          <Image
            src="/brand/logo-lockup-light.png"
            alt="Traceline"
            width={520}
            height={130}
            className="h-7 w-auto dark:hidden"
            priority
          />
          <Image
            src="/brand/logo-lockup.png"
            alt="Traceline"
            width={520}
            height={130}
            className="hidden h-7 w-auto dark:block"
            priority
          />
        </Link>
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
