import { useEffect, useRef, useState } from "react";
import Guacamole from "@pelotech/guacamole-common-js";
import type { RemoteDesktop } from "../lib/agents-remoting";

/** Guacamole 1.6.0 viewer; created only after a verified server grant and a click. */
export function GuacamoleSession({ desktop, onDisconnect }: {
  desktop: RemoteDesktop;
  onDisconnect: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const clientRef = useRef<InstanceType<typeof Guacamole.Client> | null>(null);
  const [status, setStatus] = useState("Connessione al desktop…");
  const [clipboard, setClipboard] = useState("");
  const [received, setReceived] = useState("");

  useEffect(() => {
    if (desktop.state !== "ready" || !desktop.capabilities.view || !container.current) return;
    const element = container.current;
    const width = Math.max(320, Math.min(1920, element.clientWidth || 1024));
    const height = Math.max(240, Math.min(1080, Math.round(window.innerHeight * 0.65)));
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${scheme}//${location.host}/api/v1/desktops/${encodeURIComponent(desktop.id)}/tunnel?width=${width}&height=${height}`;
    const client = new Guacamole.Client(new Guacamole.WebSocketTunnel(url));
    clientRef.current = client;
    const display = client.getDisplay();
    element.replaceChildren(display.getElement());
    client.onstatechange = (state: number) => {
      if (state === 3) setStatus("Desktop connesso");
      if (state === 5) setStatus("Desktop disconnesso");
    };
    client.onerror = (error) => setStatus(
      error.code === 0x0201 || error.code === 0x0202 ? "Accesso remoto negato" : "Desktop non disponibile",
    );

    const mouse = desktop.capabilities.input ? new Guacamole.Mouse(display.getElement()) : null;
    mouse?.onEach(["mousedown", "mouseup", "mousemove"], (event) => {
      const state = (event as unknown as { state: Parameters<typeof client.sendMouseState>[0] }).state;
      const scale = display.getScale() || 1;
      const { x, y } = state;
      state.x /= scale;
      state.y /= scale;
      client.sendMouseState(state);
      state.x = x;
      state.y = y;
    });

    const keyboard = desktop.capabilities.input ? new Guacamole.Keyboard(element) : null;
    if (keyboard) {
      keyboard.onkeydown = (key) => client.sendKeyEvent(1, key);
      keyboard.onkeyup = (key) => client.sendKeyEvent(0, key);
    }
    if (desktop.capabilities.clipboard) {
      client.onclipboard = (stream, mime) => {
        if (mime !== "text/plain") return;
        const reader = new Guacamole.StringReader(stream);
        let text = "";
        reader.ontext = (chunk) => { text = (text + chunk).slice(0, 65536); };
        reader.onend = () => setReceived(text);
      };
    }
    const resize = () => display.scale(Math.min(1, element.clientWidth / Math.max(1, display.getWidth())));
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    try {
      client.connect();
    } catch {
      setStatus("Impossibile aprire il desktop");
    }
    return () => {
      observer.disconnect();
      if (keyboard) {
        keyboard.onkeydown = null;
        keyboard.onkeyup = null;
      }
      if (mouse) mouse.onEach(["mousedown", "mouseup", "mousemove"], () => {});
      client.disconnect();
      if (clientRef.current === client) clientRef.current = null;
      element.replaceChildren();
    };
  }, [desktop]);

  const paste = () => {
    if (!desktop.capabilities.clipboard || !clipboard || !clientRef.current) return;
    const writer = new Guacamole.StringWriter(clientRef.current.createClipboardStream("text/plain"));
    writer.sendText(clipboard);
    writer.sendEnd();
  };

  return (
    <section className="space-y-3" aria-label={`Sessione remota ${desktop.name}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-ink-300">{status}</p>
        <button type="button" className="button-secondary min-h-11" onClick={onDisconnect}>Disconnetti</button>
      </div>
      <div ref={container} tabIndex={desktop.capabilities.input ? 0 : -1}
        aria-label={desktop.capabilities.input ? "Desktop: seleziona per usare mouse e tastiera" : "Desktop in sola lettura"}
        className="min-h-64 overflow-auto rounded-xl border border-ink-700 bg-black outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent" />
      {desktop.capabilities.clipboard && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-ink-300">Testo per la clipboard remota
            <textarea className="mt-2 block min-h-20 w-full rounded-lg border border-ink-700 bg-ink-900 p-3 text-ink-100"
              value={clipboard} onChange={(event) => setClipboard(event.target.value.slice(0, 8192))} />
            <button className="button-secondary mt-2 min-h-11" type="button" onClick={paste}>Invia clipboard</button>
          </label>
          <div className="text-sm text-ink-300">Clipboard ricevuta
            <pre className="mt-2 max-h-40 min-h-20 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-ink-700 bg-ink-900 p-3">{received}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
