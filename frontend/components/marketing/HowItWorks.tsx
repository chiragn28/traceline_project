"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useReducedMotion } from "motion/react";
import { Waveform, Tag, ClipboardText, SealCheck } from "@phosphor-icons/react";
import ReviewDemo from "./ReviewDemo";

const steps = [
  {
    icon: Waveform,
    title: "Watch",
    body: "Traceline tails your Postgres query log. Read-only, no credentials granted, nothing installed inside your data plane.",
    visual: (
      <p className="rounded-xl border border-slate-200 bg-white px-5 py-4 font-mono text-[13px] leading-loose text-slate-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <span className="text-slate-400 dark:text-zinc-600">$</span> traceline connect --host
        db.internal --mode read-only
      </p>
    ),
  },
  {
    icon: Tag,
    title: "Tag",
    body: "Mark the tables that matter once. Every read against them starts getting logged automatically from that point on.",
    visual: (
      <div className="flex flex-wrap gap-2">
        {["customers.ssn", "billing.invoices", "payouts.accounts"].map((t) => (
          <span
            key={t}
            className="rounded-full bg-emerald-50 px-4 py-2 font-mono text-[12.5px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
          >
            {t}
          </span>
        ))}
      </div>
    ),
  },
  {
    icon: ClipboardText,
    title: "Review",
    body: "Each cycle, Traceline snapshots who touched what. A reviewer approves or revokes, per person, per table.",
    visual: <ReviewDemo />,
  },
  {
    icon: SealCheck,
    title: "Prove",
    body: "Decisions are hashed and timestamped the moment they're made. Evidence is ready before the auditor asks for it.",
    visual: (
      <p className="rounded-xl border border-slate-200 bg-white px-5 py-4 font-mono text-[13px] leading-loose text-slate-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <span className="text-slate-400 dark:text-zinc-600">sha256</span> 9f2a71e4d803...c114
        <br />
        <span className="text-emerald-700 dark:text-emerald-400">verified, unchanged since export</span>
      </p>
    ),
  },
];

export default function HowItWorks() {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.65", "end 0.5"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });

  return (
    <section className="border-t border-slate-200 py-20 dark:border-zinc-800 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="mb-14 text-[clamp(1.5rem,2.6vw,2.2rem)] font-semibold tracking-tight text-ink dark:text-zinc-50">
          How it runs
        </h2>

        <ol ref={ref} className="relative space-y-14">
          <div className="pointer-events-none absolute left-7 top-7 bottom-7 w-px -translate-x-1/2 bg-slate-200 dark:bg-zinc-800" />
          {!reduce && (
            <motion.div
              className="pointer-events-none absolute left-7 top-7 w-px origin-top -translate-x-1/2 bg-emerald-600"
              style={{ scaleY: progress, height: "calc(100% - 56px)" }}
            />
          )}

          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.li
                key={step.title}
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="relative grid grid-cols-[56px_1fr] gap-x-5 gap-y-4"
              >
                <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                  <Icon size={22} weight="regular" />
                </span>
                <div className="pt-3.5">
                  <p className="text-base font-semibold text-ink dark:text-zinc-50">{step.title}</p>
                  <p className="mt-1.5 max-w-[46ch] text-[14.5px] leading-relaxed text-slate-600 dark:text-zinc-400">
                    {step.body}
                  </p>
                </div>
                <div className="col-start-2">{step.visual}</div>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
