import { receiptActionLabel, receiptEvidence, receiptOutcomeLabel, relativeTime } from "../lib/format";
import type { WorkspaceAgentProjectEvidence, WorkspaceSnapshot, Receipt } from "../lib/types";

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

export function SourceStrip({
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

export function AgentsProjectsWorkspace({ snapshot }: { snapshot: WorkspaceSnapshot }) {
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
export function ReceiptsWorkspace({ receipts, compact = false }: { receipts: Receipt[]; compact?: boolean }) {
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
