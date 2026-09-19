"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { ArrowDown } from "@phosphor-icons/react";
import { BEATS, type Beat } from "./beats";
import type { Theme } from "./LineageScene";
import AccessGraph from "../AccessGraph";
import MagneticButton from "../MagneticButton";
import ScrollReveal from "../ScrollReveal";

// WebGL only exists in the browser; the scene must never be part of the
// server render.
const LineageScene = dynamic(() => import("./LineageScene"), { ssr: false });

function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setTheme(el.classList.contains("dark") ? "dark" : "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

function canRender3D() {
  if (window.innerWidth < 768) return false;
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const eyebrowClass = "font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400";
const titleClass = "mt-4 text-[clamp(1.9rem,3.6vw,3.1rem)] font-semibold leading-[1.06] tracking-tight text-ink dark:text-zinc-50";
const bodyClass = "mt-5 max-w-[48ch] text-[15.5px] leading-relaxed text-slate-600 dark:text-zinc-400";

export default function StoryScroll() {
  const reduce = useReducedMotion();
  // The stacked layout is the server-rendered default: it works everywhere
  // and needs no WebGL. Capable desktop browsers upgrade to the pinned 3D
  // story after mount.
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    const decide = () => setImmersive(!reduce && canRender3D());
    decide();
    window.addEventListener("resize", decide);
    return () => window.removeEventListener("resize", decide);
  }, [reduce]);

  return immersive ? <Immersive /> : <Stacked />;
}

/* ------------------------------------------------------------------ */
/* Pinned 3D story                                                     */
/* ------------------------------------------------------------------ */

function Immersive() {
  const ref = useRef<HTMLElement>(null);
  const theme = useTheme();
  const [active, setActive] = useState(true);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Every scroll-linked transform here spans the full 0..1 range with held
  // endpoints. Motion runs these as native scroll-timeline animations where
  // it can, and a range that stops short of 1 gets an implicit final
  // keyframe back to the *initial* value, so values drift as you scroll.
  const hintOpacity = useTransform(scrollYProgress, [0, 0.08, 1], [1, 0, 0]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative" aria-label="How Traceline works">
      {/* pinned layer: scene + a legibility wash behind the text column.
          Sized to the viewport minus the 4rem sticky nav above it, so its
          bottom edge (where the hints live) is on screen before it pins. */}
      <div className="sticky top-16 h-[calc(100vh-4rem)] w-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 right-0 md:left-[40%]">
          <LineageScene progress={scrollYProgress} theme={theme} active={active} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[55%] bg-gradient-to-r from-paper via-paper/85 to-transparent dark:from-zinc-950 dark:via-zinc-950/85"
        />
        <motion.div
          style={{ opacity: hintOpacity }}
          className="pointer-events-none absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500"
        >
          <ArrowDown size={14} /> scroll
        </motion.div>
        <p className="pointer-events-none absolute bottom-8 right-8 font-mono text-[11px] text-slate-400 dark:text-zinc-500">
          drag to rotate · hover a node
        </p>
      </div>

      {/* beats scroll past the pinned layer; pulled up so the first one starts at the top */}
      <div className="pointer-events-none relative -mt-[calc(100vh-4rem)]">
        {BEATS.map((beat, i) => (
          <BeatCopy key={beat.id} beat={beat} index={i} total={BEATS.length} progress={scrollYProgress} />
        ))}
      </div>
    </section>
  );
}

function BeatCopy({ beat, index, total, progress }: { beat: Beat; index: number; total: number; progress: MotionValue<number> }) {
  const start = index / total;
  const end = (index + 1) / total;
  const fade = 0.05;
  const first = index === 0;
  const last = index === total - 1;

  // Held at both ends of the 0..1 range; see the note in Immersive.
  const range = first
    ? [0, end - fade, end, 1]
    : last
      ? [0, start, start + fade, 1]
      : [0, start, start + fade, end - fade, end, 1];
  const opacity = useTransform(progress, range, first ? [1, 1, 0, 0] : last ? [0, 0, 1, 1] : [0, 0, 1, 1, 0, 0]);
  const y = useTransform(progress, range, first ? [0, 0, -18, -18] : last ? [18, 18, 0, 0] : [18, 18, 0, 0, -18, -18]);

  return (
    <div className="flex h-screen items-center">
      <div className="mx-auto w-full max-w-6xl px-6">
        <motion.div style={{ opacity, y }} className="pointer-events-auto max-w-[40%] min-w-[20rem]">
          <p className={eyebrowClass}>
            {String(index).padStart(2, "0")} — {beat.eyebrow}
          </p>
          <h2 className={titleClass}>{beat.title}</h2>
          <p className={bodyClass}>{beat.body}</p>
          {beat.cta && (
            <div className="mt-8">
              <MagneticButton href={beat.cta.href}>{beat.cta.label}</MagneticButton>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked fallback: phones, reduced motion, no WebGL, and SSR         */
/* ------------------------------------------------------------------ */

function Stacked() {
  const [hero, ...rest] = BEATS;
  return (
    <>
      <section className="relative overflow-hidden pt-20 pb-24 md:pt-24 md:pb-32">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-180px] -z-10 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-emerald-200/40 blur-[110px] dark:bg-emerald-500/10"
        />
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-10">
          <div>
            <h1 className="text-[clamp(2.3rem,4.6vw,3.9rem)] font-semibold leading-[1.05] tracking-tight text-ink dark:text-zinc-50">
              {hero.title}
            </h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-slate-600 dark:text-zinc-400">{hero.body}</p>
            {hero.cta && (
              <div className="mt-9">
                <MagneticButton href={hero.cta.href}>{hero.cta.label}</MagneticButton>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_30px_60px_-25px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_30px_60px_-25px_rgba(0,0,0,0.6)]">
            <AccessGraph />
          </div>
        </div>
      </section>

      {rest.map((beat, i) => (
        <section key={beat.id} className="border-t border-slate-200 py-20 dark:border-zinc-800 md:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <p className={eyebrowClass}>
                {String(i + 1).padStart(2, "0")} — {beat.eyebrow}
              </p>
              <h2 className={titleClass + " max-w-[20ch]"}>{beat.title}</h2>
              <p className={bodyClass}>{beat.body}</p>
              {beat.visual && <div className="mt-8 max-w-xl">{beat.visual}</div>}
              {beat.cta && (
                <div className="mt-8">
                  <MagneticButton href={beat.cta.href}>{beat.cta.label}</MagneticButton>
                </div>
              )}
            </ScrollReveal>
          </div>
        </section>
      ))}
    </>
  );
}
