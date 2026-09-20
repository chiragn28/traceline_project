"use client";

import { useEffect, useState } from "react";
import { DownloadSimple, FileCsv } from "@phosphor-icons/react";
import { api, ApiError, Report } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/CurrentUserContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { Time } from "@/components/ui/Time";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { CopyButton } from "@/components/ui/CopyButton";

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReportsPage() {
  const user = useCurrentUser();
  const canGenerate = user.role === "admin" || user.role === "reviewer";
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeStart, setRangeStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalInputValue(d);
  });
  const [rangeEnd, setRangeEnd] = useState(() => toLocalInputValue(new Date()));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setReports(await api.get<Report[]>("/reports"));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    try {
      await api.post("/reports", {
        range_start: new Date(rangeStart).toISOString(),
        range_end: new Date(rangeEnd).toISOString(),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }

  function download(id: string) {
    // Same-origin path (see lib/api-client.ts) -- the direct cross-site
    // Railway URL relied on the auth cookie being sent to a third-party
    // domain, which mobile Safari blocks by default.
    window.open(`/api/reports/${id}/download`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidence"
        title="Reports"
        description="A CSV of every access in a date range, hashed at generation time so it can't be silently edited afterwards. Timestamps are shown in Gulf Standard Time and stored in UTC."
      />

      {canGenerate ? (
        <form onSubmit={generate} className="card flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">From</span>
            <input type="datetime-local" className="input" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">To</span>
            <input type="datetime-local" className="input" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          </label>
          <button type="submit" disabled={generating} className="btn-primary">
            {generating ? "Generating…" : "Generate CSV report"}
          </button>
          {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
      ) : (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Viewers can download existing reports, but not generate new ones.</p>
      )}

      <div className="table-card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Generated</th>
                <th>Range</th>
                <th>Timezone</th>
                <th>SHA-256</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows rows={3} cols={5} />}
              {!loading &&
                reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Time value={r.generated_at} />
                    </td>
                    <td className="whitespace-nowrap">
                      <Time value={r.range_start} mode="date" /> <span className="text-slate-400 dark:text-zinc-500">→</span>{" "}
                      <Time value={r.range_end} mode="date" />
                    </td>
                    <td>
                      <Pill tone="neutral" mono>
                        {r.timezone_label}
                      </Pill>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1">
                        <span className="mono-id text-[12px]" title={r.content_sha256}>
                          {r.content_sha256.slice(0, 12)}…{r.content_sha256.slice(-6)}
                        </span>
                        <CopyButton value={r.content_sha256} label="Copy full hash" />
                      </span>
                    </td>
                    <td className="text-right">
                      <button className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={() => download(r.id)}>
                        <DownloadSimple size={14} /> CSV
                      </button>
                    </td>
                  </tr>
                ))}
              {!loading && reports.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-0">
                    <EmptyState
                      icon={FileCsv}
                      title="No reports generated yet"
                      hint={canGenerate ? "Pick a date range above — the first one takes a few seconds." : "An admin or reviewer can generate the first one."}
                      compact
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
