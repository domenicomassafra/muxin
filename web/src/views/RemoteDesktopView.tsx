import { useEffect, useState } from "react";
import { adapterMessage, getRemoteDesktops, type RemoteDesktop } from "../lib/agents-remoting";
import { GuacamoleSession } from "./GuacamoleSession";

type Inventory =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; status: RemoteDesktop["state"]; desktops: RemoteDesktop[] };

const statusText: Record<RemoteDesktop["state"], string> = {
  unconfigured: "Non configurato / non verificato",
  permission_denied: "Accesso negato",
  offline: "Offline",
  ready: "Disponibile secondo il server",
};

export function RemoteDesktopView({ active = true }: { active?: boolean }) {
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [inventory, setInventory] = useState<Inventory>({ state: "loading" });

  useEffect(() => {
    if (!active) {
      setSelected(null);
      return;
    }
    const controller = new AbortController();
    getRemoteDesktops(fetch, controller.signal)
      .then(({ status, desktops }) => {
        if (!controller.signal.aborted) setInventory({ state: "ready", status, desktops });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setInventory({ state: "error", message: adapterMessage(error) });
      });
    return () => controller.abort();
  }, [refresh, active]);

  const authorized = inventory.state === "ready" ? inventory.desktops.find(
    (desktop) => desktop.id === selected && desktop.state === "ready" && desktop.capabilities.view,
  ) : undefined;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Desktop remoto · Apache Guacamole</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink-100">Desktop autorizzati</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-400">
            Le destinazioni provengono dall'allowlist del backend owner. Stato e capacità
            sono attendibili soltanto se confermati dal server e dal donor installato.
          </p>
        </div>
        <button type="button" onClick={() => { setInventory({ state: "loading" }); setRefresh((count) => count + 1); }}
          className="button-secondary min-h-11">Aggiorna</button>
      </header>

      {inventory.state === "loading" && <p role="status" className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-ink-400">Verifica del servizio remoto in corso…</p>}
      {inventory.state === "error" && <p role="status" className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-ink-400">Desktop remoto non disponibile: {inventory.message}</p>}
      {inventory.state === "ready" && (
        <>
          <p role="status" className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-ink-300">
            Stato del servizio: {statusText[inventory.status]}. Video, input e clipboard sono
            disponibili esclusivamente per i permessi confermati dal backend owner.
          </p>
          {inventory.desktops.length === 0
            ? <p className="text-sm text-ink-400">Nessun desktop autorizzato restituito dal server.</p>
            : <ul className="grid gap-3 md:grid-cols-2">
              {inventory.desktops.map((desktop) => (
                <li key={desktop.id} className="min-w-0 rounded-xl border border-ink-700 bg-ink-900 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="break-words text-sm font-semibold text-ink-100">{desktop.name}</h2>
                    <span className="rounded-lg border border-ink-700 px-2 py-1 text-xs text-ink-300">{desktop.protocol.toUpperCase()}</span>
                  </div>
                  <p className="mt-1 break-all text-xs text-ink-500">ID: {desktop.id}</p>
                  <p className="mt-3 text-sm text-ink-300">{statusText[desktop.state]}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-700 pt-3 text-xs text-ink-400">
                    <div><dt>Video</dt><dd className="mt-1 text-ink-200">{desktop.capabilities.view ? "Concesso" : "Non concesso"}</dd></div>
                    <div><dt>Input</dt><dd className="mt-1 text-ink-200">{desktop.capabilities.input ? "Concesso" : "Non concesso"}</dd></div>
                    <div><dt>Clipboard</dt><dd className="mt-1 text-ink-200">{desktop.capabilities.clipboard ? "Concesso" : "Non concesso"}</dd></div>
                  </dl>
                  {active && desktop.state === "ready" && desktop.capabilities.view && (
                    <button type="button" className="button-secondary mt-3 min-h-11"
                      disabled={selected === desktop.id} onClick={() => setSelected(desktop.id)}>
                      {selected === desktop.id ? "Sessione selezionata" : "Connetti al desktop"}
                    </button>
                  )}
                </li>
              ))}
            </ul>}
          {authorized && active && <GuacamoleSession key={authorized.id} desktop={authorized}
            onDisconnect={() => setSelected(null)} />}
        </>
      )}
    </div>
  );
}
