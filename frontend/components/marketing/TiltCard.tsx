"use client";

import { useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useMotionTemplate,
  useSpring,
  useTransform,
  useReducedMotion,
} from "motion/react";

/**
 * Mouse-tracked 3D tilt with a light sheen that follows the cursor -- used
 * sparingly on the handful of pieces that are meant to feel like a physical
 * panel in the room during a pitch (the hero's live graph, the terminal
 * log, the review-demo card), not on ordinary content cards. Restraint is
 * the point: if everything tilts, nothing feels special.
 *
 * Position is tracked as 0..1 motion values rather than React state, so
 * mousemove never triggers a re-render (same rule MagneticButton follows).
 */
export default function TiltCard({
  children,
  className = "",
  maxTilt = 8,
}: {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 220, damping: 22, mass: 0.4 };

  const rotateX = useSpring(useTransform(py, [0, 1], [maxTilt, -maxTilt]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-maxTilt, maxTilt]), spring);
  const glareX = useSpring(useTransform(px, [0, 1], [0, 100]), spring);
  const glareY = useSpring(useTransform(py, [0, 1], [0, 100]), spring);
  const glareBg = useMotionTemplate`radial-gradient(480px circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.18), transparent 60%)`;

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  }

  function handleLeave() {
    px.set(0.5);
    py.set(0.5);
    setHovered(false);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleLeave}
      style={reduce ? undefined : { rotateX, rotateY, transformPerspective: 1000 }}
      className={`relative ${className}`}
    >
      {children}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{ background: glareBg, opacity: hovered ? 1 : 0 }}
        />
      )}
    </motion.div>
  );
}
