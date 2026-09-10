"use client";

import { useState } from "react";
import { CheckCircle, XCircle, LockSimple } from "@phosphor-icons/react";

type Decision = "approved" | "revoked" | null;

export default function ReviewDemo() {
  const [decision, setDecision] = useState<Decision>(null);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex min-h-[24px] items-center justify-between">
        <span className="font-mono text-sm font-semibold text-ink dark:text-zinc-50">
          billing.invoices
        </span>
        {decision && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              decision === "approved"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
            }`}
          >
            <LockSimple size={11} weight="bold" />
            {decision === "approved" ? "Approved" : "Revoked"}
          </span>
        )}
      </div>

      <dl className="divide-y divide-slate-100 text-[13.5px] dark:divide-zinc-800">
        <div className="flex items-baseline justify-between py-2">
          <dt className="text-slate-400 dark:text-zinc-500">Actor</dt>
          <dd className="font-mono text-slate-700 dark:text-zinc-300">svc-reporting-pipeline</dd>
        </div>
        <div className="flex items-baseline justify-between py-2">
          <dt className="text-slate-400 dark:text-zinc-500">Owner</dt>
          <dd className="text-slate-700 dark:text-zinc-300">Priya Raghunathan</dd>
        </div>
        <div className="flex items-baseline justify-between py-2">
          <dt className="text-slate-400 dark:text-zinc-500">Last access</dt>
          <dd className="font-mono text-slate-700 dark:text-zinc-300">14 reads / 90d</dd>
        </div>
      </dl>

      {!decision ? (
        <div className="mt-4 flex gap-2.5">
          <button
            onClick={() => setDecision("approved")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-emerald-600 hover:text-emerald-700 active:scale-[0.97] dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
          >
            <CheckCircle size={16} weight="bold" />
            Approve
          </button>
          <button
            onClick={() => setDecision("revoked")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-amber-600 hover:text-amber-700 active:scale-[0.97] dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-amber-500 dark:hover:text-amber-400"
          >
            <XCircle size={16} weight="bold" />
            Revoke
          </button>
        </div>
      ) : (
        <p className="mt-4 text-[12.5px] leading-relaxed text-slate-400 dark:text-zinc-500">
          Decision recorded for this cycle. It can&apos;t be changed here, a
          new decision needs the next review cycle.
        </p>
      )}
    </div>
  );
}
