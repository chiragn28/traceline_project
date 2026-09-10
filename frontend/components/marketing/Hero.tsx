"use client";

import { motion, useReducedMotion } from "motion/react";
import AccessGraph from "./AccessGraph";
import MagneticButton from "./MagneticButton";

export default function Hero() {
  const reduce = useReducedMotion();
  return (
    <section className="relative overflow-hidden pt-20 pb-24 md:pt-24 md:pb-32">
      {/* Bold but honest background treatment: a faint grid to ground the
          diagram motif that recurs in the product, plus a single soft
          emerald glow, never AI-purple, never full-bleed saturated. Fixed
          layer, no scroll-tied repaint (skill Section 6.E). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-180px] -z-10 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-emerald-200/40 blur-[110px] dark:bg-emerald-500/10"
      />

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-10">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="text-[clamp(2.3rem,4.6vw,3.9rem)] font-semibold leading-[1.05] tracking-tight text-ink dark:text-zinc-50">
            Know exactly who touched your data, and why.
          </h1>
          <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-slate-600 dark:text-zinc-400">
            Traceline turns raw Postgres access logs into SOC 2 and ISO 27001
            review cycles nobody has to build by hand.
          </p>
          <div className="mt-9">
            <MagneticButton href="/login">Sign in</MagneticButton>
          </div>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94, rotate: -1.2 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.75, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_30px_60px_-25px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_30px_60px_-25px_rgba(0,0,0,0.6)]"
        >
          <AccessGraph />
        </motion.div>
      </div>
    </section>
  );
}
