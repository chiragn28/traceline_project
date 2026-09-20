import type { ReactNode } from "react";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200/80 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700/70",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/25",
  warning: "bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/25",
  danger: "bg-red-50 text-red-700 ring-red-200/80 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/25",
  info: "bg-sky-50 text-sky-700 ring-sky-200/80 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/25",
  accent: "bg-indigo-50 text-indigo-700 ring-indigo-200/80 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/25",
};

export function Pill({
  tone = "neutral",
  dot = false,
  mono = false,
  title,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  mono?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-5 ring-1 ring-inset ${
        mono ? "font-mono" : ""
      } ${TONES[tone]}`}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// Same colours the lineage graph and the landing-page scene use for tags,
// so a table reads as "pii-red" everywhere in the product.
export function toneForTag(tag: string): Tone {
  if (tag === "pii") return "danger";
  if (tag === "financial") return "warning";
  if (tag === "public") return "neutral";
  return "accent";
}

export function TagPill({ tag }: { tag: string }) {
  return (
    <Pill tone={toneForTag(tag)} mono>
      {tag}
    </Pill>
  );
}

export function QueryTypePill({ type }: { type: string }) {
  const tone: Tone = type === "read" ? "info" : type === "write" ? "warning" : type === "ddl" ? "danger" : "neutral";
  return (
    <Pill tone={tone} mono>
      {type}
    </Pill>
  );
}

export function ConfidencePill({ confidence, source }: { confidence: string; source?: string | null }) {
  const tone: Tone = confidence === "high" ? "success" : confidence === "low" ? "warning" : "neutral";
  return (
    <Pill tone={tone} title={source ?? undefined}>
      {confidence} confidence
    </Pill>
  );
}

export function DecisionPill({ decision }: { decision: string }) {
  if (decision === "approved") return <Pill tone="success">approved</Pill>;
  if (decision === "revoked") return <Pill tone="danger">revoked</Pill>;
  return (
    <Pill tone="neutral" dot>
      pending
    </Pill>
  );
}

export function ActorTypePill({ type }: { type: string }) {
  const tone: Tone = type === "human" ? "info" : type === "unknown" ? "warning" : "neutral";
  return <Pill tone={tone}>{type.replace(/_/g, " ")}</Pill>;
}

export function VerificationPill({ verified }: { verified: boolean | null }) {
  if (verified === true) return <Pill tone="success" dot>read-only verified</Pill>;
  if (verified === false) return <Pill tone="danger" dot>not read-only</Pill>;
  return <Pill tone="neutral" dot>unverified</Pill>;
}
