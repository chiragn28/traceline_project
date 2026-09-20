"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";

export default function DemoCredentials({ align = "left" }: { align?: "left" | "center" }) {
  return (
    <div
      className={`mt-4 inline-flex flex-col gap-1 rounded-lg border border-dashed border-slate-300/90 bg-white/70 px-3.5 py-2.5 text-left backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/70 ${
        align === "center" ? "items-center" : ""
      }`}
    >
      <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-500">Demo login</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12.5px] text-slate-700 dark:text-zinc-300">
        <span className="inline-flex items-center gap-1">
          {DEMO_EMAIL}
          <CopyButton value={DEMO_EMAIL} label="Copy email" />
        </span>
        <span className="text-slate-300 dark:text-zinc-600">/</span>
        <span className="inline-flex items-center gap-1">
          {DEMO_PASSWORD}
          <CopyButton value={DEMO_PASSWORD} label="Copy password" />
        </span>
      </div>
    </div>
  );
}
