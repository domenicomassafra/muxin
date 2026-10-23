import { useState } from "react";
import { AgentsSignoriView } from "./AgentsSignoriView";
import { RemoteDesktopView } from "./RemoteDesktopView";

type AgentsSubView = "sessions" | "desktop";

/** Two authorized surfaces under the existing sixth navigation destination. */
export function AgentsSection() {
  const [subView, setSubView] = useState<AgentsSubView>("sessions");
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">Agenti</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-300">
          Sessioni e desktop vengono mostrati solo con le capacità confermate dal backend owner.
          L'accesso alle sessioni originali e ai desktop dipende dai rispettivi adapter.
        </p>
      </div>
      <div role="group" aria-label="Sezioni Agenti" className="flex flex-wrap gap-2">
        {([
          { id: "sessions", label: "Sessioni" },
          { id: "desktop", label: "Desktop" },
        ] as const).map((item) => (
          <button key={item.id} type="button" aria-pressed={subView === item.id}
            aria-controls="agents-content" onClick={() => setSubView(item.id)}
            className={`button-secondary min-h-11 text-sm ${subView === item.id ? "border-ink-300 bg-ink-800 text-ink-100" : ""}`}>
            {item.label}
          </button>
        ))}
      </div>
      <div id="agents-content" role="region" aria-label={subView === "sessions" ? "Sessioni Agenti" : "Desktop Agenti"}>
        {subView === "sessions" ? <AgentsSignoriView /> : <RemoteDesktopView />}
      </div>
    </div>
  );
}
