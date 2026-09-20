"use client";

import { useEffect, useState } from "react";
import { Database, Warning } from "@phosphor-icons/react";
import { api, ApiError, DataSource } from "@/lib/api-client";
import { canManage, useCurrentUser } from "@/lib/CurrentUserContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, VerificationPill } from "@/components/ui/Pill";
import { Time } from "@/components/ui/Time";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

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
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retesting, setRetesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setSources(await api.get<DataSource[]>("/data-sources"));
    setLoading(false);
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
    setRetesting(id);
    try {
      await api.post(`/data-sources/${id}/test-connection`);
      await load();
    } finally {
      setRetesting(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Connections"
        title="Data Sources"
        description="Postgres only in this MVP. Traceline tails the query log with a read-only credential; it never installs anything inside your database."
        actions={
          canConnect && (
            <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "Connect a data source"}
            </button>
          )
        }
      />

      {showForm && canConnect && (
        <form onSubmit={handleSubmit} className="card grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Host">
            <input className="input" required value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
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
            <input className="input" required value={form.dbname} onChange={(e) => setForm({ ...form, dbname: e.target.value })} />
          </Field>
          <Field label="Username (read-only role recommended)">
            <input className="input" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
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
          <div className="flex items-end gap-2 pb-2">
            <input
              id="is_production"
              type="checkbox"
              checked={form.is_production}
              onChange={(e) => setForm({ ...form, is_production: e.target.checked })}
            />
            <label htmlFor="is_production" className="text-sm text-slate-700 dark:text-zinc-300">
              Production source (non-production sources are excluded from residency checks)
            </label>
          </div>
          {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="col-span-full">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Connecting…" : "Connect"}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4">
        {loading &&
          [0, 1].map((i) => (
            <div key={i} className="card space-y-3">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3.5 w-80" />
            </div>
          ))}

        {!loading &&
          sources.map((s) => (
            <div key={s.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-100">{s.name}</h2>
                    <VerificationPill verified={s.read_only_verified} />
                    {!s.is_production && <Pill tone="neutral">non-production</Pill>}
                  </div>
                  <p className="mono-id mt-1.5 break-all text-slate-500 dark:text-zinc-400">
                    {s.username}@{s.host}:{s.port}/{s.dbname}
                  </p>
                  <p className="mt-2 text-[12.5px] text-slate-400 dark:text-zinc-500">
                    {s.read_only_checked_at ? (
                      <>
                        Checked <Time value={s.read_only_checked_at} />
                      </>
                    ) : (
                      "Connection not checked yet"
                    )}
                    {" · "}
                    Connected <Time value={s.created_at} />
                  </p>
                  {s.read_only_warning && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                      <Warning size={16} className="mt-0.5 shrink-0" /> {s.read_only_warning}
                    </p>
                  )}
                </div>
                {canRetest && (
                  <button className="btn-secondary btn-sm" disabled={retesting === s.id} onClick={() => retest(s.id)}>
                    {retesting === s.id ? "Checking…" : "Re-check"}
                  </button>
                )}
              </div>
            </div>
          ))}

        {!loading && sources.length === 0 && !showForm && (
          <div className="table-card">
            <EmptyState
              icon={Database}
              title="No data sources connected"
              hint="Connect a Postgres database with a read-only credential and Traceline starts tailing its query log."
              action={
                canConnect && (
                  <button className="btn-primary" onClick={() => setShowForm(true)}>
                    Connect a data source
                  </button>
                )
              }
            />
          </div>
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
