import { useMemo, useState } from "react";
import {
  receiptActionLabel,
  receiptEvidence,
  receiptOutcomeLabel,
  relativeTime,
} from "../lib/format";
import type { Receipt } from "../lib/types";

const OUTCOME_STYLE: Record<string, string> = {
  succeeded: "bg-signal-ok/15 text-signal-ok",
  dispatched: "bg-accent/15 text-accent",
  running: "bg-signal-warn/15 text-signal-warn",
  interrupted: "bg-signal-warn/15 text-signal-warn",
  failed: "bg-signal-crit/15 text-signal-crit",
  "dry-run": "bg-accent/15 text-accent",
  "manual-gate": "bg-signal-warn/15 text-signal-warn",
  "rolled-back": "bg-ink-700 text-ink-200",
};

export function ActivityView({ receipts, onRefresh }: { receipts: Receipt[]; onRefresh: () => void }) {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("all");
  const failed = receipts.filter((receipt) => receipt.outcome === "failed").length;
  const inFlight = receipts.filter((receipt) => ["running", "dispatched", "dry-run"].includes(receipt.outcome)).length;
  const visibleReceipts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it");
    return receipts.filter((receipt) => {
      if (outcome !== "all" && receipt.outcome !== outcome) return false;
      if (!needle) return true;
      const evidence = receiptEvidence(receipt).map((item) => `${item.label} ${item.value}`);
      return [receipt.id, receipt.host_id, receipt.action, receiptActionLabel(receipt.action), ...evidence]
        .join(" ")
        .toLocaleLowerCase("it")
        .includes(needle);
    });
  }, [outcome, query, receipts]);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Audit trail</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink-100">Audit</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-400">
            Ricevute persistenti per preview, modifiche, rollback e azioni host. Nessun payload privato viene mostrato qui.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="button-secondary"
        >
          Aggiorna
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <AuditStat label="Ricevute" value={receipts.length} />
        <AuditStat label="In corso / preview" value={inFlight} />
        <AuditStat label="Fallite" value={failed} tone={failed ? "text-signal-crit" : "text-ink-100"} />
      </div>

      <section className="grid gap-2 rounded-xl border border-ink-800 bg-ink-900/60 p-3 sm:grid-cols-[minmax(240px,1fr)_190px_auto]" aria-label="Filtri audit">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca azione, host, ricevuta o Registry…"
          aria-label="Cerca nell'audit"
          className="min-h-11 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-ink-100 placeholder:text-ink-500 focus-visible:outline-2 focus-visible:outline-accent"
        />
        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          aria-label="Filtra audit per esito"
          className="min-h-11 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-ink-100 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <option value="all">Tutti gli esiti</option>
          <option value="failed">Fallite</option>
          <option value="running">In corso</option>
          <option value="interrupted">Interrotte</option>
          <option value="dry-run">Solo anteprima</option>
          <option value="succeeded">Completate</option>
          <option value="dispatched">Inviate</option>
          <option value="rolled-back">Ripristinate</option>
        </select>
        <div className="flex min-h-11 items-center justify-end text-xs text-ink-500">
          <span className="tnum text-ink-300">{visibleReceipts.length}</span>&nbsp;/&nbsp;{receipts.length}
        </div>
      </section>

      {receipts.length === 0 ? (
        <p className="panel border-dashed p-6 text-sm text-ink-400">
          Nessuna azione registrata finora.
        </p>
      ) : visibleReceipts.length === 0 ? (
        <div className="panel border-dashed p-8 text-center">
          <p className="text-sm font-medium text-ink-300">Nessuna ricevuta corrisponde ai filtri.</p>
          <button type="button" onClick={() => { setQuery(""); setOutcome("all"); }} className="text-link mt-2">Azzera filtri</button>
        </div>
      ) : (
        <ul className="panel divide-y divide-ink-800 overflow-hidden">
          {visibleReceipts.map((receipt) => {
            const evidence = receiptEvidence(receipt);
            return (
              <li
                key={receipt.id}
                className="grid gap-x-4 gap-y-2 px-4 py-4 transition hover:bg-ink-850/70 sm:grid-cols-[130px_minmax(0,1fr)_160px_90px] sm:items-start"
              >
              <span
                className={`w-fit rounded px-2 py-1 text-[10px] font-semibold uppercase ${
                  OUTCOME_STYLE[receipt.outcome] ?? "bg-ink-700 text-ink-300"
                }`}
              >
                {receiptOutcomeLabel(receipt.outcome)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-200">{receiptActionLabel(receipt.action)}</p>
                {evidence.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {evidence.slice(0, 4).map((item) => (
                      <span key={`${item.label}:${item.value}`} className="rounded border border-ink-700 bg-ink-850 px-2 py-1 font-mono text-[9px] text-ink-400" title={item.value}>
                        {item.label}: {item.value.slice(0, 24)}{item.value.length > 24 ? "…" : ""}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 truncate font-mono text-[10px] text-ink-600">{receipt.id}</p>
              </div>
              <span className="text-xs text-ink-400">{receipt.host_id}</span>
              <span className="tnum text-[11px] text-ink-500 sm:text-right">
                {relativeTime(receipt.started_at)}
              </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AuditStat({ label, value, tone = "text-ink-100" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="metric-card cursor-default hover:translate-y-0">
      <p className="eyebrow">{label}</p>
      <p className={`tnum mt-3 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
