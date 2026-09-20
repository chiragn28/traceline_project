"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Scales } from "@phosphor-icons/react";
import { api, ApiError, RegionRule, Violation } from "@/lib/api-client";
import { canManage, useCurrentUser } from "@/lib/CurrentUserContext";
import { parseViolationReason } from "@/lib/violations";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { ConfidencePill, Pill, TagPill } from "@/components/ui/Pill";
import { Time } from "@/components/ui/Time";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";

export default function ViolationsPage() {
  const canManageRules = canManage(useCurrentUser());
  const [violations, setViolations] = useState<Violation[]>([]);
  const [rules, setRules] = useState<RegionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState({ classification_tag: "pii", approved_regions: "uae", applies_to_production_only: true });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [v, r] = await Promise.all([api.get<Violation[]>("/violations"), api.get<RegionRule[]>("/region-rules")]);
    setViolations([...v].sort((a, b) => b.detected_at.localeCompare(a.detected_at)));
    setRules(r);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/region-rules", {
        classification_tag: ruleForm.classification_tag,
        approved_regions: ruleForm.approved_regions
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean),
        applies_to_production_only: ruleForm.applies_to_production_only,
      });
      setShowRuleForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create rule");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Residency"
        title="Violations"
        description="Every access to a tagged table is checked against your region rules the moment it's ingested. Anything outside an approved region lands here."
      />

      <section className="space-y-3">
        <SectionHeader
          title="Flagged accesses"
          count={loading ? undefined : violations.length}
          description="Newest first. Unknown regions are flagged too — an access we can't vouch for isn't a compliant one."
        />
        <div className="table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Detected</th>
                  <th>Classification</th>
                  <th>Observed region</th>
                  <th>Approved regions</th>
                </tr>
              </thead>
              <tbody>
                {loading && <SkeletonRows rows={4} cols={4} />}
                {!loading &&
                  violations.map((v) => {
                    const p = parseViolationReason(v.reason);
                    return (
                      <tr key={v.id} className="row-danger" title={v.reason}>
                        <td>
                          <Time value={v.detected_at} />
                        </td>
                        {p ? (
                          <>
                            <td>
                              <TagPill tag={p.tag} />
                            </td>
                            <td>
                              <span className="flex items-center gap-2">
                                <span className="font-mono text-[12.5px] uppercase text-red-700 dark:text-red-400">{p.region}</span>
                                <ConfidencePill confidence={p.confidence} />
                              </span>
                            </td>
                            <td>
                              <span className="flex flex-wrap gap-1">
                                {p.approved.map((r) => (
                                  <Pill key={r} tone="success" mono>
                                    {r}
                                  </Pill>
                                ))}
                              </span>
                            </td>
                          </>
                        ) : (
                          <td colSpan={3} className="text-slate-600 dark:text-zinc-300">
                            {v.reason}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                {!loading && violations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-0">
                      <EmptyState
                        icon={ShieldCheck}
                        title="No violations flagged"
                        hint={
                          rules.length === 0
                            ? "Add a region rule below and tagged-table access will be checked against it from then on."
                            : "Every access to a tagged table so far came from an approved region."
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
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Region rules"
          count={loading ? undefined : rules.length}
          description="Which regions may access tables carrying each classification tag."
          actions={
            canManageRules && (
              <button className="btn-secondary btn-sm" onClick={() => setShowRuleForm((v) => !v)}>
                {showRuleForm ? "Cancel" : "Add rule"}
              </button>
            )
          }
        />

        {showRuleForm && canManageRules && (
          <form onSubmit={createRule} className="card grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Classification tag</span>
              <input
                className="input"
                value={ruleForm.classification_tag}
                onChange={(e) => setRuleForm({ ...ruleForm, classification_tag: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Approved regions (comma-separated)</span>
              <input
                className="input"
                value={ruleForm.approved_regions}
                onChange={(e) => setRuleForm({ ...ruleForm, approved_regions: e.target.value })}
              />
            </label>
            <label className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                checked={ruleForm.applies_to_production_only}
                onChange={(e) => setRuleForm({ ...ruleForm, applies_to_production_only: e.target.checked })}
              />
              <span className="text-sm text-slate-700 dark:text-zinc-300">Production sources only</span>
            </label>
            {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="col-span-full">
              <button type="submit" className="btn-primary">
                Save rule
              </button>
            </div>
          </form>
        )}

        <div className="table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Classification</th>
                  <th>Approved regions</th>
                  <th>Scope</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {loading && <SkeletonRows rows={2} cols={4} />}
                {!loading &&
                  rules.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <TagPill tag={r.classification_tag} />
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {r.approved_regions.map((region) => (
                            <Pill key={region} tone="success" mono>
                              {region}
                            </Pill>
                          ))}
                        </span>
                      </td>
                      <td className="text-slate-500 dark:text-zinc-400">{r.applies_to_production_only ? "Production sources only" : "All sources"}</td>
                      <td>
                        <Time value={r.created_at} mode="date" />
                      </td>
                    </tr>
                  ))}
                {!loading && rules.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-0">
                      <EmptyState
                        icon={Scales}
                        title="No region rules yet"
                        hint="Start with one: which regions may read tables tagged pii?"
                        action={
                          canManageRules && (
                            <button className="btn-primary" onClick={() => setShowRuleForm(true)}>
                              Add the first rule
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
      </section>
    </div>
  );
}
