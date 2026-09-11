"use client";

import { useEffect, useState } from "react";
import { api, ApiError, Report } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/CurrentUserContext";

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReportsPage() {
  const user = useCurrentUser();
  const canGenerate = user.role === "admin" || user.role === "reviewer";
  const [reports, setReports] = useState<Report[]>([]);
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
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    window.open(`${base}/reports/${id}/download`, "_blank");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold dark:text-zinc-100">Reports</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          CSV export for a date range, hash-stamped at generation time so it can't be silently edited afterwards.
        </p>
      </div>

      {canGenerate ? (
        <form onSubmit={generate} className="card flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">From</span>
            <input
              type="datetime-local"
              className="input"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">To</span>
            <input type="datetime-local" className="input" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          </label>
          <button type="submit" disabled={generating} className="btn-primary">
            {generating ? "Generating..." : "Generate CSV report"}
          </button>
          {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
      ) : (
        <p className="text-sm text-slate-400 dark:text-zinc-500">Viewers can download existing reports below, but not generate new ones.</p>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Generated at</th>
              <th>Range</th>
              <th>Timezone</th>
              <th>SHA-256</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{new Date(r.generated_at).toLocaleString()}</td>
                <td className="whitespace-nowrap">
                  {new Date(r.range_start).toLocaleDateString()} - {new Date(r.range_end).toLocaleDateString()}
                </td>
                <td>{r.timezone_label}</td>
                <td className="font-mono text-xs">{r.content_sha256.slice(0, 16)}...</td>
                <td>
                  <button className="btn-secondary" onClick={() => download(r.id)}>
                    Download
                  </button>
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr>
                <td colSpan={5} className="text-slate-400 dark:text-zinc-500">
                  No reports generated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
