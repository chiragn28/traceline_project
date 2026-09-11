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
      <div className="min-h-screen dark:bg-zinc-950">
        <Nav />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </CurrentUserContext.Provider>
  );
}
