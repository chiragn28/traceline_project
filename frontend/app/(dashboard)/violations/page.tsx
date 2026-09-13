"use client";

import { useEffect, useState } from "react";
import { api, ApiError, RegionRule, Violation } from "@/lib/api-client";
import { canManage, useCurrentUser } from "@/lib/CurrentUserContext";

export default function ViolationsPage() {
  const canManageRules = canManage(useCurrentUser());
  const [violations, setViolations] = useState<Violation[]>([]);
  const [rules, setRules] = useState<RegionRule[]>([]);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState({ classification_tag: "pii", approved_regions: "uae", applies_to_production_only: true });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setViolations(await api.get<Violation[]>("/violations"));
    setRules(await api.get<RegionRule[]>("/region-rules"));
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
        approved_regions: ruleForm.approved_regions.split(",").map((r) => r.trim()).filter(Boolean),
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
      <div>
        <h1 className="text-xl font-semibold dark:text-zinc-100">Violations</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400">Rule-based residency checks against your region rules below.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-800 dark:text-zinc-200">Region rules</h2>
          {canManageRules && (
            <button className="btn-secondary" onClick={() => setShowRuleForm((v) => !v)}>
              {showRuleForm ? "Cancel" : "Add rule"}
            </button>
          )}
        </div>

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
            <label className="flex items-end gap-2">
              <input
                type="checkbox"
                checked={ruleForm.applies_to_production_only}
                onChange={(e) => setRuleForm({ ...ruleForm, applies_to_production_only: e.target.checked })}
              />
              <span className="text-sm text-slate-700">Production sources only</span>
            </label>
            {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
            <div className="col-span-full">
              <button type="submit" className="btn-primary">
                Save rule
              </button>
            </div>
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Classification</th>
                <th>Approved regions</th>
                <th>Scope</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.classification_tag}</td>
                  <td>{r.approved_regions.join(", ")}</td>
                  <td>{r.applies_to_production_only ? "production only" : "all sources"}</td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-slate-400 dark:text-zinc-500">
                    No region rules defined yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium text-slate-800 dark:text-zinc-200">Flagged accesses</h2>
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Detected at</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {violations.map((v) => (
                <tr key={v.id}>
                  <td className="whitespace-nowrap">{new Date(v.detected_at).toLocaleString()}</td>
                  <td>{v.reason}</td>
                </tr>
              ))}
              {violations.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-slate-400 dark:text-zinc-500">
                    No violations flagged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
