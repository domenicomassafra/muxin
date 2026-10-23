import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { NotionTypedInput } from "../components/NotionTypedInput";
import type { WorkspaceActionItemOperationPacket, WorkspaceActionItemOperationApplyResult, WorkspaceActionItemOperationAppliedResult, WorkspaceNotionRollbackResult, WorkspaceNotionRow, WorkspaceNotion } from "../lib/types";

export function NotionEditPanel({ row, schema, draft, packet, onDraft, onPreview, isPacketCurrent, onApply, onApplied, onRolledBack, onReplayRolledBack }: {
  row: WorkspaceNotionRow | null;
  schema: WorkspaceNotion["schema"];
  draft: Record<string, unknown>;
  packet: WorkspaceActionItemOperationPacket | null;
  onDraft: (draft: Record<string, unknown>) => void;
  onPreview: () => void;
  isPacketCurrent: (packet: WorkspaceActionItemOperationPacket) => boolean;
  onApply: (packet: WorkspaceActionItemOperationPacket, confirmation: string) => Promise<WorkspaceActionItemOperationApplyResult>;
  onApplied: (result: WorkspaceActionItemOperationAppliedResult, packet: WorkspaceActionItemOperationPacket) => void;
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
  const editable = schema.filter((column) => column.editable);
  const currentPacket = packet && row?.id === packet.row_id && isPacketCurrent(packet) ? packet : null;
  return (
    <aside className="rounded-xl border border-ink-800 bg-ink-900/45 p-4">
      <div className="border-b border-ink-800 pb-3">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-ink-500 uppercase">
          Edit packet
        </p>
        <h2 className="mt-1 text-sm font-semibold text-ink-100">{row ? row.title : "Seleziona una riga"}</h2>
        <p className="mt-1 text-xs text-ink-400">{editable.length} proprietà editabili · preview, Registry, post-fetch e rollback.</p>
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
          {currentPacket && (
            <div className="space-y-3 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs">
              <p className="font-medium text-ink-100">Dry-run {currentPacket.packet_id}</p>
              <p className="text-ink-400">Preimage {currentPacket.preimage_hash} · receipt {currentPacket.receipt_id}</p>
              <div className="space-y-2 border-t border-accent/20 pt-3" aria-label="Modifiche Notion in anteprima">
                <p className="font-semibold text-ink-200">Confronta le proprietà prima di salvare</p>
                {Object.entries(currentPacket.changes).map(([name, after]) => (
                  <dl key={name} className="rounded-lg border border-ink-700 p-2">
                    <dt className="font-medium text-ink-100">{name}</dt>
                    <dd className="mt-1 break-words text-ink-400">Prima: {formatPreviewValue(currentPacket.before[name])}</dd>
                    <dd className="mt-1 break-words text-ink-200">Dopo: {formatPreviewValue(after)}</dd>
                  </dl>
                ))}
              </div>
              <label className="block text-ink-400">
                <span className="mb-1 block">Digita APPLICA per salvare su Notion</span>
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-11 w-full rounded-lg border border-ink-700 bg-ink-950 px-2 text-xs text-ink-100 focus-visible:outline-2 focus-visible:outline-accent" />
              </label>
              <button
                type="button"
                disabled={confirmation !== "APPLICA" || applying || Boolean(appliedReceipt) || !isPacketCurrent(currentPacket)}
                onClick={() => {
                  if (!isPacketCurrent(currentPacket) || row?.id !== currentPacket.row_id) return;
                  setApplying(true);
                  setApplyState(null);
                  void onApply(currentPacket, confirmation)
                    .then((result) => {
                      if (result.status === "already-rolled-back") {
                        setApplyState("La modifica era già stata ripristinata da un altro client. Aggiorno le fonti…");
                        onReplayRolledBack();
                        return;
                      }
                      setAppliedReceipt(result.receipt_id);
                      setApplyState(`Salvato · Registry ${result.registry_id} · ricevuta ${result.receipt_id}`);
                      onApplied(result, currentPacket);
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
                      void api.workspaceActionItemOperationRollback(currentPacket, rollbackConfirmation)
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

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map(formatPreviewValue).join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
