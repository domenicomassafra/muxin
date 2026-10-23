import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ObsidianWorkspace } from "./WorkspaceObsidianView";
import { AgentsProjectsWorkspace, ReceiptsWorkspace, SourceStrip } from "./WorkspaceSections";
import { NotionWorkspace } from "./NotionWorkspace";
import { createNotionPreviewGate, notionDraftChanges } from "./notionPreviewGate";
import type {
  WorkspaceActionItemOperationPacket,
  WorkspaceNotionRow,
  WorkspaceNotion,
  WorkspaceSnapshot,
} from "../lib/types";

type WorkspaceTab = "agents" | "notion" | "obsidian" | "receipts";

const tabs: { id: WorkspaceTab; label: string }[] = [
  { id: "notion", label: "Notion" },
  { id: "obsidian", label: "Obsidian" },
  { id: "agents", label: "Progetti" },
  { id: "receipts", label: "Audit" },
];

export function WorkspaceView({ active = true, onRefresh }: { active?: boolean; onRefresh?: () => void }) {
  const [tab, setTab] = useState<WorkspaceTab>("notion");
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [notionDatabase, setNotionDatabase] = useState<WorkspaceNotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<WorkspaceNotionRow | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [packet, setPacket] = useState<WorkspaceActionItemOperationPacket | null>(null);
  const [appliedByRow, setAppliedByRow] = useState<Record<string, { packet: WorkspaceActionItemOperationPacket; receiptId: string }>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [obsidianRoot, setObsidianRoot] = useState("all");
  const [notionLoadingMore, setNotionLoadingMore] = useState(false);
  const obsidianRequest = useRef(0);
  const wasActive = useRef(active);
  const notionPreviewGate = useRef(createNotionPreviewGate()).current;
  const editRevision = useRef(0);
  const applyRevisions = useRef(new WeakMap<WorkspaceActionItemOperationPacket, number>());

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
    editRevision.current += 1;
    notionPreviewGate.invalidate();
    setPacket(null);
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

  useEffect(() => {
    load();
    return () => notionPreviewGate.invalidate();
  }, []);

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
    editRevision.current += 1;
    notionPreviewGate.invalidate();
    setSelectedRow(row);
    setPacket(null);
    setNotice(null);
    setDraft({ ...row.properties });
  };

  const preview = () => {
    if (!selectedRow) return;
    editRevision.current += 1;
    const changes = notionDraftChanges(draft, selectedRow.properties);
    notionPreviewGate.invalidate();
    setPacket(null);
    if (!Object.keys(changes).length) {
      setNotice("Nessuna modifica da preparare.");
      return;
    }
    void notionPreviewGate.preview({
      rowId: selectedRow.id,
      changes,
      fetchPacket: () => api.workspaceActionItemOperationPreview(selectedRow.id, changes),
      onReady: (value) => {
        setPacket(value);
        setNotice("Preview dry-run pronta: nessuna riga è stata modificata.");
      },
      onError: (message) => setNotice(message),
    });
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
            Notion gestisce le azioni operative. Obsidian resta il canone di conoscenza. Plancia li proietta senza creare un secondo database.
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
            applied={selectedRow ? appliedByRow[selectedRow.id] ?? null : null}
            loadingMore={notionLoadingMore}
            onSelect={selectRow}
            onDraft={(value) => {
              editRevision.current += 1;
              notionPreviewGate.invalidate();
              setDraft(value);
              setPacket(null);
            }}
            onPreview={preview}
            isPacketCurrent={notionPreviewGate.isCurrent}
            onApply={(value, confirmation) => {
              applyRevisions.current.set(value, editRevision.current);
              return notionPreviewGate.apply(value, confirmation, api.workspaceActionItemOperationApply);
            }}
            onApplied={(result, appliedPacket) => {
              if (result.row.id !== appliedPacket.row_id) {
                setNotice("Readback Notion incoerente: ricarica le fonti prima di intervenire.");
                load(true);
                return;
              }
              setNotionDatabase((current) => current ? {
                ...current,
                rows: current.rows.map((row) => row.id === result.row.id ? result.row : row),
              } : current);
              setAppliedByRow((current) => ({ ...current, [appliedPacket.row_id]: { packet: appliedPacket, receiptId: result.receipt_id } }));
              if (applyRevisions.current.get(appliedPacket) === editRevision.current) {
                setSelectedRow(result.row);
                setDraft({ ...result.row.properties });
                setPacket(null);
              }
              setNotice(`Modifica salvata. La ricevuta ${result.receipt_id} può ancora ripristinarla.`);
            }}
            onRolledBack={(result, appliedPacket) => {
              setAppliedByRow((current) => {
                if (current[appliedPacket.row_id]?.packet !== appliedPacket) return current;
                const remaining = { ...current };
                delete remaining[appliedPacket.row_id];
                return remaining;
              });
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
