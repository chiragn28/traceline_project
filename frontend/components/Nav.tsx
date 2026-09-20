"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { List, X } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/CurrentUserContext";
import ThemeToggle from "@/components/marketing/ThemeToggle";

const LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/data-sources", label: "Data Sources" },
  { href: "/lineage", label: "Lineage" },
  { href: "/access-logs", label: "Access Logs" },
  { href: "/violations", label: "Violations" },
  { href: "/access-reviews", label: "Access Reviews" },
  { href: "/reports", label: "Reports" },
  { href: "/team", label: "Team" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Seven links plus account controls don't fit one row below md -- collapse
  // to a toggled panel instead of letting them wrap or overflow. Closing on
  // every route change means a link tap doesn't leave the panel open behind
  // the new page.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function logout() {
    await api.post("/auth/logout");
    router.push("/login");
  }

  return (
    // Sticky + translucent + blurred, rather than a flat opaque bar, so the
    // page's dot-grid pattern shows through softly diffused underneath it --
    // that reads as a deliberately distinct "glass" surface for chrome vs.
    // the crisp texture in the content area, instead of a flat slab dropped
    // on top of a textured page.
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/75 shadow-[0_1px_3px_rgba(15,23,42,0.06)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/75 dark:shadow-none">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/overview" className="flex items-center">
            <Image
              src="/brand/logo-lockup-light.png"
              alt="Traceline"
              width={520}
              height={130}
              className="h-8 w-auto dark:hidden"
              priority
            />
            <Image
              src="/brand/logo-lockup.png"
              alt="Traceline"
              width={520}
              height={130}
              className="hidden h-8 w-auto dark:block"
              priority
            />
          </Link>
          <nav className="hidden gap-1 md:flex">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === link.href
                    ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
            {user.role}
          </span>
          <ThemeToggle />
          <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100">
            Log out
          </button>
        </div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-900 md:hidden"
        >
          {mobileOpen ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
        </button>
      </div>

      {mobileOpen && (
        <nav className="border-t border-slate-200 px-6 py-3 dark:border-zinc-800 md:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  pathname === link.href
                    ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-zinc-800">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
              {user.role}
            </span>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100">
                Log out
              </button>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
