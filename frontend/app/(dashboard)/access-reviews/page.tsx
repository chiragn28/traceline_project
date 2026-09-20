"use client";

import { useEffect, useState } from "react";
import { ClipboardText, DownloadSimple } from "@phosphor-icons/react";
import { api, AccessReviewCycle, AccessReviewItem, ApiError } from "@/lib/api-client";
import { canManage, canReviewNow, useCurrentUser } from "@/lib/CurrentUserContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActorTypePill, DecisionPill, Pill, TagPill } from "@/components/ui/Pill";
import { Time } from "@/components/ui/Time";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";

export default function AccessReviewsPage() {
  const user = useCurrentUser();
  const canStartCycle = canManage(user);
  const canDecide = canReviewNow(user);
  const [cycles, setCycles] = useState<AccessReviewCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>("");
  const [items, setItems] = useState<AccessReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
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
    if (!cs.length) setLoading(false);
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
    setLoading(false);
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
        // Same-origin path (see lib/api-client.ts) -- avoids the auth
        // cookie being treated as third-party and blocked on mobile Safari.
        window.open(`/api/reports/${report.id}/download`, "_blank", "noopener,noreferrer");
      })
      .catch((err) => alert(err instanceof ApiError ? err.message : "Failed to generate evidence report"));
  }

  const currentCycle = cycles.find((c) => c.id === selectedCycle);
  const decided = currentCycle ? currentCycle.item_count - currentCycle.pending_count : 0;
  const progress = currentCycle && currentCycle.item_count > 0 ? Math.round((decided / currentCycle.item_count) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sign-off"
        title="Access Reviews"
        description="Quarterly evidence for SOC 2 / ISO 27001: who has access to sensitive tables, and whether it's still needed. Decisions are final once made — a wrong call is corrected in the next cycle, not by editing history."
        actions={
          canStartCycle && (
            <button className="btn-primary" onClick={() => setShowNewCycle((v) => !v)}>
              {showNewCycle ? "Cancel" : "Start review cycle"}
            </button>
          )
        }
      />

      {showNewCycle && canStartCycle && (
        <form onSubmit={startCycle} className="card flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Label</span>
            <input className="input" placeholder="Q3 2026" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Lookback window (days)</span>
            <input type="number" className="input" value={lookbackDays} onChange={(e) => setLookbackDays(Number(e.target.value))} />
          </label>
          <button type="submit" disabled={generating} className="btn-primary">
            {generating ? "Generating…" : "Generate items"}
          </button>
          {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
      )}

      {cycles.length > 0 && (
        <div className="card flex flex-wrap items-center gap-x-6 gap-y-4">
          <select className="input w-auto min-w-[16rem]" value={selectedCycle} onChange={(e) => setSelectedCycle(e.target.value)}>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {currentCycle && (
            <div className="min-w-[14rem] flex-1">
              <div className="flex items-baseline justify-between text-[12.5px]">
                <span className="text-slate-600 dark:text-zinc-300">
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{decided}</span> of{" "}
                  <span className="tabular-nums">{currentCycle.item_count}</span> decided
                </span>
                <span className="font-mono tabular-nums text-slate-400 dark:text-zinc-500">
                  {currentCycle.lookback_days}d lookback · started <Time value={currentCycle.created_at} />
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {currentCycle && (
            <button className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={downloadEvidence}>
              <DownloadSimple size={14} /> Evidence CSV
            </button>
          )}
        </div>
      )}

      <div className="table-card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Table</th>
                <th>Actor</th>
                <th>Owner</th>
                <th className="num">Accesses</th>
                <th>Last seen</th>
                <th>Decision</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows rows={5} cols={7} />}
              {!loading &&
                items.map((item) => (
                  <tr key={item.id} className={item.decision === "pending" && item.is_stale ? "row-warning" : ""}>
                    <td>
                      <span className="mono-id block">
                        {item.schema_name_snapshot}.{item.table_name_snapshot}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {item.classification_tags_snapshot
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean)
                          .map((t) => (
                            <TagPill key={t} tag={t} />
                          ))}
                      </span>
                    </td>
                    <td>
                      <span className="mono-id block">{item.actor_identifier}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <ActorTypePill type={item.actor_type} />
                        {item.is_stale && <Pill tone="warning">stale</Pill>}
                        {item.access_basis === "granted_only" && (
                          <Pill tone="warning" title="A live grant was found, but no matching activity in the log within the lookback window">
                            dormant grant
                          </Pill>
                        )}
                      </span>
                    </td>
                    <td>
                      {item.owner_email ? (
                        <span className="text-slate-700 dark:text-zinc-300">{item.owner_email}</span>
                      ) : (
                        <span className="text-slate-400 dark:text-zinc-500">{item.actor_type === "service_account" ? "unattributed" : "—"}</span>
                      )}
                    </td>
                    <td className="num font-medium">{item.access_count}</td>
                    <td>
                      <Time value={item.last_seen_at} />
                    </td>
                    <td>
                      <DecisionPill decision={item.decision} />
                      {item.decision !== "pending" && (
                        <div className="mt-1 text-[12px] text-slate-500 dark:text-zinc-500">
                          <span className="whitespace-nowrap">
                            {item.reviewer_email} · <Time value={item.reviewed_at} mode="date" />
                          </span>
                          {item.decision_reason && <div className="italic">“{item.decision_reason}”</div>}
                        </div>
                      )}
                    </td>
                    <td>
                      {item.decision === "pending" && canDecide && (
                        <div className="flex min-w-[12rem] flex-col gap-1.5">
                          <input
                            className="input"
                            placeholder="Reason (optional)"
                            value={reasonDraft[item.id] || ""}
                            onChange={(e) => setReasonDraft({ ...reasonDraft, [item.id]: e.target.value })}
                          />
                          <div className="flex gap-1.5">
                            <button className="btn-secondary btn-sm" onClick={() => decide(item.id, "approved")}>
                              Approve
                            </button>
                            <button
                              className="btn-secondary btn-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                              onClick={() => decide(item.id, "revoked")}
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      )}
                      {item.decision === "pending" && !canDecide && (
                        <span className="text-[12.5px] text-slate-400 dark:text-zinc-500">Not an authorized reviewer</span>
                      )}
                    </td>
                  </tr>
                ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      icon={ClipboardText}
                      title={cycles.length === 0 ? "No review cycle yet" : "Nothing to review in this cycle"}
                      hint={
                        cycles.length === 0
                          ? "Start one and Traceline snapshots every actor that touched a sensitive table in the lookback window."
                          : "No access to sensitive tables was observed inside this cycle's lookback window."
                      }
                      action={
                        cycles.length === 0 &&
                        canStartCycle && (
                          <button className="btn-primary" onClick={() => setShowNewCycle(true)}>
                            Start the first cycle
                          </button>
                        )
                      }
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
