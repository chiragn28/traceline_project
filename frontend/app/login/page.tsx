"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/login", { email, password });
      router.push("/overview");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    // Explicit styling here rather than the shared .card/.input/.btn-primary
    // classes, deliberately -- those are used by the dashboard app, which
    // stays light-only and shouldn't pick up dark-mode rules through this
    // page's changes.
    <div className="relative flex min-h-screen items-center justify-center bg-paper px-4 dark:bg-zinc-950">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(rgba(15,23,42,0.14)_1px,transparent_1px)] bg-[size:26px_26px] dark:bg-[radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(rgba(16,185,129,0.3)_1.5px,transparent_1.5px)] bg-[size:104px_104px] bg-[position:13px_13px] dark:bg-[radial-gradient(rgba(52,211,153,0.25)_1.5px,transparent_1.5px)]"
      />
      <div className="relative w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          <span aria-hidden>&larr;</span> Back to homepage
        </Link>
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block transition-opacity hover:opacity-80">
            <Image
              src="/brand/logo-lockup-light.png"
              alt="Traceline"
              width={520}
              height={130}
              className="mx-auto h-9 w-auto dark:hidden"
              priority
            />
            <Image
              src="/brand/logo-lockup.png"
              alt="Traceline"
              width={520}
              height={130}
              className="mx-auto hidden h-9 w-auto dark:block"
              priority
            />
          </Link>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-500">
            Audit-ready access reviews
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Email</label>
            <input
              type="email"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-ink focus:border-slate-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Password</label>
            <input
              type="password"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-ink focus:border-slate-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="font-medium text-slate-700 dark:text-zinc-200">Just looking? Use the demo workspace.</p>
          <p className="mt-1 break-all font-mono text-[12.5px] leading-relaxed text-slate-500 dark:text-zinc-400">
            {DEMO_EMAIL}
            <br />
            {DEMO_PASSWORD}
          </p>
          <button
            type="button"
            onClick={() => {
              setEmail(DEMO_EMAIL);
              setPassword(DEMO_PASSWORD);
            }}
            className="mt-3 text-sm font-medium text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            Fill in demo credentials →
          </button>
        </div>
      </div>
    </div>
  );
}
