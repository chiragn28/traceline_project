"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/CurrentUserContext";
import ThemeToggle from "@/components/marketing/ThemeToggle";

const LINKS = [
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

  async function logout() {
    await api.post("/auth/logout");
    router.push("/login");
  }

  return (
    <header className="border-b border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold tracking-tight dark:text-zinc-100">traceline</span>
          <nav className="flex gap-1">
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
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
            {user.role}
          </span>
          <ThemeToggle />
          <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
