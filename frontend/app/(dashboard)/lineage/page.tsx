"use client";

import { useEffect, useState } from "react";
import { Table as TableIcon } from "@phosphor-icons/react";
import LineageGraph from "@/components/LineageGraph";
import { api, DataSource, LineageGraph as LineageGraphData, TableAsset } from "@/lib/api-client";
import { canManage, useCurrentUser } from "@/lib/CurrentUserContext";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { TagPill } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/EmptyState";

const TAG_OPTIONS = ["pii", "financial", "public"];

export default function LineagePage() {
  const canTag = canManage(useCurrentUser());
  const [sources, setSources] = useState<DataSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [tables, setTables] = useState<TableAsset[]>([]);
  const [graph, setGraph] = useState<LineageGraphData | null>(null);
  const [customTag, setCustomTag] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get<DataSource[]>("/data-sources").then((ds) => {
      setSources(ds);
      if (ds.length) setSelectedSource(ds[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedSource) return;
    loadTables();
    api.get<LineageGraphData>(`/lineage/graph?data_source_id=${selectedSource}`).then(setGraph);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSource]);

  async function loadTables() {
    setTables(await api.get<TableAsset[]>(`/tables?data_source_id=${selectedSource}`));
  }

  async function tag(tableId: string, value: string) {
    if (!value) return;
    await api.post(`/tables/${tableId}/classifications`, { tag: value, column_name: null });
    await loadTables();
    setGraph(await api.get<LineageGraphData>(`/lineage/graph?data_source_id=${selectedSource}`));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Classification"
        title="Lineage & Classification"
        description="Which pipelines and people touch which tables. Tag the tables that matter so region rules and review cycles know what they're protecting — table-level only in this MVP."
        actions={
          sources.length > 1 && (
            <select className="input w-auto min-w-[14rem]" value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)}>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )
        }
      />

      <div className="card">
        <h2 className="mb-3 text-[15px] font-semibold text-slate-900 dark:text-zinc-100">How everything connects</h2>
        {graph ? <LineageGraph graph={graph} /> : <p className="text-sm text-slate-400 dark:text-zinc-500">Loading…</p>}
      </div>

      <SectionHeader title="Tables" count={tables.length} description="Tag history is append-only: retagging adds a new entry rather than rewriting the old one." />

      <div className="table-card">
        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Schema</th>
              <th>Table</th>
              <th>Current tags</th>
              <th>Add tag</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.id}>
                <td className="text-slate-500 dark:text-zinc-400">{t.schema_name}</td>
                <td>
                  <span className="mono-id font-medium">{t.table_name}</span>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {t.current_tags.length === 0 && <span className="text-slate-400 dark:text-zinc-500">untagged</span>}
                    {t.current_tags.map((tag) => (
                      <TagPill key={tag.id} tag={tag.tag} />
                    ))}
                  </div>
                </td>
                <td>
                  {canTag ? (
                    <div className="flex gap-2">
                      <select
                        className="input"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value === "__custom__") {
                            setCustomTag({ ...customTag, [t.id]: "" });
                            e.target.value = "";
                            return;
                          }
                          tag(t.id, e.target.value);
                        }}
                      >
                        <option value="" disabled>
                          Choose...
                        </option>
                        {TAG_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                        <option value="__custom__">custom...</option>
                      </select>
                      {customTag[t.id] !== undefined && (
                        <input
                          className="input"
                          placeholder="custom tag, press Enter"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const value = (e.target as HTMLInputElement).value.trim();
                              const rest = { ...customTag };
                              delete rest[t.id];
                              setCustomTag(rest);
                              if (value) tag(t.id, value);
                            }
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400 dark:text-zinc-500">Admin only</span>
                  )}
                </td>
              </tr>
            ))}
            {tables.length === 0 && (
              <tr>
                <td colSpan={4} className="p-0">
                  <EmptyState
                    icon={TableIcon}
                    title="No tables discovered yet"
                    hint="The worker discovers tables on its next poll of this source's schema."
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
