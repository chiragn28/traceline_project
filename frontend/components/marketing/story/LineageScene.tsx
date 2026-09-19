"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { MotionValue } from "motion/react";
import { EDGES, NODES, NODE_INDEX, type GraphNode } from "./graph";

export type Theme = "light" | "dark";

interface Props {
  /** 0 at the top of the story section, 1 at the bottom */
  progress: MotionValue<number>;
  theme: Theme;
  /** false while the section is scrolled out of view: the render loop pauses */
  active: boolean;
}

// Same slate/emerald/red/amber the rest of the site and the product use, so
// the scene reads as the same brand in both themes rather than a foreign
// WebGL object dropped onto the page.
const PALETTE = {
  light: {
    table: "#0f172a", pipeline: "#334155", human: "#475569", service: "#64748b", unknown: "#94a3b8",
    edge: "#94a3b8", gray: "#a8b0bc", bg: "#eaeef4", accent: "#059669", violation: "#dc2626",
    region: "#10b981", sheet: "#ffffff", rows: "#cbd5e1",
    pii: "#dc2626", financial: "#d97706", public: "#64748b",
  },
  dark: {
    table: "#e4e4e7", pipeline: "#a1a1aa", human: "#a1a1aa", service: "#71717a", unknown: "#52525b",
    edge: "#52525b", gray: "#3f3f46", bg: "#09090b", accent: "#34d399", violation: "#f87171",
    region: "#34d399", sheet: "#18181b", rows: "#3f3f46",
    pii: "#f87171", financial: "#fbbf24", public: "#a1a1aa",
  },
} as const;

type Palette = Record<keyof (typeof PALETTE)["light"], THREE.Color>;

function buildPalette(theme: Theme): Palette {
  const src = PALETTE[theme];
  return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, new THREE.Color(v)])) as Palette;
}

const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Five beats, 0.2 of scroll progress each. Every visual property below is a
// blend of these four ramps, so the scene reads as one continuous object
// changing state rather than five scenes cut together.
function stages(p: number) {
  return {
    chaos: smooth(0.13, 0.21, p) * (1 - smooth(0.37, 0.45, p)),
    tagged: smooth(0.41, 0.5, p),
    violation: smooth(0.61, 0.7, p) * (1 - smooth(0.82, 0.88, p)),
    report: smooth(0.8, 0.9, p),
  };
}

// The graph sits to the right of its own origin so the pipeline column
// (x = -3.4) clears the text column on the left of the viewport.
const GRAPH_X = 1.1;

const CAM: { pos: [number, number, number]; look: [number, number, number] }[] = [
  { pos: [0, 0.8, 11], look: [0, 0, 0] },
  { pos: [1.6, 1.2, 10.5], look: [0.4, 0, 0] },
  { pos: [0.2, 1.0, 9.5], look: [0.2, 0.2, 0] },
  { pos: [2.4, 1.4, 11.5], look: [2.3, 0, 0.3] },
  { pos: [0, 8.2, 5.6], look: [0, -0.7, 0.2] },
];

function camAt(p: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
  const seg = THREE.MathUtils.clamp(p * 5 - 0.5, 0, 4);
  const i = Math.min(3, Math.floor(seg));
  const t = smooth(0, 1, seg - i);
  const a = CAM[i];
  const b = CAM[i + 1];
  outPos.set(
    THREE.MathUtils.lerp(a.pos[0], b.pos[0], t) + GRAPH_X,
    THREE.MathUtils.lerp(a.pos[1], b.pos[1], t),
    THREE.MathUtils.lerp(a.pos[2], b.pos[2], t),
  );
  outLook.set(
    THREE.MathUtils.lerp(a.look[0], b.look[0], t) + GRAPH_X,
    THREE.MathUtils.lerp(a.look[1], b.look[1], t),
    THREE.MathUtils.lerp(a.look[2], b.look[2], t),
  );
}

interface DragState {
  rotY: number;
  vel: number;
  dragging: boolean;
  lastX: number;
}

const PARTICLE_COUNT = 30;
const GRAY_LABEL = "?";

function kindColor(n: GraphNode, pal: Palette) {
  if (n.kind === "table") return pal.table;
  if (n.kind === "pipeline") return pal.pipeline;
  if (n.actorType === "human") return pal.human;
  if (n.actorType === "unknown") return pal.unknown;
  return pal.service;
}

function NodeShape({ node }: { node: GraphNode }) {
  if (node.kind === "table") return <boxGeometry args={[0.72, 0.48, 0.48]} />;
  if (node.kind === "pipeline") return <octahedronGeometry args={[0.44, 0]} />;
  if (node.actorType === "human") return <sphereGeometry args={[0.34, 24, 24]} />;
  if (node.actorType === "unknown") return <sphereGeometry args={[0.34, 12, 12]} />;
  return <icosahedronGeometry args={[0.37, 0]} />;
}

function Graph({ progress, theme, drag }: { progress: MotionValue<number>; theme: Theme; drag: React.MutableRefObject<DragState> }) {
  const pal = useMemo(() => buildPalette(theme), [theme]);
  const [hovered, setHovered] = useState<string | null>(null);
  const { camera } = useThree();

  const group = useRef<THREE.Group>(null);
  const nodeRefs = useRef<(THREE.Group | null)[]>([]);
  const nodeMats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const ringMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const labelReal = useRef<(HTMLSpanElement | null)[]>([]);
  const labelQ = useRef<(HTMLSpanElement | null)[]>([]);
  const particles = useRef<THREE.InstancedMesh>(null);
  const particleMat = useRef<THREE.MeshBasicMaterial>(null);
  const regionFill = useRef<THREE.MeshBasicMaterial>(null);
  const regionWire = useRef<THREE.MeshBasicMaterial>(null);
  const regionLabel = useRef<HTMLDivElement>(null);
  const sheetMat = useRef<THREE.MeshBasicMaterial>(null);
  const rowsMat = useRef<THREE.LineBasicMaterial>(null);
  const stampEl = useRef<HTMLDivElement>(null);

  const cur = useMemo(() => NODES.map(() => new THREE.Vector3()), []);
  // Deterministic per-node jitter directions for the "chaos" beat.
  const jitter = useMemo(
    () =>
      NODES.map((_, i) => {
        const s = Math.sin(i * 12.9898) * 43758.5453;
        const f = (k: number) => ((s * (k + 1)) % 1) * 2 - 1;
        return new THREE.Vector3(f(1), f(2), f(3)).normalize();
      }),
    [],
  );

  const edgeGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(EDGES.length * 6), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(EDGES.length * 6), 3));
    return g;
  }, []);

  const rowsGeom = useMemo(() => {
    const pts: number[] = [];
    for (let r = 0; r < 4; r++) {
      const z = -1.95 + r * 1.3;
      pts.push(-4.4, -0.79, z, 4.4, -0.79, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, []);

  const particleSeeds = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        edge: i % EDGES.length,
        phase: ((i * 0.618) % 1),
        speed: 0.12 + ((i * 7) % 5) * 0.03,
      })),
    [],
  );

  const scratch = useMemo(
    () => ({
      base: new THREE.Vector3(),
      grid: new THREE.Vector3(),
      camPos: new THREE.Vector3(),
      camLook: new THREE.Vector3(),
      look: new THREE.Vector3(0, 0, 0),
      dummy: new THREE.Object3D(),
      c: new THREE.Color(),
      c2: new THREE.Color(),
    }),
    [],
  );

  useEffect(() => {
    camera.position.set(CAM[0].pos[0] + GRAPH_X, CAM[0].pos[1], CAM[0].pos[2]);
    scratch.look.set(CAM[0].look[0] + GRAPH_X, CAM[0].look[1], CAM[0].look[2]);
    camera.lookAt(scratch.look);
  }, [camera, scratch]);

  useFrame((state, dt) => {
    const p = progress.get();
    const s = stages(p);
    const t = state.clock.elapsedTime;
    const d = drag.current;

    // --- rotation: a slow sway (not a full spin, which would swing the
    // pipeline column round to the actors' side and break the left-to-right
    // reading) plus drag inertia; both settle out for the report grid
    if (!d.dragging) {
      d.vel *= 0.92;
      d.rotY += d.vel;
    }
    d.rotY *= 1 - 0.08 * s.report;
    if (group.current) {
      group.current.rotation.y = Math.sin(t * 0.22) * 0.16 * (1 - s.report) + d.rotY;
    }

    // --- node positions and materials
    const unknownVisible = Math.max(s.chaos, s.violation, s.report);
    NODES.forEach((n, i) => {
      scratch.base.set(n.pos[0], n.pos[1], n.pos[2]);
      scratch.grid.set(n.grid[0], n.grid[1], n.grid[2]);
      const wobble = Math.sin(t * 1.7 + i * 1.3) * 0.35 * s.chaos;
      cur[i].copy(scratch.base).addScaledVector(jitter[i], wobble).lerp(scratch.grid, s.report);

      const g = nodeRefs.current[i];
      if (g) {
        g.position.copy(cur[i]);
        let sc = 1;
        if (n.outsideRegion) {
          sc = unknownVisible * (1 + 0.14 * Math.sin(t * 6) * s.violation);
        }
        g.scale.setScalar(Math.max(0.0001, sc * (1 - 0.3 * s.report)));
      }

      const m = nodeMats.current[i];
      if (m) {
        m.color.copy(kindColor(n, pal)).lerp(pal.gray, s.chaos * 0.7);
        if (n.outsideRegion) {
          // stays faintly red on the report sheet, so the flagged row is
          // recognisably the same node that lit up a beat earlier
          m.emissive.copy(pal.violation).multiplyScalar(0.7 * s.violation + 0.35 * s.report);
        }
      }

      const ring = ringMats.current[i];
      if (ring) ring.opacity = s.tagged * (1 - 0.25 * s.report);

      const real = labelReal.current[i];
      const q = labelQ.current[i];
      if (real && q) {
        const hide = n.kind === "table" ? 0 : s.chaos;
        real.style.opacity = String((1 - hide) * (n.outsideRegion ? unknownVisible : 1));
        q.style.opacity = String(hide * (n.outsideRegion ? unknownVisible : 1));
      }
    });

    // --- edges: one LineSegments, per-vertex colour blended toward the page
    // background to fake alpha (LineBasicMaterial can't do per-vertex alpha)
    const pos = edgeGeom.attributes.position.array as Float32Array;
    const col = edgeGeom.attributes.color.array as Float32Array;
    EDGES.forEach((e, k) => {
      const a = cur[NODE_INDEX[e.from]];
      const b = cur[NODE_INDEX[e.to]];
      const wob = Math.sin(t * 2.3 + k) * 0.25 * s.chaos;
      pos[k * 6] = a.x;
      pos[k * 6 + 1] = a.y;
      pos[k * 6 + 2] = a.z;
      pos[k * 6 + 3] = b.x + wob;
      pos[k * 6 + 4] = b.y - wob * 0.6;
      pos[k * 6 + 5] = b.z;

      let alpha = (e.kind === "declared" ? 1 : 0.55) * (1 - s.report);
      scratch.c.copy(pal.edge).lerp(pal.gray, s.chaos * 0.6);
      if (e.violation) {
        alpha = unknownVisible * Math.max(alpha, s.violation * (0.75 + 0.25 * Math.sin(t * 6)));
        scratch.c.lerp(pal.violation, s.violation);
      }
      scratch.c2.copy(pal.bg).lerp(scratch.c, alpha);
      for (let v = 0; v < 2; v++) {
        col[k * 6 + v * 3] = scratch.c2.r;
        col[k * 6 + v * 3 + 1] = scratch.c2.g;
        col[k * 6 + v * 3 + 2] = scratch.c2.b;
      }
    });
    edgeGeom.attributes.position.needsUpdate = true;
    edgeGeom.attributes.color.needsUpdate = true;

    // --- particles: access events travelling the edges
    const inst = particles.current;
    if (inst) {
      particleSeeds.forEach((seed, i) => {
        const e = EDGES[seed.edge];
        const a = cur[NODE_INDEX[e.from]];
        const b = cur[NODE_INDEX[e.to]];
        const tt = (t * seed.speed + seed.phase) % 1;
        scratch.dummy.position.copy(a).lerp(b, tt);
        const vis = e.violation ? unknownVisible : 1;
        scratch.dummy.scale.setScalar(Math.max(0.0001, 0.07 * (1 - s.report) * vis));
        scratch.dummy.updateMatrix();
        inst.setMatrixAt(i, scratch.dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      if (particleMat.current) particleMat.current.color.copy(pal.accent).lerp(pal.gray, s.chaos * 0.8);
    }

    // --- region shell, report sheet, overlays
    if (regionFill.current) regionFill.current.opacity = 0.09 * s.violation;
    if (regionWire.current) regionWire.current.opacity = 0.3 * s.violation;
    if (regionLabel.current) regionLabel.current.style.opacity = String(s.violation);
    if (sheetMat.current) sheetMat.current.opacity = 0.7 * s.report;
    if (rowsMat.current) rowsMat.current.opacity = 0.9 * s.report;
    if (stampEl.current) stampEl.current.style.opacity = String(s.report);

    // --- camera glides between the per-beat keyframes
    camAt(p, scratch.camPos, scratch.camLook);
    const k = 3.5;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, scratch.camPos.x, k, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, scratch.camPos.y, k, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, scratch.camPos.z, k, dt);
    scratch.look.x = THREE.MathUtils.damp(scratch.look.x, scratch.camLook.x, k, dt);
    scratch.look.y = THREE.MathUtils.damp(scratch.look.y, scratch.camLook.y, k, dt);
    scratch.look.z = THREE.MathUtils.damp(scratch.look.z, scratch.camLook.z, k, dt);
    camera.lookAt(scratch.look);
  });

  const isDark = theme === "dark";
  const labelClass = "font-mono text-[10px] tracking-wide whitespace-nowrap " + (isDark ? "text-zinc-400" : "text-slate-500");
  const tipClass =
    "pointer-events-none rounded-md border px-2.5 py-1.5 font-mono text-[11px] leading-snug whitespace-nowrap shadow-lg " +
    (isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-slate-200 bg-white text-slate-800");

  return (
    <>
      <ambientLight intensity={isDark ? 0.55 : 0.95} />
      <directionalLight position={[4, 6, 5]} intensity={isDark ? 1.3 : 1.05} />
      <directionalLight position={[-5, -2, -4]} intensity={0.35} />

      <group ref={group} position-x={GRAPH_X}>
        <lineSegments geometry={edgeGeom}>
          <lineBasicMaterial vertexColors />
        </lineSegments>

        <instancedMesh ref={particles} args={[undefined, undefined, PARTICLE_COUNT]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial ref={particleMat} color={PALETTE[theme].accent} toneMapped={false} />
        </instancedMesh>

        {NODES.map((n, i) => (
          <group key={n.id} ref={(el) => { nodeRefs.current[i] = el; }}>
            <mesh
              onPointerOver={(e) => { e.stopPropagation(); setHovered(n.id); }}
              onPointerOut={() => setHovered((h) => (h === n.id ? null : h))}
            >
              <NodeShape node={n} />
              <meshStandardMaterial
                ref={(el) => { nodeMats.current[i] = el; }}
                color={PALETTE[theme][n.kind === "table" ? "table" : n.kind === "pipeline" ? "pipeline" : n.actorType === "human" ? "human" : n.actorType === "unknown" ? "unknown" : "service"]}
                roughness={0.45}
                metalness={0.1}
              />
            </mesh>

            {n.tag && (
              <mesh rotation-x={Math.PI / 2}>
                <torusGeometry args={[0.64, 0.04, 8, 48]} />
                <meshBasicMaterial
                  ref={(el) => { ringMats.current[i] = el; }}
                  color={PALETTE[theme][n.tag]}
                  transparent
                  opacity={0}
                  toneMapped={false}
                />
              </mesh>
            )}

            <Html position={[0, -0.7, 0]} center distanceFactor={10.5} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
              <div className="relative">
                <span ref={(el) => { labelReal.current[i] = el; }} className={labelClass}>{n.label}</span>
                <span
                  ref={(el) => { labelQ.current[i] = el; }}
                  className={labelClass + " absolute left-1/2 top-0 -translate-x-1/2"}
                  style={{ opacity: 0 }}
                >
                  {GRAY_LABEL}
                </span>
              </div>
            </Html>

            {hovered === n.id && (
              <Html position={[0, 0.62, 0]} center distanceFactor={9.5} zIndexRange={[20, 10]}>
                <div className={tipClass}>
                  <div className="font-semibold">{n.label}</div>
                  <div className={isDark ? "text-zinc-400" : "text-slate-500"}>{n.detail}</div>
                </div>
              </Html>
            )}
          </group>
        ))}

        {/* approved-region shell: an ellipsoid around everything except the violator */}
        <group scale={[1.55, 0.72, 0.72]}>
          <mesh>
            <sphereGeometry args={[3, 32, 24]} />
            <meshBasicMaterial ref={regionFill} color={PALETTE[theme].region} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh>
            <sphereGeometry args={[3, 24, 16]} />
            <meshBasicMaterial ref={regionWire} color={PALETTE[theme].region} transparent opacity={0} wireframe depthWrite={false} />
          </mesh>
        </group>
        <Html position={[0, 2.5, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
          <div ref={regionLabel} style={{ opacity: 0 }} className={"font-mono text-[10px] uppercase tracking-[0.18em] whitespace-nowrap " + (isDark ? "text-emerald-400" : "text-emerald-700")}>
            approved region · uae
          </div>
        </Html>

        {/* the report sheet the graph collapses onto */}
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.8, 0]}>
          <planeGeometry args={[9.2, 4.6]} />
          <meshBasicMaterial ref={sheetMat} color={PALETTE[theme].sheet} transparent opacity={0} depthWrite={false} />
        </mesh>
        <lineSegments geometry={rowsGeom}>
          <lineBasicMaterial ref={rowsMat} color={PALETTE[theme].rows} transparent opacity={0} />
        </lineSegments>
        <Html position={[0, -0.8, 2.85]} center distanceFactor={9} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
          <div ref={stampEl} style={{ opacity: 0 }} className={"font-mono text-[10px] whitespace-nowrap " + (isDark ? "text-zinc-400" : "text-slate-500")}>
            sha256 9f2a71e4d803…c114 · <span className={isDark ? "text-emerald-400" : "text-emerald-700"}>verified, unchanged since export</span>
          </div>
        </Html>
      </group>
    </>
  );
}

export default function LineageScene({ progress, theme, active }: Props) {
  const drag = useRef<DragState>({ rotY: 0, vel: 0, dragging: false, lastX: 0 });

  return (
    <div
      className="absolute inset-0 cursor-grab select-none active:cursor-grabbing"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        drag.current.dragging = true;
        drag.current.lastX = e.clientX;
        drag.current.vel = 0;
        (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d.dragging) return;
        const dx = e.clientX - d.lastX;
        d.lastX = e.clientX;
        d.vel = dx * 0.005;
        d.rotY += d.vel;
      }}
      onPointerUp={() => { drag.current.dragging = false; }}
      onPointerCancel={() => { drag.current.dragging = false; }}
      onPointerLeave={() => { drag.current.dragging = false; }}
    >
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [CAM[0].pos[0] + GRAPH_X, CAM[0].pos[1], CAM[0].pos[2]], fov: 42, near: 0.1, far: 60 }}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        frameloop={active ? "always" : "never"}
        style={{ background: "transparent" }}
      >
        <Graph progress={progress} theme={theme} drag={drag} />
      </Canvas>
    </div>
  );
}
