"use client";

import { useEffect, useState } from "react";
import { api, ApiError, DataSource } from "@/lib/api-client";
import { canManage, useCurrentUser } from "@/lib/CurrentUserContext";

const emptyForm = {
  name: "",
  host: "",
  port: 5432,
  dbname: "",
  username: "",
  password: "",
  log_directory: "",
  is_production: true,
};

export default function DataSourcesPage() {
  const user = useCurrentUser();
  const canConnect = canManage(user);
  const canRetest = canManage(user) || user.role === "reviewer";
  const [sources, setSources] = useState<DataSource[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setSources(await api.get<DataSource[]>("/data-sources"));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/data-sources", form);
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to connect data source");
    } finally {
      setSubmitting(false);
    }
  }

  async function retest(id: string) {
    await api.post(`/data-sources/${id}/test-connection`);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold dark:text-zinc-100">Data Sources</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Postgres only in this MVP. Read-only credentials strongly recommended.
          </p>
        </div>
        {canConnect && (
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Connect a data source"}
          </button>
        )}
      </div>

      {showForm && canConnect && (
        <form onSubmit={handleSubmit} className="card grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Host">
            <input
              className="input"
              required
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
            />
          </Field>
          <Field label="Port">
            <input
              type="number"
              className="input"
              required
              value={form.port}
              onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
            />
          </Field>
          <Field label="Database name">
            <input
              className="input"
              required
              value={form.dbname}
              onChange={(e) => setForm({ ...form, dbname: e.target.value })}
            />
          </Field>
          <Field label="Username (read-only role recommended)">
            <input
              className="input"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              className="input"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Field label="csvlog directory (worker-visible path)">
            <input
              className="input"
              required
              value={form.log_directory}
              onChange={(e) => setForm({ ...form, log_directory: e.target.value })}
            />
          </Field>
          <div className="flex items-end gap-2">
            <input
              id="is_production"
              type="checkbox"
              checked={form.is_production}
              onChange={(e) => setForm({ ...form, is_production: e.target.checked })}
            />
            <label htmlFor="is_production" className="text-sm text-slate-700 dark:text-zinc-300">
              This is a production source (non-production sources are excluded from residency violation checks)
            </label>
          </div>
          {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="col-span-full">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4">
        {sources.map((s) => (
          <div key={s.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium text-slate-900 dark:text-zinc-100">{s.name}</h2>
                  {!s.is_production && (
                    <span className="badge bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">non-production</span>
                  )}
                  {s.read_only_verified === true && (
                    <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">read-only verified</span>
                  )}
                  {s.read_only_verified === false && (
                    <span className="badge bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">not read-only</span>
                  )}
                  {s.read_only_verified === null && (
                    <span className="badge bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">unverified</span>
                  )}
                </div>
                <p className="mt-1 break-all text-sm text-slate-500 dark:text-zinc-400">
                  {s.username}@{s.host}:{s.port}/{s.dbname}
                </p>
                {s.read_only_warning && (
                  <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">⚠ {s.read_only_warning}</p>
                )}
              </div>
              {canRetest && (
                <button className="btn-secondary" onClick={() => retest(s.id)}>
                  Re-check
                </button>
              )}
            </div>
          </div>
        ))}
        {sources.length === 0 && !showForm && (
          <p className="text-sm text-slate-500 dark:text-zinc-400">No data sources connected yet.</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">{label}</span>
      {children}
    </label>
  );
}
