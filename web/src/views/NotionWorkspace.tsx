import { useMemo, useState } from "react";
import { sourceReason } from "../lib/format";
import { NotionEditPanel } from "./NotionEditPanel";
import type { WorkspaceActionItemOperationPacket, WorkspaceActionItemOperationApplyResult, WorkspaceActionItemOperationAppliedResult, WorkspaceNotionRollbackResult, WorkspaceNotionRow, WorkspaceNotion } from "../lib/types";

export function NotionWorkspace({ notion, selectedRow, draft, packet, loadingMore, onSelect, onDraft, onPreview, isPacketCurrent, onApply, onApplied, onRolledBack, onReplayRolledBack, onLoadMore }: {
  notion: WorkspaceNotion;
  selectedRow: WorkspaceNotionRow | null;
  draft: Record<string, unknown>;
  packet: WorkspaceActionItemOperationPacket | null;
  loadingMore: boolean;
  onSelect: (row: WorkspaceNotionRow) => void;
  onDraft: (draft: Record<string, unknown>) => void;
  onPreview: () => void;
  isPacketCurrent: (packet: WorkspaceActionItemOperationPacket) => boolean;
  onApply: (packet: WorkspaceActionItemOperationPacket, confirmation: string) => Promise<WorkspaceActionItemOperationApplyResult>;
  onApplied: (result: WorkspaceActionItemOperationAppliedResult, packet: WorkspaceActionItemOperationPacket) => void;
  onRolledBack: (result: WorkspaceNotionRollbackResult) => void;
  onReplayRolledBack: () => void;
  onLoadMore: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title" | "status">("recent");
  const [statusFilter, setStatusFilter] = useState("");
  const statusColumn = notion.schema.find((column) => column.type === "status" || column.name.toLowerCase() === "status");
  const statuses = useMemo(() => statusColumn
    ? [...new Set([...statusColumn.options, ...notion.rows.map((row) => row.properties[statusColumn.name])
      .filter((value): value is string => typeof value === "string" && Boolean(value))])]
    : [], [notion.rows, statusColumn]);
  const visibleColumns = useMemo(
    () => notion.schema
      .filter((column) => ["Action", "Status", "Do Date", "Priority", "Type", "Action Item", "Focus Priority", "Action Type"].includes(column.name) || column.editable)
      .slice(0, 6),
    [notion.schema],
  );
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it");
    const rows = notion.rows.filter((row) => {
      if (statusColumn && statusFilter && statuses.includes(statusFilter) && row.properties[statusColumn.name] !== statusFilter) return false;
      if (!needle) return true;
      return [row.title, ...Object.values(row.properties)]
        .map((value) => formatCell(value))
        .join(" ")
        .toLocaleLowerCase("it")
        .includes(needle);
    });
    return [...rows].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "it");
      if (sort === "status") {
        return formatCell(a.properties[statusColumn?.name ?? "Status"]).localeCompare(formatCell(b.properties[statusColumn?.name ?? "Status"]), "it");
      }
      return String(b.last_edited_time ?? "").localeCompare(String(a.last_edited_time ?? ""));
    });
  }, [notion.rows, query, sort, statusColumn, statusFilter, statuses]);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 overflow-hidden rounded-xl border border-ink-800 bg-ink-900/45">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink-100">{notion.source.title ?? "Database Notion"}</h2>
            <p className="mt-1 text-xs text-ink-400">{visibleRows.length} di {notion.rows.length} righe caricate · {notion.has_more ? "altre disponibili" : "vista completa"}</p>
          </div>
          <span className="rounded border border-ink-700 px-2 py-1 text-[10px] text-ink-400">
            Preview + Registry
          </span>
        </div>
        <div className="grid gap-2 border-b border-ink-800 p-3 sm:grid-cols-2 lg:grid-cols-[160px_minmax(0,1fr)_160px_160px]">
          <div className="flex min-h-11 items-center rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm font-medium text-ink-200">
            Actions · canonica
          </div>
          <input
            aria-label="Cerca righe Notion"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca titolo, stato o proprietà…"
            className="min-h-11 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-ink-100 placeholder:text-ink-500 focus-visible:outline-2 focus-visible:outline-accent"
          />
          <select
            aria-label="Ordina righe Notion"
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="min-h-11 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-ink-100 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <option value="recent">Modificate di recente</option>
            <option value="title">Titolo A–Z</option>
            <option value="status">Stato</option>
          </select>
          <select
            aria-label="Filtra stato Notion"
            value={statuses.includes(statusFilter) ? statusFilter : ""}
            onChange={(event) => setStatusFilter(event.target.value)}
            disabled={!statusColumn}
            className="min-h-11 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-ink-100 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            <option value="">Tutti gli stati</option>
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        {!notion.source.available ? (
          <p className="p-4 text-sm text-ink-400">{sourceReason(notion.source.reason ?? "Notion non disponibile.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[680px] w-full text-left text-xs">
              <thead className="border-b border-ink-800 text-[10px] tracking-[0.12em] text-ink-500 uppercase">
                <tr>{visibleColumns.map((column) => <th key={column.name} className="px-4 py-3 font-medium">{column.name}<span className="ml-1 normal-case text-ink-600">{column.type}</span></th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink-850">
                {visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    aria-label={`Apri riga ${row.title}`}
                    className={`cursor-pointer hover:bg-ink-850 focus-visible:outline-2 focus-visible:outline-accent ${selectedRow?.id === row.id ? "bg-accent/5" : ""}`}
                    onClick={() => onSelect(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(row);
                      }
                    }}
                  >
                    {visibleColumns.map((column) => <td key={column.name} className="max-w-[260px] px-4 py-3 align-top text-ink-200">{formatCell(row.properties[column.name])}</td>)}
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-sm text-ink-400">
                      Nessuna riga corrisponde alla ricerca.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {notion.has_more && notion.next_cursor && (
          <div className="border-t border-ink-800 p-3">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="min-h-11 w-full rounded-lg border border-ink-700 px-3 text-xs font-medium text-ink-200 hover:bg-ink-850 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60"
            >
              {loadingMore ? "Caricamento…" : "Carica altre righe"}
            </button>
          </div>
        )}
      </section>

      <NotionEditPanel
        row={selectedRow}
        schema={notion.schema}
        draft={draft}
        packet={packet}
        onDraft={onDraft}
        onPreview={onPreview}
        isPacketCurrent={isPacketCurrent}
        onApply={onApply}
        onApplied={onApplied}
        onRolledBack={onRolledBack}
        onReplayRolledBack={onReplayRolledBack}
      />
    </div>
  );
}
function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
