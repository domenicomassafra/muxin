import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { createOmniRouteReader, isOmniRouteConverged, type OmniRouteReadState } from "./omniroute-reader";

const VERDICTS = {
  clean: { label: "Convergente", color: "text-signal-ok" },
  changes: { label: "Drift rilevato", color: "text-signal-warn" },
  blocked: { label: "Verifica bloccata", color: "text-signal-warn" },
  failed: { label: "Verifica fallita", color: "text-signal-crit" },
  unavailable: { label: "Stato non verificabile", color: "text-ink-300" },
} as const;

export function OmniRoutePanel({ active }: { active: boolean }) {
  const [readState, setReadState] = useState<OmniRouteReadState>({ status: null, error: null, loading: false });
  const [reader] = useState(() => createOmniRouteReader(api.omniroute, setReadState));
  const { status, error, loading } = readState;

  useEffect(() => {
    reader.setActive(active);
    return () => reader.dispose();
  }, [active, reader]);

  const observation = status?.observation;
  const policy = status?.policy;
  const verdict = loading
    ? { label: "Verifica in corso…", color: "text-ink-300" }
    : isOmniRouteConverged(status) ? VERDICTS.clean
      : observation?.result === "clean" ? { label: "Verifica incompleta", color: "text-signal-warn" }
        : VERDICTS[observation?.result ?? "unavailable"];
  const drift = observation?.items.filter((item) => item.result !== "clean") ?? [];

  return (
    <section aria-labelledby="omniroute-heading" className="mb-5 rounded-xl border border-ink-700 bg-ink-900/65 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="omniroute-heading" className="text-base font-semibold text-ink-100">OmniRoute · policy canonica</h2>
          <p className="mt-1 text-xs text-ink-400">Catalogo dichiarato e verifica nativa del controller ControlCenter; lo stato live richiede un'osservazione completa.</p>
        </div>
        <button type="button" className="button-secondary" onClick={reader.refresh} disabled={loading || !active}>
          {loading ? "Verifica in corso…" : "Verifica drift"}
        </button>
      </div>

      <div role="status" className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span className={`font-semibold ${verdict.color}`}>{error ? "Lettura fallita" : verdict.label}</span>
        {observation && <span className="text-ink-400">Exit {observation.exit_code ?? "—"} · {observation.scope_complete ? "scope completo" : "scope incompleto"}</span>}
      </div>
      {error && <p className="mt-2 text-xs text-signal-crit">{error}</p>}
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-ink-300">Policy dichiarativa</dt>
          <dd className="mt-1 break-all text-ink-400">{policy?.source ?? (loading ? "Verifica in corso…" : "Fonte non disponibile")}</dd>
          <dd className="mt-1 text-ink-400">{policy?.available ? `${policy.model_count} modelli · SHA256 ${policy.sha256?.slice(0, 12)}…` : loading ? "Verifica in corso…" : "Policy non disponibile"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-300">Fonte osservazione</dt>
          <dd className="mt-1 break-all font-mono text-ink-400">{observation?.source ?? "In attesa del controller"}</dd>
          <dd className="mt-1 text-ink-400">{observation?.checked_at ?? "Nessun timestamp verificato"}</dd>
          <dd className="mt-1 break-all text-ink-400">Revisione policy fleet: {observation?.policy_revision ?? "sconosciuta"}</dd>
        </div>
      </dl>

      {drift.length > 0 && (
        <div className="mt-4 rounded-lg border border-signal-warn/30 p-3">
          <h3 className="text-sm font-semibold text-signal-warn">Celle da verificare ({drift.length})</h3>
          <ul className="mt-2 space-y-1 text-xs text-ink-300">
            {drift.map((item, index) => <li key={`${item.host}-${item.component}-${index}`}>{item.host} · {item.component}: <strong>{item.result}</strong></li>)}
          </ul>
        </div>
      )}
      {policy?.available && (
        <details className="mt-4 border-t border-ink-700 pt-3 text-xs text-ink-300">
          <summary className="cursor-pointer font-semibold">Catalogo e route dichiarate ({policy.model_count})</summary>
          <p className="mt-2 text-ink-400">Discovery: {policy.discovery_authority}</p>
          <p className="mt-1 text-ink-400">Configurazione: {policy.configuration_authority}</p>
          <p className="mt-1 text-ink-400">Proiezione: {policy.projection_rule}</p>
          <div className="mt-3 space-y-1">
            {Object.entries(policy.defaults ?? {}).map(([task, value]) => <p key={task}>{task}: <code>{value.route}</code> ({value.thinking_level ?? "default"})</p>)}
          </div>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
            {(policy.models ?? []).map((model) => <li key={model} className="break-all font-mono text-ink-400">{model}</li>)}
          </ul>
        </details>
      )}
      <p className="mt-3 text-xs text-ink-500">Solo lettura. La riconciliazione usa separatamente controlcenter fleet plan/apply con conferma e ricevute native.</p>
    </section>
  );
}
