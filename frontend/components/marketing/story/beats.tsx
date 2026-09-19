import type { ReactNode } from "react";
import ReviewDemo from "../ReviewDemo";

export interface Beat {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
  /** Shown only in the stacked (no-3D) layout, where the scene can't carry the visual. */
  visual?: ReactNode;
}

const mono =
  "rounded-xl border border-slate-200 bg-white px-5 py-4 font-mono text-[13px] leading-loose text-slate-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400";

export const BEATS: Beat[] = [
  {
    id: "hero",
    eyebrow: "Traceline",
    title: "Know exactly who touched your data, and why.",
    body: "Traceline turns raw Postgres access logs into SOC 2 and ISO 27001 review cycles nobody has to build by hand.",
    cta: { label: "Sign in", href: "/login" },
  },
  {
    id: "problem",
    eyebrow: "The problem",
    title: "Nobody reviews access until the audit is due.",
    body: "SOC 2 and ISO 27001 both require it every quarter. Most teams answer with a spreadsheet somebody builds the night before the auditor calls, from raw logs, a stale org chart, and a Slack thread asking who touched the customers table.",
  },
  {
    id: "tag",
    eyebrow: "Connect + tag",
    title: "Connect read-only. Tag what matters, once.",
    body: "Traceline tails your Postgres query log. No credentials granted, nothing installed inside your data plane. Mark the tables that matter and every read against them is logged from that point on.",
    visual: (
      <div className="flex flex-wrap gap-2">
        {[
          ["customers", "pii", "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"],
          ["transactions", "financial", "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"],
          ["products", "public", "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300"],
        ].map(([t, tag, cls]) => (
          <span key={t} className={`rounded-full px-4 py-2 font-mono text-[12.5px] ${cls}`}>
            {t} · {tag}
          </span>
        ))}
      </div>
    ),
  },
  {
    id: "violation",
    eyebrow: "Catch it",
    title: "An access from the wrong region lights up. Immediately.",
    body: "Set a rule once: PII stays in the UAE. When a client outside the approved region reads customers, it's flagged the moment it happens, not months later during an audit.",
    visual: (
      <p className={mono}>
        <span className="text-red-600 dark:text-red-400">violation</span> unknown_client → customers
        <br />
        <span className="text-slate-400 dark:text-zinc-600">rule</span> pii must stay in uae · region: unknown
      </p>
    ),
  },
  {
    id: "prove",
    eyebrow: "Prove it",
    title: "One click. A hash-stamped audit report.",
    body: "Each review cycle snapshots who touched what. A reviewer approves or revokes per person, per table, and every decision is hashed and timestamped the moment it's made. Evidence is ready before the auditor asks.",
    cta: { label: "See the live demo", href: "/login" },
    visual: (
      <div className="space-y-4">
        <ReviewDemo />
        <p className={mono}>
          <span className="text-slate-400 dark:text-zinc-600">sha256</span> 9f2a71e4d803...c114
          <br />
          <span className="text-emerald-700 dark:text-emerald-400">verified, unchanged since export</span>
        </p>
      </div>
    ),
  },
];
