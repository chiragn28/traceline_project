"use client";

import { useEffect, useState } from "react";
import { api, AccessReviewCycle, AccessReviewItem, ApiError } from "@/lib/api-client";
import { canManage, canReviewNow, useCurrentUser } from "@/lib/CurrentUserContext";

export default function AccessReviewsPage() {
  const user = useCurrentUser();
  const canStartCycle = canManage(user);
  const canDecide = canReviewNow(user);
  const [cycles, setCycles] = useState<AccessReviewCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>("");
  const [items, setItems] = useState<AccessReviewItem[]>([]);
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [label, setLabel] = useState("");
  const [lookbackDays, setLookbackDays] = useState(90);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

  async function loadCycles() {
    const cs = await api.get<AccessReviewCycle[]>("/access-reviews");
    setCycles(cs);
    if (cs.length && !selectedCycle) setSelectedCycle(cs[0].id);
  }

  useEffect(() => {
    loadCycles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCycle) return;
    loadItems(selectedCycle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCycle]);

  async function loadItems(cycleId: string) {
    setItems(await api.get<AccessReviewItem[]>(`/access-reviews/${cycleId}/items`));
  }

  async function startCycle(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    try {
      const cycle = await api.post<AccessReviewCycle>("/access-reviews", {
        label: label || `Review ${new Date().toLocaleDateString()}`,
        lookback_days: lookbackDays,
      });
      setShowNewCycle(false);
      setLabel("");
      await loadCycles();
      setSelectedCycle(cycle.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start review cycle");
    } finally {
      setGenerating(false);
    }
  }

  async function decide(itemId: string, decision: "approved" | "revoked") {
    try {
      await api.post(`/access-reviews/items/${itemId}/decision`, {
        decision,
        reason: reasonDraft[itemId] || null,
      });
      await loadItems(selectedCycle);
      await loadCycles();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to record decision");
    }
  }

  function downloadEvidence() {
    api
      .post<{ id: string }>(`/access-reviews/${selectedCycle}/report`)
      .then((report) => {
        const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
        window.open(`${base}/reports/${report.id}/download`, "_blank", "noopener,noreferrer");
      })
      .catch((err) => alert(err instanceof ApiError ? err.message : "Failed to generate evidence report"));
  }

  const currentCycle = cycles.find((c) => c.id === selectedCycle);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold dark:text-zinc-100">Access Reviews</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Quarterly sign-off evidence for SOC 2 / ISO 27001: who has access to sensitive tables, and is it still
            needed.
          </p>
        </div>
        {canStartCycle && (
          <button className="btn-primary" onClick={() => setShowNewCycle((v) => !v)}>
            {showNewCycle ? "Cancel" : "Start review cycle"}
          </button>
        )}
      </div>

      {showNewCycle && canStartCycle && (
        <form onSubmit={startCycle} className="card flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Label</span>
            <input className="input" placeholder="Q3 2026" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Lookback window (days)</span>
            <input
              type="number"
              className="input"
              value={lookbackDays}
              onChange={(e) => setLookbackDays(Number(e.target.value))}
            />
          </label>
          <button type="submit" disabled={generating} className="btn-primary">
            {generating ? "Generating..." : "Generate items"}
          </button>
          {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select className="input max-w-sm" value={selectedCycle} onChange={(e) => setSelectedCycle(e.target.value)}>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.pending_count}/{c.item_count} pending)
            </option>
          ))}
        </select>
        {currentCycle && (
          <button className="btn-secondary" onClick={downloadEvidence}>
            Generate evidence CSV
          </button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Classification</th>
              <th>Actor</th>
              <th>Owner</th>
              <th>Access count</th>
              <th>Last seen</th>
              <th>Decision</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.schema_name_snapshot}.{item.table_name_snapshot}
                </td>
                <td>
                  {item.classification_tags_snapshot.split(",").map((t) => (
                    <span key={t} className="badge mr-1 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
                      {t}
                    </span>
                  ))}
                </td>
                <td>
                  {item.actor_identifier}
                  <span className="ml-1 badge bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">{item.actor_type}</span>
                  {item.is_stale && (
                    <span className="ml-1 badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">stale</span>
                  )}
                  {item.access_basis === "granted_only" && (
                    <span
                      className="ml-1 badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                      title="A live grant was found, but no matching activity in the log within the lookback window"
                    >
                      dormant grant
                    </span>
                  )}
                </td>
                <td>
                  {item.owner_email || (
                    <span className="text-slate-400 dark:text-zinc-500">
                      {item.actor_type === "service_account" ? "unattributed" : "—"}
                    </span>
                  )}
                </td>
                <td>{item.access_count}</td>
                <td className="whitespace-nowrap">
                  {item.last_seen_at ? new Date(item.last_seen_at).toLocaleDateString() : "—"}
                </td>
                <td>
                  {item.decision === "pending" ? (
                    <span className="badge bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">pending</span>
                  ) : (
                    <div>
                      <span
                        className={`badge ${
                          item.decision === "approved"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                            : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                        }`}
                      >
                        {item.decision}
                      </span>
                      <div className="mt-1 text-xs text-slate-500 dark:text-zinc-500">
                        by {item.reviewer_email} on {item.reviewed_at && new Date(item.reviewed_at).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </td>
                <td>
                  {item.decision === "pending" && canDecide && (
                    <div className="flex flex-col gap-1">
                      <input
                        className="input"
                        placeholder="reason (optional)"
                        value={reasonDraft[item.id] || ""}
                        onChange={(e) => setReasonDraft({ ...reasonDraft, [item.id]: e.target.value })}
                      />
                      <div className="flex gap-1">
                        <button className="btn-secondary" onClick={() => decide(item.id, "approved")}>
                          Approve
                        </button>
                        <button className="btn-secondary" onClick={() => decide(item.id, "revoked")}>
                          Revoke
                        </button>
                      </div>
                    </div>
                  )}
                  {item.decision === "pending" && !canDecide && (
                    <span className="text-sm text-slate-400 dark:text-zinc-500">Not an authorized reviewer</span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="text-slate-400 dark:text-zinc-500">
                  {cycles.length === 0
                    ? "No review cycles yet -- start one above."
                    : "No sensitive-table access found in this cycle's lookback window."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
