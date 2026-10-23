import { useEffect, useState } from "react";
import {
  adapterMessage,
  getHermesMessages,
  getHermesProfiles,
  getHermesSessions,
  type HermesMessage,
  type HermesProfile,
  type HermesSession,
} from "../lib/agents-remoting";

type Load<T> = { state: "loading" } | { state: "error"; message: string }
  | { state: "ready"; data: T };

function StateNotice({ message }: { message: string }) {
  return <p role="status" className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-5 text-sm text-ink-300">{message}</p>;
}

export function AgentsSignoriView() {
  const [refresh, setRefresh] = useState(0);
  const [inventory, setInventory] = useState<Load<HermesProfile[]>>({ state: "loading" });
  const [profileId, setProfileId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Load<HermesSession[]>>({ state: "loading" });
  const [messages, setMessages] = useState<Load<HermesMessage[]>>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getHermesProfiles(fetch, controller.signal)
      .then(({ profiles }) => {
        if (!controller.signal.aborted) setInventory({ state: "ready", data: profiles });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setInventory({ state: "error", message: adapterMessage(error) });
      });
    return () => controller.abort();
  }, [refresh]);

  const selectedProfile = inventory.state === "ready"
    ? inventory.data.find((profile) => profile.id === profileId) : undefined;
  const canRead = selectedProfile?.capabilities.readable === true;

  useEffect(() => {
    if (!profileId || !canRead) return;
    const controller = new AbortController();
    getHermesSessions(profileId, fetch, controller.signal)
      .then(({ sessions: data }) => {
        if (!controller.signal.aborted) setSessions({ state: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSessions({ state: "error", message: adapterMessage(error) });
      });
    return () => controller.abort();
  }, [profileId, canRead, refresh]);

  useEffect(() => {
    if (!profileId || !sessionId || !canRead || sessions.state !== "ready"
      || !sessions.data.some((item) => item.id === sessionId)) return;
    const controller = new AbortController();
    getHermesMessages(profileId, sessionId, fetch, controller.signal)
      .then(({ messages: data }) => {
        if (!controller.signal.aborted) setMessages({ state: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setMessages({ state: "error", message: adapterMessage(error) });
      });
    return () => controller.abort();
  }, [profileId, sessionId, canRead, sessions, refresh]);

  const selectProfile = (id: string) => {
    setProfileId(id);
    setSessionId(null);
    setSessions({ state: "loading" });
    setMessages({ state: "loading" });
  };
  const selectSession = (id: string) => {
    setSessionId(id);
    setMessages({ state: "loading" });
  };
  const reload = () => {
    setInventory({ state: "loading" });
    setSessions({ state: "loading" });
    setMessages({ state: "loading" });
    setRefresh((previous) => previous + 1);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Agenti · origine Hermes</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink-100">Profili Signori e sessioni</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-400">
            Inventario nativo dal MiniPC e readback delle sessioni originali tramite il backend owner.
            Nessuna sessione nuova viene avviata da questa vista.
          </p>
        </div>
        <button type="button" onClick={reload} className="button-secondary min-h-11">Aggiorna</button>
      </header>

      {inventory.state === "loading" && <StateNotice message="Verifica dell'adapter Hermes in corso…" />}
      {inventory.state === "error" && <StateNotice message={`Hermes non disponibile: ${inventory.message}`} />}
      {inventory.state === "ready" && inventory.data.length === 0 &&
        <StateNotice message="Nessun profilo Hermes autorizzato restituito dal server." />}

      {inventory.state === "ready" && inventory.data.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="min-w-0 overflow-hidden rounded-xl border border-ink-700 bg-ink-900" aria-label="Profili Hermes">
            <h2 className="border-b border-ink-700 px-4 py-3 text-sm font-semibold text-ink-100">Profili nativi</h2>
            <div className="divide-y divide-ink-700">
              {inventory.data.map((profile) => (
                <button key={profile.id} type="button" onClick={() => selectProfile(profile.id)}
                  aria-pressed={profileId === profile.id}
                  className={`flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-100 ${profileId === profile.id ? "bg-ink-800" : "hover:bg-ink-850"}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-100">{profile.name}</span>
                    <span className="block break-words text-xs text-ink-400">{profile.id} · {profile.host}</span>
                    {profile.version && <span className="block text-xs text-ink-500">{profile.version}</span>}
                  </span>
                  <span className="shrink-0 text-right text-xs text-ink-300">
                    <span className="block">Gateway: {profile.gateway === "running" ? "attivo" : profile.gateway === "stopped" ? "fermo" : "non verificato"}</span>
                    <span className="block text-ink-400">{profile.capabilities.readable ? "Lettura consentita" : "Lettura non abilitata"}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="min-w-0 rounded-xl border border-ink-700 bg-ink-900 p-4" aria-label="Sessioni Hermes">
            <h2 className="text-sm font-semibold text-ink-100">Sessioni esistenti</h2>
            {!selectedProfile && <p className="mt-3 text-sm text-ink-400">Seleziona un profilo per verificarne le sessioni.</p>}
            {selectedProfile && !canRead && <p role="status" className="mt-3 text-sm text-ink-400">Il server non autorizza il readback delle sessioni di questo profilo.</p>}
            {selectedProfile && canRead && sessions.state === "loading" && <p role="status" className="mt-3 text-sm text-ink-400">Lettura delle sessioni…</p>}
            {selectedProfile && canRead && sessions.state === "error" && <p role="status" className="mt-3 text-sm text-ink-400">{sessions.message}</p>}
            {selectedProfile && canRead && sessions.state === "ready" && sessions.data.length === 0 && <p className="mt-3 text-sm text-ink-400">Nessuna sessione nativa restituita.</p>}
            {selectedProfile && canRead && sessions.state === "ready" && sessions.data.length > 0 && (
              <ul className="mt-3 space-y-2">
                {sessions.data.map((session) => (
                  <li key={session.id}>
                    <button type="button" onClick={() => selectSession(session.id)} aria-pressed={sessionId === session.id}
                      className={`min-h-11 w-full rounded-lg border px-3 py-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-ink-100 ${sessionId === session.id ? "border-ink-300 bg-ink-800" : "border-ink-700 hover:bg-ink-850"}`}>
                      <span className="block break-all font-medium text-ink-100">{session.title || session.id}</span>
                      <span className="block break-all text-ink-400">{session.id}{session.updated_at ? ` · ${session.updated_at}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {selectedProfile && canRead && sessionId && sessions.state === "ready" && sessions.data.some((item) => item.id === sessionId) && (
        <section className="rounded-xl border border-ink-700 bg-ink-900 p-4" aria-label="Messaggi redatti">
          <h2 className="text-sm font-semibold text-ink-100">Readback della sessione originale</h2>
          <p className="mt-1 text-xs text-ink-400">Solo export redatto Hermes. Riapertura interattiva e invio richiedono un trasporto nativo e un grant owner ancora da verificare.</p>
          {messages.state === "loading" && <p role="status" className="mt-3 text-sm text-ink-400">Lettura dei messaggi…</p>}
          {messages.state === "error" && <p role="status" className="mt-3 text-sm text-ink-400">{messages.message}</p>}
          {messages.state === "ready" && messages.data.length === 0 && <p className="mt-3 text-sm text-ink-400">Nessun messaggio esportato.</p>}
          {messages.state === "ready" && <ol className="mt-3 space-y-3">
            {messages.data.map((message, index) => (
              <li key={`${sessionId}-${index}`} className="rounded-lg border border-ink-700 bg-ink-850 p-3">
                <p className="text-xs font-semibold text-ink-200">{message.role}{message.timestamp ? ` · ${message.timestamp}` : ""}</p>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-ink-300">{message.text}</pre>
              </li>
            ))}
          </ol>}
        </section>
      )}

      <aside className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-ink-400">
        <p>La cronologia indicizzata Orca è una fonte distinta dall'inventario e dalle sessioni Hermes native.</p>
        <a href="/agents" className="mt-2 inline-flex min-h-11 items-center text-ink-100 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ink-100">Apri cronologia Orca esistente ↗</a>
      </aside>
    </div>
  );
}
