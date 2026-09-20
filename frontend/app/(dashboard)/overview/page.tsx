"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ClipboardText,
  Database,
  FileCsv,
  PlugsConnected,
  ShieldCheck,
  ShieldWarning,
  Table as TableIcon,
  Warning,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { api, AccessEvent, AccessReviewCycle, CoverageGap, DataSource, Report, TableAsset, Violation } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/CurrentUserContext";
import { parseViolationReason } from "@/lib/violations";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { ActorTypePill, QueryTypePill, TagPill, Pill, type Tone } from "@/components/ui/Pill";
import { Time, formatRelative } from "@/components/ui/Time";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { CopyButton } from "@/components/ui/CopyButton";

interface Snapshot {
  sources: DataSource[];
  tables: TableAsset[];
  gaps: (CoverageGap & { source_name: string })[];
  events: (AccessEvent & { source_name: string })[];
  violations: Violation[];
  cycles: AccessReviewCycle[];
  reports: Report[];
}

// Everything here comes from endpoints the other pages already use; the
// overview is a composition, not a new backend surface.
async function loadSnapshot(): Promise<Snapshot> {
  const [sources, violations, cycles, reports] = await Promise.all([
    api.get<DataSource[]>("/data-sources"),
    api.get<Violation[]>("/violations"),
    api.get<AccessReviewCycle[]>("/access-reviews"),
    api.get<Report[]>("/reports"),
  ]);
  const perSource = await Promise.all(
    sources.map(async (s) => {
      const [tables, gaps, events] = await Promise.all([
        api.get<TableAsset[]>(`/tables?data_source_id=${s.id}`).catch(() => [] as TableAsset[]),
        api.get<CoverageGap[]>(`/coverage-gaps?data_source_id=${s.id}&open_only=true`).catch(() => [] as CoverageGap[]),
        api.get<AccessEvent[]>(`/access-events?data_source_id=${s.id}`).catch(() => [] as AccessEvent[]),
      ]);
      return {
        tables,
        gaps: gaps.map((g) => ({ ...g, source_name: s.name })),
        events: events.map((e) => ({ ...e, source_name: s.name })),
      };
    }),
  );
  return {
    sources,
    violations,
    cycles,
    reports,
    tables: perSource.flatMap((p) => p.tables),
    gaps: perSource.flatMap((p) => p.gaps),
    events: perSource
      .flatMap((p) => p.events)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, 8),
  };
}

interface AttentionItem {
  key: string;
  tone: Tone;
  icon: Icon;
  title: string;
  detail: string;
  href: string;
  when?: string;
}

function buildAttention(s: Snapshot): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const src of s.sources) {
    if (src.read_only_verified !== true) {
      items.push({
        key: `src-${src.id}`,
        tone: src.read_only_verified === false ? "danger" : "warning",
        icon: PlugsConnected,
        title: src.read_only_verified === false ? `${src.name} can write to the database` : `${src.name} isn't verified read-only yet`,
        detail: src.read_only_warning ?? "Run a connection check to confirm the credential can't write.",
        href: "/data-sources",
        when: src.read_only_checked_at ?? undefined,
      });
    }
  }
  for (const g of s.gaps) {
    items.push({
      key: `gap-${g.id}`,
      tone: "warning",
      icon: Warning,
      title: `Logging coverage gap on ${g.source_name}`,
      detail: `${g.reason.replace(/_/g, " ")} — access during this window may not be visible.`,
      href: "/access-logs",
      when: g.gap_start,
    });
  }
  for (const c of s.cycles) {
    if (c.pending_count > 0) {
      items.push({
        key: `cycle-${c.id}`,
        tone: "info",
        icon: ClipboardText,
        title: `${c.label}: ${c.pending_count} decision${c.pending_count === 1 ? "" : "s"} pending`,
        detail: `${c.item_count} items over a ${c.lookback_days}-day lookback.`,
        href: "/access-reviews",
        when: c.created_at,
      });
    }
  }
  for (const v of [...s.violations].sort((a, b) => b.detected_at.localeCompare(a.detected_at)).slice(0, 3)) {
    const p = parseViolationReason(v.reason);
    items.push({
      key: `viol-${v.id}`,
      tone: "danger",
      icon: ShieldWarning,
      title: p ? `${p.tag} table accessed from ${p.region}` : "Region rule violated",
      detail: p ? `Approved regions: ${p.approved.join(", ")} · ${p.confidence} confidence on the source region.` : v.reason,
      href: "/violations",
      when: v.detected_at,
    });
  }
  return items;
}

const TONE_ICON: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400",
  success: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  danger: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  info: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
  accent: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
};

function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  href,
  icon: IconCmp,
}: {
  label: string;
  value: number | string;
  sub: string;
  tone?: "neutral" | "danger" | "warning";
  href: string;
  icon: Icon;
}) {
  const valueClass =
    tone === "danger" ? "text-red-600 dark:text-red-400" : tone === "warning" ? "text-amber-600 dark:text-amber-400" : "text-ink dark:text-zinc-50";
  return (
    <Link href={href} className="card group flex flex-col gap-3 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-400">{label}</p>
        <IconCmp size={16} className="text-slate-400 transition-colors group-hover:text-slate-600 dark:text-zinc-500 dark:group-hover:text-zinc-300" />
      </div>
      <p className={`text-[2rem] font-semibold leading-none tracking-tight tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-[13px] text-slate-500 dark:text-zinc-400">{sub}</p>
    </Link>
  );
}

function TileSkeleton() {
  return (
    <div className="card flex flex-col gap-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export default function OverviewPage() {
  const user = useCurrentUser();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadSnapshot()
      .then(setSnap)
      .catch(() => setFailed(true));
  }, []);

  const verified = snap ? snap.sources.filter((s) => s.read_only_verified === true).length : 0;
  const sensitive = snap ? snap.tables.filter((t) => t.current_tags.length > 0).length : 0;
  const pending = snap ? snap.cycles.reduce((n, c) => n + c.pending_count, 0) : 0;
  const latestViolation = snap ? [...snap.violations].sort((a, b) => b.detected_at.localeCompare(a.detected_at))[0] : undefined;
  const attention = snap ? buildAttention(snap) : [];
  const latestReport = snap?.reports[0];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title={`Good ${greeting()}, ${user.email.split("@")[0]}`}
        description="Where your sensitive data stands right now: what's connected, what's tagged, what's been flagged, and what still needs a decision."
      />

      {failed && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Couldn&apos;t load the workspace summary. Refresh to try again.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {snap ? (
          <>
            <StatTile
              label="Data sources"
              value={snap.sources.length}
              sub={snap.sources.length === 0 ? "None connected yet" : `${verified} of ${snap.sources.length} verified read-only`}
              tone={snap.sources.length > 0 && verified < snap.sources.length ? "warning" : "neutral"}
              href="/data-sources"
              icon={Database}
            />
            <StatTile
              label="Sensitive tables"
              value={sensitive}
              sub={`of ${snap.tables.length} discovered`}
              href="/lineage"
              icon={TableIcon}
            />
            <StatTile
              label="Open violations"
              value={snap.violations.length}
              sub={latestViolation ? `Latest ${formatRelative(latestViolation.detected_at)}` : "Nothing flagged"}
              tone={snap.violations.length > 0 ? "danger" : "neutral"}
              href="/violations"
              icon={ShieldWarning}
            />
            <StatTile
              label="Pending decisions"
              value={pending}
              sub={snap.cycles.length === 0 ? "No review cycle yet" : `Across ${snap.cycles.length} review cycle${snap.cycles.length === 1 ? "" : "s"}`}
              tone={pending > 0 ? "warning" : "neutral"}
              href="/access-reviews"
              icon={ClipboardText}
            />
          </>
        ) : (
          <>
            <TileSkeleton />
            <TileSkeleton />
            <TileSkeleton />
            <TileSkeleton />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[3fr_2fr]">
        <section className="space-y-3">
          <SectionHeader title="Needs attention" count={snap ? attention.length : undefined} />
          <div className="table-card">
            {!snap ? (
              <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex gap-4 px-5 py-4">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-64" />
                      <Skeleton className="h-3 w-80" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : attention.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="Nothing needs attention" hint="Sources are verified, logging is complete, and every review decision is made." compact />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                {attention.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70 dark:hover:bg-zinc-800/40">
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_ICON[item.tone]}`}>
                        <item.icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="text-sm font-medium text-slate-900 dark:text-zinc-100">{item.title}</span>
                          {item.when && <Time value={item.when} className="text-xs text-slate-400 dark:text-zinc-500" />}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-slate-500 dark:text-zinc-400">{item.detail}</span>
                      </span>
                      <ArrowRight size={16} className="mt-1 shrink-0 text-slate-300 transition-colors group-hover:text-slate-600 dark:text-zinc-600 dark:group-hover:text-zinc-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="space-y-3">
            <SectionHeader
              title="Recent access"
              actions={
                <Link href="/access-logs" className="text-[13px] font-medium text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100">
                  All logs →
                </Link>
              }
            />
            <div className="table-card">
              {!snap ? (
                <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {[0, 1, 2, 3].map((i) => (
                    <li key={i} className="flex items-center justify-between px-5 py-3">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3.5 w-16" />
                    </li>
                  ))}
                </ul>
              ) : snap.events.length === 0 ? (
                <EmptyState icon={Database} title="No access recorded yet" hint="Events appear here as soon as the worker tails a connected source's log." compact />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {snap.events.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                      <QueryTypePill type={e.query_type} />
                      <span className="min-w-0 flex-1">
                        <span className="mono-id block truncate">{e.actor_identifier}</span>
                        <span className="block truncate text-[12px] text-slate-500 dark:text-zinc-400">
                          {e.schema_name_snapshot ? `${e.schema_name_snapshot}.${e.table_name_snapshot}` : "—"} · {e.source_name}
                        </span>
                      </span>
                      <Time value={e.occurred_at} className="text-xs text-slate-400 dark:text-zinc-500" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader title="Latest report" />
            <div className="card">
              {!snap ? (
                <div className="space-y-3">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              ) : latestReport ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                      Generated <Time value={latestReport.generated_at} />
                    </p>
                    <Pill tone="neutral" mono>
                      {latestReport.timezone_label}
                    </Pill>
                  </div>
                  <p className="text-[13px] text-slate-500 dark:text-zinc-400">
                    <Time value={latestReport.range_start} mode="date" /> → <Time value={latestReport.range_end} mode="date" />
                  </p>
                  <div className="flex items-center gap-1 rounded-lg bg-slate-50 px-3 py-2 dark:bg-zinc-950/60">
                    <span className="mono-id truncate text-[12px]" title={latestReport.content_sha256}>
                      sha256 {latestReport.content_sha256}
                    </span>
                    <CopyButton value={latestReport.content_sha256} label="Copy hash" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => window.open(`/api/reports/${latestReport.id}/download`, "_blank", "noopener,noreferrer")}
                    >
                      Download CSV
                    </button>
                    <Link href="/reports" className="btn-secondary btn-sm">
                      All reports
                    </Link>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={FileCsv}
                  title="No report generated yet"
                  hint="A hash-stamped CSV of any date range, ready before the auditor asks."
                  action={
                    <Link href="/reports" className="btn-secondary btn-sm">
                      Generate one
                    </Link>
                  }
                  compact
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
