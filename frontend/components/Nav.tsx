"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

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

  async function logout() {
    await api.post("/auth/logout");
    router.push("/login");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold tracking-tight">traceline</span>
          <nav className="flex gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === link.href
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-800">
          Log out
        </button>
      </div>
    </header>
  );
}
