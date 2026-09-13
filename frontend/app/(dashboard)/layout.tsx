"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { api } from "@/lib/api-client";
import { CurrentUserContext, CurrentUserInfo } from "@/lib/CurrentUserContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUserInfo | null>(null);

  useEffect(() => {
    api
      .get<CurrentUserInfo>("/auth/me")
      .then(setUser)
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400 dark:bg-zinc-950 dark:text-zinc-500">
        Loading...
      </div>
    );
  }

  return (
    <CurrentUserContext.Provider value={user}>
      <div className="relative min-h-screen dark:bg-zinc-950">
        {/* Same dot-grid ground as the marketing site (see app/page.tsx) so the
            dashboard doesn't read as a flatter, separate product. z-index is
            intentionally omitted -- a negative z-index on a `fixed` element
            paints behind body's own solid background-color in Chromium; DOM
            order (first children here) is what actually renders it. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 bg-[radial-gradient(rgba(15,23,42,0.14)_1px,transparent_1px)] bg-[size:26px_26px] dark:bg-[radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)]"
        />
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 bg-[radial-gradient(rgba(16,185,129,0.3)_1.5px,transparent_1.5px)] bg-[size:104px_104px] bg-[position:13px_13px] dark:bg-[radial-gradient(rgba(52,211,153,0.25)_1.5px,transparent_1.5px)]"
        />
        <Nav />
        <main className="relative mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </CurrentUserContext.Provider>
  );
}
