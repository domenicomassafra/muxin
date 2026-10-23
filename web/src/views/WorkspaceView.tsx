import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { NotionTypedInput } from "../components/NotionTypedInput";
import { ObsidianWorkspace } from "./WorkspaceObsidianView";
import { receiptActionLabel, receiptEvidence, receiptOutcomeLabel, relativeTime, sourceReason } from "../lib/format";
import type {
  WorkspaceActionItemOperationPacket,
  WorkspaceActionItemOperationAppliedResult,
  WorkspaceAgentProjectEvidence,
  WorkspaceNotionRollbackResult,
  WorkspaceNotionRow,
  WorkspaceNotion,
  WorkspaceSnapshot,
  Receipt,
} from "../lib/types";

type WorkspaceTab = "agents" | "notion" | "obsidian" | "receipts";

const tabs: { id: WorkspaceTab; label: string }[] = [
  { id: "notion", label: "Notion" },
  { id: "obsidian", label: "Obsidian" },
  { id: "agents", label: "Progetti" },
  { id: "receipts", label: "Audit" },
];

function sourceLabel(state: string): string {
  if (state === "healthy") return "Connesso";
  if (state === "retired") return "Ritirata";
  if (state === "offline") return "Non raggiungibile";
  if (state === "partial") return "Parziale";
  return "Errore";
}

function sourceTone(state: string): string {
  if (state === "healthy") return "bg-signal-ok";
  if (state === "retired") return "bg-signal-unknown";
  if (state === "offline" || state === "error") return "bg-signal-crit";
  return "bg-signal-warn";
}

export function WorkspaceView({ active = true, onRefresh }: { active?: boolean; onRefresh?: () => void }) {
  const [tab, setTab] = useState<WorkspaceTab>("notion");
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [notionDatabase, setNotionDatabase] = useState<WorkspaceNotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<WorkspaceNotionRow | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [packet, setPacket] = useState<WorkspaceActionItemOperationPacket | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [obsidianRoot, setObsidianRoot] = useState("all");
  const [notionLoadingMore, setNotionLoadingMore] = useState(false);
  const obsidianRequest = useRef(0);
  const wasActive = useRef(active);

  const loadObsidian = (query: string, root: string, note = "", canonNotice = false) => {
    const request = ++obsidianRequest.current;
    void api.workspaceObsidian(query, root === "all" ? "" : root, note)
      .then((obsidian) => {
        if (request !== obsidianRequest.current) return;
        setSnapshot((current) => current ? { ...current, obsidian } : current);
        if (canonNotice && !obsidian.selected) {
          setNotice("Nota canonica non disponibile nell'indice Obsidian bounded: nessuna nota è stata aperta o modificata.");
        }
      })
      .catch((reason: Error) => {
        if (request !== obsidianRequest.current) return;
        setNotice(canonNotice ? `Nota canonica non disponibile: ${reason.message}` : reason.message);
      });
  };

  const load = (refresh = false) => {
    const currentObsidianRequest = obsidianRequest.current;
    setLoading(true);
    setError(null);
    void api
      .workspace(refresh)
      .then((value) => {
        setSnapshot((current) => ({
          ...value,
          obsidian: obsidianRequest.current === currentObsidianRequest ? value.obsidian : current?.obsidian ?? value.obsidian,
        }));
        setNotionDatabase(value.notion);
        setSelectedRow(null);
        setDraft({});
        setPacket(null);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), []);

  useEffect(() => {
    if (active && !wasActive.current) load(true);
    wasActive.current = active;
  }, [active]);

  const activateTab = (nextTab: WorkspaceTab) => {
    setTab(nextTab);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`workspace-tab-${nextTab}`);
      target?.focus();
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: WorkspaceTab) => {
    const currentIndex = tabs.findIndex((entry) => entry.id === currentTab);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % tabs.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + tabs.length) % tabs.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    activateTab(tabs[nextIndex].id);
  };

  const selectRow = (row: WorkspaceNotionRow) => {
    setSelectedRow(row);
    setPacket(null);
    setNotice(null);
    setDraft({ ...row.properties });
  };

  const preview = () => {
    if (!selectedRow) return;
    const changes = Object.fromEntries(
      Object.entries(draft).filter(([key, value]) => value !== selectedRow.properties[key]),
    );
    if (!Object.keys(changes).length) {
      setNotice("Nessuna modifica da preparare.");
      return;
    }
    void api
      .workspaceActionItemOperationPreview(
        selectedRow.id,
        changes,
        undefined,
      )
      .then((value) => {
        setPacket(value);
        setNotice("Preview dry-run pronta: nessuna riga è stata modificata.");
      })
      .catch((reason: Error) => setNotice(reason.message));
  };

  if (loading && !snapshot) {
    return <p className="text-sm text-ink-400">Caricamento workspace…</p>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Workspace personale</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink-100">Workspace</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-400">
            Notion gestisce le azioni operative. Obsidian resta il canone di conoscenza. Signal Deck li proietta senza creare un secondo database.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            load(true);
            onRefresh?.();
          }}
          disabled={loading}
          className="button-secondary disabled:cursor-wait disabled:opacity-50"
        >
          {loading ? "Aggiornamento…" : "Aggiorna fonti"}
        </button>
      </header>

      <div className="grid gap-2 border-y border-ink-800 py-3 sm:grid-cols-2">
        <SourceStrip
          label="Notion · Actions"
          source={snapshot?.notion.source}
          icon="N"
          onClick={() => activateTab("notion")}
        />
        <SourceStrip
          label="Obsidian · vault canonico"
          source={snapshot?.obsidian.source}
          icon="⌁"
          onClick={() => activateTab("obsidian")}
        />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-ink-800" role="tablist" aria-label="Sezioni workspace">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            id={`workspace-tab-${entry.id}`}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            aria-controls={`workspace-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            onClick={() => activateTab(entry.id)}
            onKeyDown={(event) => handleTabKeyDown(event, entry.id)}
            className={`min-h-11 shrink-0 border-b-2 px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-accent ${
              tab === entry.id ? "border-accent text-ink-100" : "border-transparent text-ink-400 hover:text-ink-200"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg border border-signal-crit/40 bg-signal-crit/10 p-3 text-sm text-signal-crit">{error}</div>}
      {notice && <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-ink-200">{notice}</div>}

      <div
        id={`workspace-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`workspace-tab-${tab}`}
      >
        {tab === "agents" && snapshot && <AgentsProjectsWorkspace snapshot={snapshot} />}
        {tab === "notion" && snapshot && (
          <NotionWorkspace
            notion={notionDatabase ?? snapshot.notion}
            selectedRow={selectedRow}
            draft={draft}
            packet={packet}
            loadingMore={notionLoadingMore}
            onSelect={selectRow}
            onDraft={(value) => {
              setDraft(value);
              setPacket(null);
            }}
            onPreview={preview}
            onApplied={(result) => {
              setNotionDatabase((current) => current ? {
                ...current,
                rows: current.rows.map((row) => row.id === result.row.id ? result.row : row),
              } : current);
              setSelectedRow(result.row);
              setDraft({ ...result.row.properties });
              setNotice(`Modifica salvata. La ricevuta ${result.receipt_id} può ancora ripristinarla.`);
            }}
            onRolledBack={(result) => {
              setNotice(`Modifica ripristinata · Registry ${result.rollback_registry_id} · ricevuta ${result.receipt_id}.`);
              load(true);
            }}
            onReplayRolledBack={() => {
              setNotice("Questa modifica era già stata ripristinata da un altro client. Fonti ricaricate.");
              load(true);
            }}
            onLoadMore={() => {
              if (!notionDatabase?.next_cursor || notionLoadingMore) return;
              setNotionLoadingMore(true);
              void api.workspaceNotion(notionDatabase.next_cursor)
                .then((page) => {
                  setNotionDatabase((current) => {
                    if (!current) return page;
                    const seen = new Set(current.rows.map((row) => row.id));
                    return {
                      ...page,
                      rows: [...current.rows, ...page.rows.filter((row) => !seen.has(row.id))],
                    };
                  });
                })
                .catch((reason: Error) => setNotice(reason.message))
                .finally(() => setNotionLoadingMore(false));
            }}
          />
        )}
        {tab === "obsidian" && snapshot && (
          <ObsidianWorkspace
            snapshot={snapshot}
            search={search}
            root={obsidianRoot}
            onSearch={(value) => {
              setSearch(value);
              loadObsidian(value, obsidianRoot);
            }}
            onRoot={(value) => {
              setObsidianRoot(value);
              loadObsidian(search, value);
            }}
            onSelect={(note) => {
              loadObsidian(search, obsidianRoot, note);
            }}
          />
        )}
        {tab === "receipts" && snapshot && <ReceiptsWorkspace receipts={snapshot.receipts} />}
      </div>
    </div>
  );
}

function SourceStrip({
  label,
  source,
  icon,
  onClick,
}: {
  label: string;
  source?: WorkspaceSnapshot["notion"]["source"];
  icon: string;
  onClick: () => void;
}) {
  const state = source?.state ?? "offline";
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-14 items-center gap-3 rounded-lg bg-ink-900/60 px-3 text-left ring-1 ring-ink-800 transition-colors hover:bg-ink-850 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-ink-800 text-xs font-semibold text-ink-200">
        {icon}
      </span>
      <span className={`h-2 w-2 shrink-0 rounded-full ${sourceTone(state)}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-ink-200">{label}</p>
        <p className="text-[11px] text-ink-400">
          {sourceLabel(state)} · {source ? relativeTime(source.fetched_at) : "in attesa"}
        </p>
      </div>
      {source && source.freshness_s > source.stale_after_s && <span className="text-[10px] text-signal-warn">stale</span>}
      <span className="text-xs text-ink-400 transition-transform group-hover:translate-x-0.5">
        Apri →
      </span>
    </button>
  );
}

function evidenceTone(state: WorkspaceAgentProjectEvidence["source"]["state"]) {
  if (state === "source-proven" || state === "generated" || state === "runtime-proven") {
    return "border-signal-ok/30 bg-signal-ok/10 text-signal-ok";
  }
  if (state === "unproven") return "border-signal-crit/30 bg-signal-crit/10 text-signal-crit";
  return "border-signal-warn/30 bg-signal-warn/10 text-signal-warn";
}

function EvidenceChip({ label, evidence }: { label: string; evidence: WorkspaceAgentProjectEvidence["source"] }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-[10px] font-medium ${evidenceTone(evidence.state)}`} title={evidence.reason ?? undefined}>
      {label} · {evidence.state}
    </span>
  );
}

function AgentsProjectsWorkspace({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const projection = snapshot.external_context.agents_projects;
  const records = [...projection.agents, ...projection.projects];
  return (
    <section className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/45" aria-labelledby="agents-projects-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-800 px-4 py-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.14em] text-ink-500 uppercase">Proiezione sola lettura</p>
          <h2 id="agents-projects-title" className="mt-1 text-base font-semibold text-ink-100">Agenti e progetti</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-400">
            Solo manifest owner e digest verificabili: una prova source non diventa automaticamente runtime.
          </p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-medium ${evidenceTone(projection.state === "proven" ? "runtime-proven" : projection.state === "unproven" ? "unproven" : "manual")}`}>
          {projection.state}
        </span>
      </div>

      {!projection.available && (
        <div className="m-4 rounded-lg border border-dashed border-signal-warn/40 p-3 text-xs leading-5 text-signal-warn">
          Consumer bloccato: {projection.reason ?? "manifest owner non disponibile"}.
        </div>
      )}

      <ul className="divide-y divide-ink-800">
        {records.map((record) => (
          <li key={`${record.kind}:${record.id}`} className="px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-100">{record.name}</p>
                <p className="mt-1 text-[11px] text-ink-500">
                  {record.kind === "agent-profile" ? "Profilo agente" : "Project / skill ChatGPT"}
                  {record.digest ? ` · digest ${record.digest.slice(0, 12)}…` : " · digest non ricevuto"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <EvidenceChip label="Source" evidence={record.source} />
              <EvidenceChip label="Generato" evidence={record.generated} />
              <EvidenceChip label="Runtime" evidence={record.runtime} />
            </div>
            {(record.runtime.reason ?? record.generated.reason ?? record.source.reason) && (
              <p className="mt-2 text-[11px] leading-5 text-ink-400">
                {record.runtime.reason ?? record.generated.reason ?? record.source.reason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotionWorkspace({ notion, selectedRow, draft, packet, loadingMore, onSelect, onDraft, onPreview, onApplied, onRolledBack, onReplayRolledBack, onLoadMore }: {
  notion: WorkspaceNotion;
  selectedRow: WorkspaceNotionRow | null;
  draft: Record<string, unknown>;
  packet: WorkspaceActionItemOperationPacket | null;
  loadingMore: boolean;
  onSelect: (row: WorkspaceNotionRow) => void;
  onDraft: (draft: Record<string, unknown>) => void;
  onPreview: () => void;
  onApplied: (result: WorkspaceActionItemOperationAppliedResult) => void;
  onRolledBack: (result: WorkspaceNotionRollbackResult) => void;
  onReplayRolledBack: () => void;
  onLoadMore: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title" | "status">("recent");
  const visibleColumns = useMemo(
    () => notion.schema
      .filter((column) => ["Action", "Status", "Do Date", "Priority", "Type", "Action Item", "Focus Priority", "Action Type"].includes(column.name) || column.editable)
      .slice(0, 6),
    [notion.schema],
  );
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it");
    const rows = notion.rows.filter((row) => {
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
        return formatCell(a.properties.Status).localeCompare(formatCell(b.properties.Status), "it");
      }
      return String(b.last_edited_time ?? "").localeCompare(String(a.last_edited_time ?? ""));
    });
  }, [notion.rows, query, sort]);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 overflow-hidden rounded-xl border border-ink-800 bg-ink-900/45">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink-100">{notion.source.title ?? "Database Notion"}</h2>
            <p className="mt-1 text-xs text-ink-400">{notion.rows.length} righe bounded · {notion.has_more ? "altre disponibili" : "vista completa"}</p>
          </div>
          <span className="rounded border border-ink-700 px-2 py-1 text-[10px] text-ink-400">
            Preview + Registry
          </span>
        </div>
        <div className="grid gap-2 border-b border-ink-800 p-3 sm:grid-cols-[180px_minmax(0,1fr)_180px]">
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
        onApplied={onApplied}
        onRolledBack={onRolledBack}
        onReplayRolledBack={onReplayRolledBack}
      />
    </div>
  );
}

function NotionEditPanel({ row, schema, draft, packet, onDraft, onPreview, onApplied, onRolledBack, onReplayRolledBack }: {
  row: WorkspaceNotionRow | null;
  schema: WorkspaceNotion["schema"];
  draft: Record<string, unknown>;
  packet: WorkspaceActionItemOperationPacket | null;
  onDraft: (draft: Record<string, unknown>) => void;
  onPreview: () => void;
  onApplied: (result: WorkspaceActionItemOperationAppliedResult) => void;
  onRolledBack: (result: WorkspaceNotionRollbackResult) => void;
  onReplayRolledBack: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [applyState, setApplyState] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [appliedReceipt, setAppliedReceipt] = useState<string | null>(null);
  const [rollbackConfirmation, setRollbackConfirmation] = useState("");
  const [rollingBack, setRollingBack] = useState(false);
  useEffect(() => {
    setConfirmation("");
    setApplyState(null);
    setAppliedReceipt(null);
    setRollbackConfirmation("");
    setRollingBack(false);
  }, [packet?.packet_id, row?.id]);
  const editable = schema.filter((column) => column.editable).slice(0, 8);
  return (
    <aside className="rounded-xl border border-ink-800 bg-ink-900/45 p-4">
      <div className="border-b border-ink-800 pb-3">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-ink-500 uppercase">
          Edit packet
        </p>
        <h2 className="mt-1 text-sm font-semibold text-ink-100">{row ? row.title : "Seleziona una riga"}</h2>
        <p className="mt-1 text-xs text-ink-400">Preview tipizzata, Registry, post-fetch e rollback automatico.</p>
      </div>
      {row && (
        <div className="mt-4 space-y-3">
          {row.url && (
            <a
              href={row.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center rounded-lg border border-ink-700 px-3 text-xs font-medium text-ink-200 hover:bg-ink-850 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Apri pagina in Notion ↗
            </a>
          )}
          {editable.map((column) => (
            <div key={column.name} className="block text-xs text-ink-400">
              <span className="mb-1 flex items-center justify-between"><span>{column.name}</span><span className="text-[10px] text-ink-600">{column.type}</span></span>
              <NotionTypedInput column={column} value={draft[column.name]} onChange={(value) => onDraft({ ...draft, [column.name]: value })} />
            </div>
          ))}
          <button type="button" onClick={onPreview} className="min-h-11 w-full rounded-lg bg-accent px-3 text-xs font-semibold text-ink-950 hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-accent">Prepara preview</button>
          {packet && (
            <div className="space-y-3 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs">
              <p className="font-medium text-ink-100">Dry-run {packet.packet_id}</p>
              <p className="text-ink-400">Preimage {packet.preimage_hash} · receipt {packet.receipt_id}</p>
              <label className="block text-ink-400">
                <span className="mb-1 block">Digita APPLICA per salvare su Notion</span>
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-11 w-full rounded-lg border border-ink-700 bg-ink-950 px-2 text-xs text-ink-100 focus-visible:outline-2 focus-visible:outline-accent" />
              </label>
              <button
                type="button"
                disabled={confirmation !== "APPLICA" || applying || Boolean(appliedReceipt)}
                onClick={() => {
                  setApplying(true);
                  setApplyState(null);
                  void api.workspaceActionItemOperationApply(packet, confirmation)
                    .then((result) => {
                      if (result.status === "already-rolled-back") {
                        setApplyState("La modifica era già stata ripristinata da un altro client. Aggiorno le fonti…");
                        onReplayRolledBack();
                        return;
                      }
                      setAppliedReceipt(result.receipt_id);
                      setApplyState(`Salvato · Registry ${result.registry_id} · ricevuta ${result.receipt_id}`);
                      onApplied(result);
                    })
                    .catch((reason: Error) => setApplyState(reason.message))
                    .finally(() => setApplying(false));
                }}
                className="min-h-11 w-full rounded-lg bg-ink-100 px-3 font-semibold text-ink-950 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {applying ? "Salvataggio…" : "Salva su Notion"}
              </button>
              {appliedReceipt && (
                <div className="space-y-2 border-t border-accent/20 pt-3">
                  <p className="text-ink-300">
                    Hai cambiato idea? Il ripristino controlla prima che nessun altro abbia modificato questi campi.
                  </p>
                  <label className="block text-ink-400">
                    <span className="mb-1 block">Digita ROLLBACK per annullare questa modifica</span>
                    <input
                      value={rollbackConfirmation}
                      onChange={(event) => setRollbackConfirmation(event.target.value)}
                      className="min-h-11 w-full rounded-lg border border-ink-700 bg-ink-950 px-2 text-xs text-ink-100 focus-visible:outline-2 focus-visible:outline-accent"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={rollbackConfirmation !== "ROLLBACK" || rollingBack}
                    onClick={() => {
                      setRollingBack(true);
                      setApplyState(null);
                  void api.workspaceActionItemOperationRollback(packet, rollbackConfirmation)
                        .then((result) => {
                          setApplyState(`Ripristinato · Registry ${result.rollback_registry_id} · ricevuta ${result.receipt_id}`);
                          onRolledBack(result);
                        })
                        .catch((reason: Error) => setApplyState(reason.message))
                        .finally(() => setRollingBack(false));
                    }}
                    className="min-h-11 w-full rounded-lg border border-ink-700 px-3 font-semibold text-ink-200 hover:bg-ink-850 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {rollingBack ? "Ripristino…" : "Ripristina modifica"}
                  </button>
                </div>
              )}
              {applyState && <p role="status" aria-live="polite" className="text-ink-300">{applyState}</p>}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function ReceiptsWorkspace({ receipts, compact = false }: { receipts: Receipt[]; compact?: boolean }) {
  return (
    <section className={`rounded-xl border border-ink-800 bg-ink-900/45 ${compact ? "p-4" : "overflow-hidden"}`}>
      <div className={`border-b border-ink-800 ${compact ? "pb-3" : "px-4 py-3"}`}>
        <p className="text-[10px] font-semibold tracking-[0.14em] text-ink-500 uppercase">Audit trail</p>
        <h2 className="mt-1 text-base font-semibold text-ink-100">Ricevute recenti</h2>
        {!compact && (
          <p className="mt-1 text-xs leading-5 text-ink-400">
            Registry, digest e conflitti quando disponibili. Preimage, journaling e payload privati restano nascosti.
          </p>
        )}
      </div>
      <div className="divide-y divide-ink-850">
        {receipts.length ? receipts.map((receipt) => (
          <ReceiptAuditRow key={receipt.id} receipt={receipt} compact={compact} />
        )) : <p className="px-4 py-5 text-xs text-ink-500">Nessuna operazione registrata.</p>}
      </div>
    </section>
  );
}

function ReceiptAuditRow({ receipt, compact }: { receipt: Receipt; compact: boolean }) {
  const evidence = receiptEvidence(receipt);
  const tone = {
    succeeded: "bg-signal-ok",
    failed: "bg-signal-crit",
    dispatched: "bg-accent",
    running: "bg-signal-warn",
    "manual-gate": "bg-signal-warn",
    "dry-run": "bg-signal-warn",
    "rolled-back": "bg-signal-warn",
  }[receipt.outcome] ?? "bg-ink-600";
  const summary = (
    <>
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${tone}`} />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-xs text-ink-200">{receiptActionLabel(receipt.action)}</span>
        <span className="mt-1 block break-words text-[11px] text-ink-500">
          {receiptOutcomeLabel(receipt.outcome)} · {receipt.detail ?? "Nessun dettaglio"}
        </span>
        <span className="mt-1 block font-mono text-[10px] text-ink-600">
          {receipt.id} · {relativeTime(receipt.started_at)}
        </span>
      </span>
    </>
  );

  if (compact || evidence.length === 0) {
    return <div className="flex items-start gap-3 px-4 py-3">{summary}</div>;
  }
  return (
    <details className="group">
      <summary className="flex min-h-16 cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-ink-850 focus-visible:outline-2 focus-visible:outline-accent">
        {summary}
        <span aria-hidden="true" className="mt-1 shrink-0 text-ink-500 transition-transform group-open:rotate-90">›</span>
      </summary>
      <dl className="grid gap-px border-t border-ink-850 bg-ink-850 sm:grid-cols-2">
        {evidence.map((item) => (
          <div key={`${item.label}:${item.value}`} className="min-w-0 bg-ink-950/70 px-4 py-3">
            <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink-500 uppercase">{item.label}</dt>
            <dd className="mt-1 break-all font-mono text-[11px] text-ink-300" title={item.value}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
