import { useCallback, useEffect, useMemo, useState } from "react";
import { HostDetail } from "./components/HostDetail";
import { OmniRoutePanel } from "./components/OmniRoutePanel";
import { api, subscribeFleet, type StreamStatus } from "./lib/api";
import { SEVERITY_BG } from "./lib/format";
import type {
  ControlCenterSummary,
  FleetSnapshot,
  HistoryPoint,
  ProfileFleet,
  Receipt,
} from "./lib/types";
import { ActivityView } from "./views/ActivityView";
import { FleetView } from "./views/FleetView";
import { OverviewView } from "./views/OverviewView";
import { ProfilesView } from "./views/ProfilesView";
import { WorkspaceView } from "./views/WorkspaceView";

type View = "overview" | "fleet" | "profiles" | "workspace" | "audit";

const VIEWS = new Set<View>(["overview", "fleet", "profiles", "workspace", "audit"]);

function viewFromLocation(): View {
  const candidate = window.location.hash.replace(/^#\/?/, "") as View;
  return VIEWS.has(candidate) ? candidate : "overview";
}

const NAV_PATHS: { id: View; label: string; path: string }[] = [
  { id: "overview", label: "Panoramica", path: "M4 13h6V4H4zM14 20h6v-7h-6zM14 9h6V4h-6zM4 20h6v-3H4z" },
  { id: "fleet", label: "Flotta", path: "M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM13 13h7v5h-7z" },
  { id: "profiles", label: "Account", path: "M3 5h18v14H3zM3 9h18M6 7h.01M9 7h.01" },
  { id: "workspace", label: "Workspace", path: "M6 3h10l3 3v15H6zM16 3v4h4M9 11h7M9 15h7" },
  { id: "audit", label: "Audit", path: "M4 19h16M5 15l4-4 3 3 7-8M17 6h2v2" },
];

const NAV = NAV_PATHS.map((entry) => ({
  id: entry.id,
  label: entry.label,
  icon: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d={entry.path} />
    </svg>
  ),
}));

const STATUS_COPY: Record<StreamStatus, { text: string; tone: string }> = {
  connecting: { text: "Connessione…", tone: "bg-signal-warn" },
  live: { text: "In diretta", tone: "bg-signal-ok" },
  polling: { text: "Aggiornamento periodico", tone: "bg-signal-warn" },
  offline: { text: "Nessuna connessione", tone: "bg-signal-crit" },
};

export default function App() {
  const initialView = useMemo(viewFromLocation, []);
  const [view, setView] = useState<View>(initialView);
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [fleetSubscriptionEpoch, setFleetSubscriptionEpoch] = useState(0);
  const [histories, setHistories] = useState<Record<string, HistoryPoint[]>>({});
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [summary, setSummary] = useState<ControlCenterSummary | null>(null);
  const [profiles, setProfiles] = useState<ProfileFleet | null>(null);
  const [loadErrors, setLoadErrors] = useState<{
    summary: string | null;
    profiles: string | null;
    receipts: string | null;
  }>({ summary: null, profiles: null, receipts: null });
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [visited, setVisited] = useState<Set<View>>(() => new Set([initialView]));

  const navigate = useCallback((nextView: View) => {
    const nextHash = `#${nextView}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, "", nextHash);
    }
    setVisited((current) => new Set(current).add(nextView));
    setView(nextView);
  }, []);

  useEffect(() => {
    const syncLocation = () => {
      const nextView = viewFromLocation();
      setVisited((current) => new Set(current).add(nextView));
      setView(nextView);
    };
    window.addEventListener("popstate", syncLocation);
    window.addEventListener("hashchange", syncLocation);
    return () => {
      window.removeEventListener("popstate", syncLocation);
      window.removeEventListener("hashchange", syncLocation);
    };
  }, []);

  useEffect(() => {
    const label = NAV_PATHS.find((entry) => entry.id === view)?.label ?? "Signal Deck";
    document.title = `${label} · Signal Deck`;
  }, [view]);

  useEffect(
    () => subscribeFleet(setSnapshot, setStatus),
    [fleetSubscriptionEpoch],
  );

  const loadReceipts = useCallback(() => {
    setLoadErrors((current) => ({ ...current, receipts: null }));
    void api
      .receipts()
      .then((data) => setReceipts(data.receipts))
      .catch((reason: Error) => setLoadErrors((current) => ({ ...current, receipts: reason.message })));
  }, []);

  const loadSummary = useCallback((refresh = false) => {
    setLoadErrors((current) => ({ ...current, summary: null }));
    void api
      .summary(refresh)
      .then(setSummary)
      .catch((reason: Error) => setLoadErrors((current) => ({ ...current, summary: reason.message })));
  }, []);

  const loadProfiles = useCallback((refresh = false) => {
    setLoadErrors((current) => ({ ...current, profiles: null }));
    void api
      .profiles(refresh)
      .then(setProfiles)
      .catch((reason: Error) => setLoadErrors((current) => ({ ...current, profiles: reason.message })));
  }, []);

  const retryFleet = useCallback(() => {
    setStatus("connecting");
    setFleetSubscriptionEpoch((value) => value + 1);
  }, []);

  const refreshOverview = useCallback(() => {
    loadSummary(true);
    loadReceipts();
    loadProfiles(true);
    void api.fleet().then(setSnapshot).catch(() => undefined);
  }, [loadProfiles, loadReceipts, loadSummary]);

  useEffect(() => {
    if (view === "overview") {
      loadReceipts();
      loadSummary();
      loadProfiles();
      return;
    }
    if (view === "fleet") {
      loadReceipts();
      loadSummary();
      return;
    }
    if (view === "profiles") {
      loadProfiles();
      return;
    }
    if (view === "audit") loadReceipts();
  }, [loadProfiles, loadReceipts, loadSummary, view]);

  useEffect(() => {
    const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
    const timers: number[] = [];
    if (view === "overview" || view === "fleet") {
      timers.push(window.setInterval(() => visible() && loadSummary(true), 90_000));
    }
    if (view === "overview" || view === "fleet" || view === "audit") {
      timers.push(window.setInterval(() => visible() && loadReceipts(), 30_000));
    }
    if (view === "overview") {
      // Browser inventory fans out over SSH, so refresh it less aggressively
      // than local telemetry and source summaries.
      timers.push(window.setInterval(() => visible() && loadProfiles(true), 300_000));
    }
    return () => timers.forEach((timer) => window.clearInterval(timer));
  }, [loadProfiles, loadReceipts, loadSummary, view]);

  // The comparison rows need a little history for their sparklines; refresh it
  // slowly so the live socket stays the fast path.
  const hostIds = useMemo(
    () => (snapshot ? snapshot.hosts.map((host) => host.id).join(",") : ""),
    [snapshot],
  );

  useEffect(() => {
    if (!hostIds || (view !== "fleet" && view !== "overview")) return;
    let alive = true;
    const load = () => {
      hostIds.split(",").forEach((hostId) => {
        void api
          .history(hostId, 60)
          .then((data) => {
            if (alive) setHistories((prev) => ({ ...prev, [hostId]: data.points }));
          })
          .catch(() => undefined);
      });
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [hostIds, view]);

  const selected = snapshot?.hosts.find((host) => host.id === selectedHost) ?? null;
  const statusInfo = STATUS_COPY[status];

  return (
    <div className="flex min-h-full flex-col bg-ink-950 lg:flex-row">
      <nav
        className="sticky top-0 z-30 flex shrink-0 items-center gap-1 border-b border-ink-800 bg-ink-950/90 px-3 py-2 backdrop-blur-xl lg:h-screen lg:w-64 lg:flex-col lg:items-stretch lg:border-r lg:border-b-0 lg:px-3 lg:py-5"
        aria-label="Navigazione principale"
      >
        <div className="mr-2 flex items-center gap-2.5 lg:mr-0 lg:mb-7 lg:px-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4.5 w-4.5">
              <path d="M4 14h4l2-6 3 12 2.5-6H20" />
            </svg>
          </span>
          <div className="hidden lg:block">
            <p className="text-sm font-semibold tracking-tight text-ink-100">Signal Deck</p>
            <p className="text-[10px] tracking-[0.14em] text-ink-400 uppercase">
              Control Center
            </p>
          </div>
        </div>

        <p className="mb-2 hidden px-3 text-[10px] font-semibold tracking-[0.14em] text-ink-500 uppercase lg:block">
          Control plane
        </p>
        {NAV.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => navigate(entry.id)}
            aria-label={entry.label}
            aria-current={view === entry.id ? "page" : undefined}
            className={`flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              view === entry.id
                ? "bg-ink-800 text-ink-100"
                : "text-ink-300 hover:bg-ink-850 hover:text-ink-100"
            }`}
          >
            {entry.icon}
            <span className="hidden sm:inline">{entry.label}</span>
          </button>
        ))}

        <div
          data-app-surface="signal-deck"
          data-version="3.0.0"
          className="ml-auto flex min-h-11 items-center justify-between gap-2 rounded-lg lg:mt-auto lg:ml-0 lg:border lg:border-ink-700 lg:bg-ink-900/70 lg:px-3"
        >
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusInfo.tone}`} />
            <span className="hidden text-[11px] text-ink-300 lg:inline">{statusInfo.text}</span>
          </div>
          <span className="hidden text-[9px] font-mono text-ink-500 lg:inline">v3.0</span>
        </div>
      </nav>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-[1540px]">
          <section hidden={view !== "overview"}>
            {visited.has("overview") && (
              <OverviewView
                fleet={snapshot}
                connectionOffline={status === "offline"}
                summary={summary}
                profiles={profiles}
                receipts={receipts}
                loadErrors={loadErrors}
                onNavigate={navigate}
                onHost={setSelectedHost}
                onRefresh={refreshOverview}
              />
            )}
          </section>
          <section hidden={view !== "fleet"}>
          {visited.has("fleet") && <OmniRoutePanel active={view === "fleet"} />}
          {visited.has("fleet") &&
            (snapshot ? (
              <FleetView
                snapshot={snapshot}
                connectionOffline={status === "offline"}
                histories={histories}
                summary={summary}
                receipts={receipts}
                onSelectHost={setSelectedHost}
                onNavigate={navigate}
              />
            ) : status === "offline" ? (
              <FleetUnavailable onRetry={retryFleet} />
            ) : (
              <SkeletonFleet />
            ))}
          </section>
          <section hidden={view !== "profiles"}>
            {visited.has("profiles") && <ProfilesView active={view === "profiles"} initialFleet={profiles} onInventory={setProfiles} />}
          </section>
          <section hidden={view !== "workspace"}>
            {visited.has("workspace") && <WorkspaceView active={view === "workspace"} onRefresh={loadReceipts} />}
          </section>
          <section hidden={view !== "audit"}>
          {visited.has("audit") && (
            <ActivityView receipts={receipts} onRefresh={loadReceipts} />
          )}
          </section>
        </div>
      </main>

      {selected && (
        <HostDetail
          host={selected}
          receipts={receipts}
          onClose={() => setSelectedHost(null)}
          onReceiptsChanged={loadReceipts}
        />
      )}
    </div>
  );
}

function FleetUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-signal-crit/25 bg-signal-crit/5 p-6">
      <p className="eyebrow">Flotta</p>
      <h1 className="mt-2 text-xl font-semibold text-ink-100">Telemetria non raggiungibile</h1>
      <p role="status" className="mt-2 max-w-2xl text-sm leading-6 text-ink-400">
        Signal Deck non ha ancora ricevuto un campione né una risposta HTTP valida. Lo stato di alimentazione dei computer resta sconosciuto finché il control plane non risponde.
      </p>
      <button type="button" onClick={onRetry} className="button-secondary mt-4">
        Riprova connessione
      </button>
    </div>
  );
}

function SkeletonFleet() {
  return (
    <div className="space-y-5">
      <div className="grid overflow-hidden rounded-xl border border-ink-700 bg-ink-900/65 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-20 animate-pulse border-b border-ink-700 bg-ink-900/60 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
          />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-xl border border-ink-700 bg-ink-900/55">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-24 animate-pulse border-b border-ink-700 bg-ink-900/50 last:border-b-0"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border border-ink-700 bg-ink-900/55" />
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-400">
        <span className={`h-2 w-2 animate-pulse rounded-full ${SEVERITY_BG.unknown}`} />
        In attesa del primo campione dagli agenti…
      </p>
    </div>
  );
}
