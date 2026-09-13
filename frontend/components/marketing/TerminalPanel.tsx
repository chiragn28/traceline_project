"use client";

import { motion, useReducedMotion } from "motion/react";
import TiltCard from "./TiltCard";

const lines = [
  { t: "2026-09-09 04:12:01 UTC", rest: "svc-reporting  SELECT  billing.invoices" },
  { t: "2026-09-09 04:12:03 UTC", rest: "priya.raghunathan  SELECT  customers.ssn" },
  { t: "2026-09-09 04:12:03 UTC", rest: "customers.ssn -> flagged sensitive", flag: true },
  { t: "2026-09-09 04:12:04 UTC", rest: "svc-payouts  SELECT  payouts.accounts" },
  { t: "2026-09-09 04:12:07 UTC", rest: "diego.velasquez  SELECT  billing.invoices" },
];

/**
 * The one deliberate full-theme-flip moment on the page (skill Section
 * 4.11 permits exactly one, as a device, not a random alternation). It
 * earns the flip: this is the literal thing Traceline watches, so making
 * it visually feel like "the terminal, for real" rather than a light card
 * floating on a white page is the point, not decoration for its own sake.
 */
export default function TerminalPanel() {
  const reduce = useReducedMotion();
  return (
    <section className="relative overflow-hidden border-t border-slate-200 bg-ink py-20 dark:border-zinc-800 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_40%_at_50%_0%,rgba(16,185,129,0.16),transparent)]"
      />
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="mb-3 text-[clamp(1.6rem,2.8vw,2.3rem)] font-semibold tracking-tight text-white">
          What Traceline sees
        </h2>
        <p className="mb-10 max-w-[52ch] text-[14.5px] leading-relaxed text-slate-400">
          A live tail of the same query log your database already writes.
          Nothing new to install, nothing new to trust.
        </p>

        <TiltCard maxTilt={5} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="ml-3 font-mono text-[11.5px] text-slate-500">
              pg_log/postgresql.csv
            </span>
          </div>
          <div className="space-y-2.5 px-5 py-6 font-mono text-[12.5px] leading-relaxed">
            {lines.map((line, i) => (
              <motion.div
                key={i}
                initial={reduce ? false : { opacity: 0, x: -6 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.35 }}
                className={line.flag ? "text-emerald-400" : "text-slate-400"}
              >
                <span className="text-slate-600">{line.t}</span>{" "}
                <span className={line.flag ? "" : "text-slate-300"}>
                  {line.rest}
                </span>
              </motion.div>
            ))}
            {!reduce && (
              <motion.span
                aria-hidden
                className="inline-block h-3.5 w-[7px] translate-y-[2px] bg-emerald-400"
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 0.51, 1] }}
              />
            )}
          </div>
        </TiltCard>
      </div>
    </section>
  );
}
