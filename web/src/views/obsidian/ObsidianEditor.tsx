import { useEffect, useRef, useState } from "react";
import { request } from "../../lib/api";

type Note = { path: string; content: string; sha256: string; editable: boolean; reason: string | null };
type Packet = { packet_id: string; path: string; before_sha256: string; after_sha256: string; diff: string; diff_truncated: boolean; expires_at: number };
export type NoteDraft = { content: string; before: Note };

async function digest(content: string) {
  const value = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function ObsidianEditor({ path, drafts, onSaved }: { path: string; drafts: Map<string, NoteDraft>; onSaved: () => void }) {
  const [note, setNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [packet, setPacket] = useState<Packet | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState<"read" | "preview" | "save" | null>("read");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const revision = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    const cached = drafts.get(path);
    if (cached) {
      setNote(cached.before); setDraft(cached.content); setEditing(true); setPending(null);
    } else {
      void request<Note>(`/api/workspace/obsidian/note?path=${encodeURIComponent(path)}`)
        .then((value) => { if (live && value.path === path) { setNote(value); setDraft(value.content); } })
        .catch((reason: Error) => { if (live) setError(reason.message); })
        .finally(() => { if (live) setPending(null); });
    }
    return () => { live = false; revision.current += 1; };
  }, [path, drafts]);

  useEffect(() => {
    if (!editing || !note || draft === note.content) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing, draft, note]);

  useEffect(() => {
    if (!packet) return;
    const timer = window.setTimeout(() => { revision.current += 1; setPacket(null); setConfirmation(""); }, Math.max(0, packet.expires_at * 1000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [packet]);

  function change(content: string) {
    revision.current += 1; setDraft(content); setPacket(null); setConfirmation(""); setError(""); setReceipt("");
    setPending(null);
    if (note) drafts.set(path, { content, before: note });
  }

  async function preview() {
    if (!note) return;
    const current = ++revision.current;
    setPending("preview"); setPacket(null); setConfirmation(""); setError("");
    try {
      const after = await digest(draft);
      const value = await request<Packet>("/api/workspace/obsidian/operations/note.edit/preview", { method: "POST", body: JSON.stringify({
        path, content: draft, expected_sha256: note.sha256, idempotency_key: crypto.randomUUID(),
      }) });
      if (current !== revision.current) return;
      if (value.path !== path || value.before_sha256 !== note.sha256 || value.after_sha256 !== after) throw new Error("Anteprima non corrispondente alla nota e al testo correnti");
      setPacket(value);
    } catch (reason) { if (current === revision.current) setError((reason as Error).message); }
    finally { if (current === revision.current) setPending(null); }
  }

  async function save() {
    if (!packet || !note || busy.current || confirmation !== "CONFERMA" || packet.expires_at * 1000 <= Date.now()) return;
    busy.current = true;
    const current = ++revision.current;
    const submitted = draft;
    setPending("save"); setPacket(null); setConfirmation(""); setError("");
    try {
      const value = await request<{ receipt_id: string; sha256: string }>("/api/workspace/obsidian/operations/note.edit/apply", {
        method: "POST", body: JSON.stringify({ packet_id: packet.packet_id, confirmation: "CONFERMA" }),
      });
      if (value.sha256 !== packet.after_sha256) throw new Error("Salvataggio da verificare in Audit: versione inattesa");
      if (current !== revision.current) {
        if (drafts.get(path)?.content === submitted) drafts.delete(path);
        return;
      }
      drafts.delete(path); setNote({ ...note, content: submitted, sha256: value.sha256 });
      setEditing(false); setReceipt(value.receipt_id); onSaved();
    } catch (reason) { if (current === revision.current) setError((reason as Error).message); }
    finally { busy.current = false; if (current === revision.current) setPending(null); }
  }

  const button = "min-h-11 rounded-lg border border-ink-600 px-3 text-sm text-ink-100 hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-ink-100 disabled:cursor-not-allowed disabled:opacity-50";
  return <section aria-label="Editor della nota" className="mt-4 space-y-3">
    {pending === "read" ? <p role="status" className="text-sm text-ink-400">Verifica della versione e dei permessi…</p> : !editing ? <button type="button" className={button} disabled={!note?.editable} onClick={() => setEditing(true)}>Modifica nota</button> : null}
    {!note?.editable && pending !== "read" && <p className="text-sm text-ink-400">{note?.reason || "Writer canonico non disponibile per questa nota."}</p>}
    {editing && note && <>
      <label htmlFor="obsidian-draft" className="block text-sm font-semibold text-ink-200">Testo Markdown</label>
      <textarea id="obsidian-draft" value={draft} maxLength={262144} disabled={pending === "save"} onChange={(event) => change(event.target.value)} className="min-h-80 w-full min-w-0 rounded-lg border border-ink-600 bg-ink-950 p-3 font-mono text-base leading-6 text-ink-100 focus-visible:outline-2 focus-visible:outline-ink-100" />
      <p className="text-sm text-ink-400">La bozza resta in questa pagina quando cambi nota. Il salvataggio verifica che la versione nel vault non sia cambiata.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={pending === "save" || pending === "preview" || draft === note.content} onClick={() => void preview()}>{pending === "preview" ? "Preparo anteprima…" : "Prepara anteprima"}</button>
        <button type="button" className={button} disabled={pending === "save"} onClick={() => { revision.current += 1; drafts.delete(path); setDraft(note.content); setEditing(false); setPacket(null); setPending(null); setError(""); }}>Scarta bozza</button>
      </div>
      {packet && <div className="space-y-3 border-t border-ink-700 pt-4">
        <h3 className="font-semibold text-ink-100">Modifiche da salvare</h3>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm text-ink-200">{packet.diff}</pre>
        {packet.diff_truncated && <p className="text-sm text-ink-400">Diff parziale: controlla il testo completo prima di confermare.</p>}
        <label className="block text-sm text-ink-300">Scrivi CONFERMA per salvare
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-2 block min-h-11 w-full rounded-lg border border-ink-600 bg-ink-950 px-3 text-base text-ink-100 focus-visible:outline-2 focus-visible:outline-ink-100" />
        </label>
        <button type="button" className={button} disabled={confirmation !== "CONFERMA" || pending !== null} onClick={() => void save()}>Salva nel vault</button>
      </div>}
    </>}
    {pending === "save" && <p role="status" className="text-sm text-ink-300">Salvataggio e rilettura della nota canonica…</p>}
    {error && <p role="alert" className="text-sm text-ink-200">{error} La bozza è conservata; nessun nuovo invio automatico.</p>}
    {receipt && <p role="status" className="break-all text-sm text-ink-300">Nota salvata e riletta. <a href="#audit" className="underline underline-offset-2">Ricevuta in Audit</a>: {receipt}</p>}
  </section>;
}
