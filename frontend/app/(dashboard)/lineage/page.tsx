"use client";

import { useEffect, useState } from "react";
import LineageGraph from "@/components/LineageGraph";
import { api, DataSource, LineageGraph as LineageGraphData, TableAsset } from "@/lib/api-client";
import { canManage, useCurrentUser } from "@/lib/CurrentUserContext";

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
      <div>
        <h1 className="text-xl font-semibold dark:text-zinc-100">Lineage &amp; Classification</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          Table-level only in this MVP. Tag tables so region rules and violation checks know what they're
          protecting.
        </p>
      </div>

      <select className="input max-w-sm" value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)}>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <div className="card">
        <h2 className="mb-3 font-medium text-slate-800 dark:text-zinc-200">How everything connects</h2>
        {graph ? <LineageGraph graph={graph} /> : <p className="text-sm text-slate-400 dark:text-zinc-500">Loading...</p>}
      </div>

      <div className="card overflow-x-auto">
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
                <td>{t.schema_name}</td>
                <td className="font-medium">{t.table_name}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {t.current_tags.length === 0 && <span className="text-slate-400 dark:text-zinc-500">untagged</span>}
                    {t.current_tags.map((tag) => (
                      <span key={tag.id} className={`badge ${tagColor(tag.tag)}`}>
                        {tag.tag}
                      </span>
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
                <td colSpan={4} className="text-slate-400 dark:text-zinc-500">
                  No tables discovered yet for this source.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function tagColor(tag: string): string {
  switch (tag) {
    case "pii":
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
    case "financial":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400";
    case "public":
      return "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400";
  }
}
