"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { ArrowRight } from "@phosphor-icons/react";

/**
 * Pulls toward the cursor within a small radius, then springs back. Signals
 * "this button matters" the moment a visitor's mouse gets close, which is
 * the point of it being here twice: on the two moments this page actually
 * asks for a decision (Hero, FinalCTA). Never on the nav's ghost link,
 * that one is secondary and should feel calmer.
 *
 * Continuous pointer position drives motion values, never React state
 * (see the skill's Section 3.B) so this never re-renders on mousemove.
 */
export default function MagneticButton({ href, children }: { href: string; children: React.ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduce = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 200, damping: 18 });
  const springY = useSpring(y, { stiffness: 200, damping: 18 });

  function handleMouseMove(e: React.MouseEvent<HTMLAnchorElement>) {
    if (reduce || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * 0.35);
    y.set((e.clientY - rect.top - rect.height / 2) * 0.35);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div style={reduce ? undefined : { x: springX, y: springY }} className="inline-block">
      <Link
        ref={ref}
        href={href}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="group inline-flex items-center gap-2 rounded-full bg-emerald-700 px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_12px_28px_-8px_rgba(4,120,87,0.55)] transition-colors hover:bg-emerald-600 active:scale-[0.98] dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_12px_28px_-8px_rgba(5,150,105,0.45)]"
      >
        {children}
        <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </motion.div>
  );
}
