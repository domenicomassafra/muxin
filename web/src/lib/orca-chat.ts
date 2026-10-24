/** Existing Orca inventory and search index. Orca retains ownership of every session. */
export type OrcaTerminal = {
  handle: string;
  title: string;
  agent: string;
  connected: boolean;
  writable: boolean;
};

export type OrcaSearchHit = {
  agent: string;
  sessionId: string;
  title: string;
  updatedAt: string | null;
  messageCount: number | null;
  snippet: string;
};

const HANDLE = /^term_[a-zA-Z0-9-]{1,80}$/;
const MAX_TERMINALS = 50;
const MAX_HITS = 8;
const MAX_SCREEN_LENGTH = 16_000;
type Dict = Record<string, unknown>;
export type OrcaRequester = <T>(path: string, init?: RequestInit) => Promise<T>;

function record(value: unknown): Dict {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Contratto Orca non valido");
  }
  return value as Dict;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || value.length > limit) throw new Error("Testo Orca non valido");
  return value;
}

function optionalText(value: unknown, limit: number): string | null {
  return value == null ? null : text(value, limit);
}

export async function orcaTerminals(request: OrcaRequester, signal?: AbortSignal): Promise<OrcaTerminal[]> {
  const body = record(await request<unknown>("/api/v1/agents/terminals", { signal, cache: "no-store" }));
  if (body.donor !== "orca" || !Array.isArray(body.terminals) || body.terminals.length > MAX_TERMINALS) {
    throw new Error("Inventario Orca incompatibile");
  }
  const terminals = body.terminals.map((entry: unknown): OrcaTerminal => {
    const item = record(entry);
    const handle = text(item.handle, 85);
    if (!HANDLE.test(handle)) throw new Error("Handle Orca non valido");
    return {
      handle, title: text(item.title, 120), agent: text(item.agent, 40),
      connected: item.connected === true, writable: item.connected === true && item.writable === true,
    };
  });
  if (new Set(terminals.map((t) => t.handle)).size !== terminals.length) {
    throw new Error("Terminali Orca duplicati");
  }
  return terminals;
}

export async function orcaScreen(handle: string, request: OrcaRequester, signal?: AbortSignal): Promise<string> {
  if (!HANDLE.test(handle)) throw new Error("Handle Orca non valido");
  const body = record(await request<unknown>(`/api/v1/agents/terminals/${handle}/screen`, {
    signal, cache: "no-store",
  }));
  if (body.handle !== handle || body.source !== "screen") throw new Error("Schermo Orca incompatibile");
  return text(body.text, MAX_SCREEN_LENGTH);
}

export async function orcaSearch(query: string, request: OrcaRequester, signal?: AbortSignal): Promise<OrcaSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 120) throw new Error("Inserisci 2–120 caratteri");
  const body = record(await request<unknown>("/api/v1/agents/search", {
    method: "POST", body: JSON.stringify({ query: trimmed, host: "minipc" }), signal,
  }));
  if (body.host !== "minipc" || !Array.isArray(body.hits) || body.hits.length > MAX_HITS) {
    throw new Error("Risultati Orca incompatibili");
  }
  return body.hits.map((entry: unknown): OrcaSearchHit => {
    const item = record(entry);
    return {
      agent: text(item.agent, 40),
      sessionId: text(item.sessionId, 160),
      title: optionalText(item.title, 200) || "Sessione senza titolo",
      updatedAt: optionalText(item.updatedAt, 60),
      messageCount: typeof item.messageCount === "number" && Number.isSafeInteger(item.messageCount)
        && item.messageCount >= 0 ? item.messageCount : null,
      snippet: text(item.snippet, 600),
    };
  });
}

export async function orcaSend(handle: string, message: string, request: OrcaRequester): Promise<boolean> {
  if (!HANDLE.test(handle) || !message.trim() || message.length > 2000
    || /[\x00-\x08\x0b-\x1f\x7f]/.test(message)) {
    throw new Error("Messaggio o terminale non valido");
  }
  // Never retry an uncertain send. The backend checks its live writable lease.
  const body = record(await request<unknown>(`/api/v1/agents/terminals/${handle}/send`, {
    method: "POST", body: JSON.stringify({ text: message }),
  }));
  if (body.handle !== handle || body.accepted !== true) throw new Error("Invio non confermato");
  return body.submissionObserved === true;
}
