import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  SEVERITY_BG,
  SEVERITY_LABEL,
  SEVERITY_TEXT,
  bitrate,
  bytes,
  exactTimestamp,
  metric,
  osLabel,
  receiptActionLabel,
  receiptOutcomeLabel,
  relativeTime,
  thermalLabel,
  uptime,
} from "../lib/format";
import type { HistoryPoint, HostView, Receipt } from "../lib/types";
import { DeviceImage } from "./DeviceImage";
import { HostActions } from "./HostActions";
import { Meter } from "./Meter";
import { Sparkline } from "./Sparkline";
import { HISTORY_RANGES } from "../lib/history-ranges";

interface HostDetailProps {
  host: HostView;
  receipts: Receipt[];
  onClose: () => void;
  onReceiptsChanged: () => void;
}

export function HostDetail({ host, receipts, onClose, onReceiptsChanged }: HostDetailProps) {
  const [minutes, setMinutes] = useState(60);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    let alive = true;
    setHistoryLoading(true);
    setHistoryError(null);
    void api
      .history(host.id, minutes)
      .then((data) => {
        if (!alive) return;
        setHistory(data.points);
      })
      .catch(() => {
        if (!alive) return;
        setHistory([]);
        setHistoryError("Storico non disponibile per questo intervallo.");
      })
      .finally(() => {
        if (alive) setHistoryLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [host.id, minutes, historyRefresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sample = host.sample;
  const hostReceipts = receipts.filter((receipt) => receipt.host_id === host.id).slice(0, 6);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`host-detail-title-${host.id}`}
    >
      <button
        type="button"
        aria-label="Chiudi"
        className="flex-1 bg-ink-950/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-ink-700 bg-ink-900 p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <DeviceImage
              image={host.image}
              className="h-14 w-14 rounded-xl object-cover ring-1 ring-ink-700"
              fallback={
                <span className="h-14 w-14 rounded-xl bg-ink-800 ring-1 ring-ink-700" />
              }
            />
            <div className="min-w-0">
              <h2 id={`host-detail-title-${host.id}`} className="truncate text-xl font-semibold text-ink-200">{host.name}</h2>
              <p className="truncate text-xs text-ink-400">
                {sample
                  ? `${sample.hostname} · ${osLabel(sample.os)} ${sample.os_version} · ${sample.arch}`
                  : host.subtitle}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="grid min-h-11 min-w-11 place-items-center rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-200 focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Chiudi pannello"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="mt-4 flex items-center gap-2 rounded-xl bg-ink-850 px-4 py-3">
          <span className={`h-2.5 w-2.5 rounded-full ${SEVERITY_BG[host.health.severity]}`} />
          <span className={`text-sm font-medium ${SEVERITY_TEXT[host.health.severity]}`}>
            {SEVERITY_LABEL[host.health.severity]}
          </span>
          <span className="text-sm text-ink-400">· {host.health.headline}</span>
          {sample && (
            <span
              className="ml-auto text-right text-[11px] text-ink-400"
              title={`Timestamp sorgente: ${sample.sampled_at}`}
            >
              campione {sample.sample_age_s.toFixed(0)}s fa · {exactTimestamp(sample.sampled_at)}
            </span>
          )}
        </div>

        {host.health.reason && (
          <p className="mt-3 rounded-lg border border-ink-700 px-4 py-3 text-xs text-ink-300">
            {host.health.reason}
          </p>
        )}

        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-wider text-ink-400 uppercase">
              Andamento
            </h3>
            <div className="flex flex-wrap gap-1 rounded-lg bg-ink-850 p-1">
              {HISTORY_RANGES.map((range) => (
                <button
                  key={range.minutes}
                  type="button"
                  onClick={() => setMinutes(range.minutes)}
                  className={`min-h-11 rounded-md px-2.5 py-1 text-[11px] transition focus-visible:outline-2 focus-visible:outline-accent ${
                    minutes === range.minutes
                      ? "bg-ink-700 text-ink-200"
                      : "text-ink-400 hover:text-ink-200"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-3 rounded-xl bg-ink-850 p-4">
            {historyError ? (
              <div className="py-4 text-center">
                <p role="status" className="text-xs text-signal-warn">{historyError}</p>
                <button
                  type="button"
                  onClick={() => setHistoryRefresh((value) => value + 1)}
                  className="mt-2 min-h-11 rounded-lg border border-ink-700 px-3 text-xs font-medium text-ink-200 hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Riprova storico
                </button>
              </div>
            ) : historyLoading && history.length === 0 ? (
              <p role="status" className="py-5 text-center text-xs text-ink-500">Caricamento storico…</p>
            ) : (
              <>
                <ChartRow label="CPU" color="text-accent" points={history.map((p) => p.cpu)} />
                <ChartRow
                  label="Memoria"
                  color="text-signal-ok"
                  points={history.map((p) => p.memory)}
                />
                <ChartRow
                  label="Storage disponibile"
                  color="text-ink-300"
                  points={history.map((p) => p.storage_available)}
                />
                {history.some((point) => point.gpu !== null) && (
                  <ChartRow
                    label="GPU"
                    color="text-accent"
                    points={history.map((p) => p.gpu)}
                  />
                )}
                {history.some((point) => point.battery !== null) && (
                  <ChartRow
                    label="Batteria"
                    color="text-signal-ok"
                    points={history.map((p) => p.battery)}
                  />
                )}
                <ChartRow
                  label="Temperatura"
                  color="text-signal-warn"
                  points={history.map((p) => p.temp)}
                />
              </>
            )}
          </div>
        </section>

        {sample && (
          <section className="mt-6 grid grid-cols-2 gap-4">
            {host.health.signals.map((signal) => (
              <Meter
                key={signal.key}
                label={signal.label}
                value={signal.value}
                unit={signal.unit}
                severity={signal.severity}
                detail={signal.detail}
              />
            ))}
          </section>
        )}

        {sample && (
          <section className="mt-6 grid grid-cols-2 gap-3 text-xs text-ink-300">
            <Fact label="Attivo da" value={uptime(sample.uptime_s)} />
            <Fact label="Rete" value={`↓ ${bitrate(sample.network.rx_bps)} · ↑ ${bitrate(sample.network.tx_bps)}`} />
            {sample.disk[0] && (
              <Fact
                label={`Disco ${sample.disk[0].mount}`}
                value={sample.disk[0].available_bytes != null
                  ? `${bytes(sample.disk[0].available_bytes)} disponibili di ${bytes(sample.disk[0].total_bytes)}`
                  : `${bytes(sample.disk[0].free_bytes)} liberi di ${bytes(sample.disk[0].total_bytes)}`}
                detail={sample.disk[0].available_bytes != null
                  ? sample.disk[0].available_stale
                    ? `${bytes(sample.disk[0].free_bytes)} fisicamente liberi · APFS in cache${sample.disk[0].available_age_s != null ? ` da ${Math.round(sample.disk[0].available_age_s)}s` : ""} dopo refresh fallito`
                    : `${bytes(sample.disk[0].free_bytes)} fisicamente liberi · include spazio APFS recuperabile per uso importante`
                  : undefined}
              />
            )}
            {sample.memory.total_bytes && (
              <Fact label="RAM totale" value={bytes(sample.memory.total_bytes)} />
            )}
            <Fact
              label={sample.thermal.cpu_c === null ? "Termica" : "Temperatura"}
              value={thermalLabel(
                sample.thermal.cpu_c,
                sample.thermal.pressure_level,
                sample.thermal.reason,
              )}
              detail={sample.thermal.reason ?? undefined}
            />
            <Fact
              label="GPU"
              value={sample.gpu.name ?? "non identificata"}
              detail={
                sample.gpu.utilization_percent !== null
                  ? `utilizzo ${metric(sample.gpu.utilization_percent, "%")} · ${sample.gpu.source ?? "collector"}`
                  : sample.gpu.reason ?? sample.gpu.source ?? undefined
              }
            />
            {sample.memory.swap_used_bytes !== null &&
              sample.memory.swap_used_bytes !== undefined && (
                <Fact label="Swap in uso" value={bytes(sample.memory.swap_used_bytes)} />
              )}
            {sample.battery.present && (
              <Fact
                label="Batteria"
                value={`${metric(sample.battery.percent, "%")}${
                  sample.battery.state ? ` · ${sample.battery.state}` : ""
                }`}
              />
            )}
          </section>
        )}

        {sample && (
          <section className="mt-6">
            <h3 className="text-xs font-semibold tracking-wider text-ink-400 uppercase">
              Provenienza dati
            </h3>
            <div className="mt-3 grid gap-px overflow-hidden rounded-xl border border-ink-800 bg-ink-800 sm:grid-cols-2">
              <Provenance label="FleetProbe" value={`v${sample.agent_version} · schema ${sample.schema}`} />
              <Provenance label="CPU" value={sample.cpu.source || "collector host"} />
              <Provenance label="Memoria" value={sample.memory.source || "collector host"} />
              <Provenance
                label="Disco"
                value={sample.disk[0] ? `${sample.disk[0].source ?? "statvfs"} · ${sample.disk[0].scope ?? "filesystem"}` : "non disponibile"}
              />
              <Provenance label="GPU" value={sample.gpu.source || sample.gpu.reason || "non disponibile"} />
            </div>
          </section>
        )}

        {sample && sample.processes.length > 0 && (
          <section className="mt-6">
            <h3 className="text-xs font-semibold tracking-wider text-ink-400 uppercase">
              Processi principali
            </h3>
            <ul className="mt-3 divide-y divide-ink-800 rounded-xl bg-ink-850">
              {sample.processes.slice(0, 8).map((process, index) => (
                <li
                  key={`${process.pid}-${index}`}
                  className="flex items-center gap-3 px-4 py-2 text-xs"
                >
                  <span className="w-14 shrink-0 tnum text-ink-400">{process.pid ?? "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-200">
                    {process.name ?? "—"}
                  </span>
                  <span className="tnum w-14 text-right text-ink-300">
                    {process.cpu !== null && process.cpu !== undefined
                      ? `${process.cpu.toFixed(1)}%`
                      : "—"}
                  </span>
                  <span className="tnum w-14 text-right text-ink-400">
                    {process.mem !== null && process.mem !== undefined
                      ? `${process.mem.toFixed(1)}%`
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <HostActions key={host.id} hostId={host.id} onReceiptsChanged={onReceiptsChanged} />

        {hostReceipts.length > 0 && (
          <section className="mt-6 pb-4">
            <h3 className="text-xs font-semibold tracking-wider text-ink-400 uppercase">
              Ricevute recenti
            </h3>
            <ul className="mt-3 space-y-2">
              {hostReceipts.map((receipt) => (
                <li key={receipt.id} className="rounded-lg bg-ink-850 px-4 py-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink-200">
                      {receiptActionLabel(receipt.action)}
                    </span>
                    <span
                      className={
                        receipt.outcome === "failed" ? "text-signal-crit" : "text-signal-ok"
                      }
                    >
                      {receiptOutcomeLabel(receipt.outcome)}
                    </span>
                  </div>
                  <p className="mt-1 text-ink-400">
                    {relativeTime(receipt.started_at)}
                    {receipt.detail ? ` · ${receipt.detail.slice(0, 120)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function ChartRow({
  label,
  color,
  points,
}: {
  label: string;
  color: string;
  points: (number | null)[];
}) {
  const measured = points.filter((point) => point !== null) as number[];
  const last = measured.length ? measured[measured.length - 1] : null;
  const peak = measured.length ? Math.max(...measured) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-ink-400">{label}</span>
        <span className="tnum text-ink-300">
          {last === null ? "non misurato" : `${last.toFixed(0)} · picco ${peak?.toFixed(0)}`}
        </span>
      </div>
      <Sparkline points={points} className={color} height={40} label={label} />
    </div>
  );
}

function Fact({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg bg-ink-850 px-3 py-2">
      <p className="text-[10px] tracking-wide text-ink-400 uppercase">{label}</p>
      <p className="mt-0.5 truncate text-ink-200" title={detail}>{value}</p>
    </div>
  );
}

function Provenance({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-ink-900 px-3 py-3">
      <p className="text-[9px] font-semibold tracking-[0.12em] text-ink-600 uppercase">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] text-ink-400" title={value}>{value}</p>
    </div>
  );
}
