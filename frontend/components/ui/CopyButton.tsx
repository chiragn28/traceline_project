"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable (insecure context); nothing sensible to do
        }
      }}
      aria-label={label}
      title={copied ? "Copied" : label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      {copied ? <Check size={14} weight="bold" className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} />}
    </button>
  );
}
