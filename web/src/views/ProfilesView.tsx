import { useCallback, useEffect, useMemo, useState } from "react";
import appleIcon from "../assets/apple.svg";
import chromeIcon from "../assets/chrome.svg";
import edgeIcon from "../assets/edge.svg";
import ubuntuIcon from "../assets/ubuntu.svg";
import windowsIcon from "../assets/windows.svg";
import { api } from "../lib/api";
import {
  filterProfileGroups,
  groupProfileInstances,
  isProfileBrowserHost,
  matchesProfileFilters,
  profileCategory,
  profileUnavailableReason,
  selectableHostFilters,
  type ProfileGroup,
  type ProfileInstance,
} from "../lib/profile-groups";
import { DeviceImage } from "../components/DeviceImage";
import type { ProfileFleet } from "../lib/types";

type BrowserFilter = "chrome" | "edge";
type ProviderFilter = "gmail" | "other" | "no-email";
type ProfileSort = "name" | "host" | "browser" | "category";

type ProfileRow = ProfileInstance;

interface PendingDelete {
  group: ProfileGroup;
  targets: { host_id: string; host_label: string; browser: string; email: string; directory: string }[] | null;
  planFingerprint: string | null;
  previewError: string | null;
}

interface PendingEdit {
  row: ProfileRow;
}

interface PendingNameSync {
  target_count: number;
  plan_fingerprint: string;
  host_counts: Record<string, number>;
  browser_counts: Record<string, number>;
  unavailable_hosts: string[];
  targets: {
    host_id: string;
    host_label: string;
    browser: string;
    email: string;
    directory: string;
    label: string;
    desired_label: string;
  }[];
}

const CATEGORY_SUGGESTIONS = [
  "[A]",
  "[AICONIC]",
  "[INFLUENCER AI]",
  "[OLD PROJECT]",
  "[TEST]",
];

const HOST_ICON: Record<string, { brand: "ubuntu" | "apple" | "windows"; label: string }> = {
  minipc: { brand: "ubuntu", label: "Ubuntu" },
  "mac-studio": { brand: "apple", label: "Apple" },
  "macbook-air": { brand: "apple", label: "Apple" },
  matebook: { brand: "ubuntu", label: "Omarchy" },
};

const BROWSER_ICON: Record<string, { brand: "chrome" | "edge"; label: string }> = {
  chrome: { brand: "chrome", label: "Chrome" },
  edge: { brand: "edge", label: "Edge" },
};

interface MultiSelectOption {
  value: string;
  label: string;
}

function isGmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain === "gmail.com" || domain === "googlemail.com";
}

function displayName(row: ProfileRow) {
  return row.policy_label || row.label || (row.email ? "[TEST] " + row.email : row.directory);
}

function nameWithoutCategory(name: string) {
  return name.replace(/^\s*\[[^\]]+\]\s*/u, "");
}

function BrandMark({ brand }: { brand: "ubuntu" | "apple" | "windows" | "chrome" | "edge" }) {
  const src: Record<string, string> = {
    ubuntu: ubuntuIcon,
    apple: appleIcon,
    windows: windowsIcon,
    chrome: chromeIcon,
    edge: edgeIcon,
  };
  return (
    <img
      src={src[brand] ?? src.chrome}
      alt=""
      aria-hidden="true"
      className="h-full w-full object-contain"
      draggable={false}
    />
  );
}

function HostIcon({ hostId, runtime }: { hostId: string; runtime?: string }) {
  const icon = hostId === "matebook"
    ? runtime === "Omarchy"
      ? { brand: "ubuntu" as const, label: "Omarchy Linux" }
      : runtime === "Windows"
        ? { brand: "windows" as const, label: "Windows" }
        : HOST_ICON[hostId]
    : HOST_ICON[hostId];
  if (!icon) return null;
  return (
    <span aria-label={icon.label} title={icon.label} className="inline-flex h-5 w-5 shrink-0">
      <BrandMark brand={icon.brand} />
    </span>
  );
}

function HostDeviceMark({
  hostId,
  runtime,
  image,
}: {
  hostId: string;
  runtime?: string;
  image?: string | null;
}) {
  return (
    <DeviceImage
      image={image}
      className="h-full w-full object-contain"
      fallback={<HostIcon hostId={hostId} runtime={runtime} />}
    />
  );
}

function BrowserIcon({ browser }: { browser: string }) {
  const icon = BROWSER_ICON[browser];
  if (!icon) return null;
  return (
    <span
      aria-label={icon.label}
      title={icon.label}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
    >
      <BrandMark brand={icon.brand} />
    </span>
  );
}

function groupDisplayName(group: ProfileGroup) {
  return displayName(group.instances.find((instance) => instance.alias) ?? group.instances[0]);
}

function groupCategory(group: ProfileGroup) {
  return profileCategory(group.instances.find((instance) => instance.alias) ?? group.instances[0]);
}

function inventoryStatus(inventory: ProfileFleet["inventories"][number]) {
  if (inventory.online) return `${inventory.profiles.length} profili`;
  return profileUnavailableReason(inventory.error_code);
}

function freshnessLabel(fleet: ProfileFleet | null) {
  if (!fleet) return "";
  const timeStr = fleet.observed_at
    ? ` (${new Date(fleet.observed_at * 1000).toLocaleTimeString("it", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })})`
    : "";
  if (fleet.freshness === "cached") return `Dati recenti in cache${timeStr}`;
  if (fleet.freshness === "stale") return `Dati precedenti: aggiornamento non riuscito${timeStr}`;
  return `Inventario aggiornato ora${timeStr}`;
}

function deleteFailureLabel(errorCode?: string) {
  const reason: Record<string, string> = {
    browser_active: "chiudi Chrome o Edge e riprova",
    group_plan_changed: "l’inventario è cambiato: apri di nuovo l’eliminazione",
    safe_delete_agent_required: "l’agente del computer va aggiornato prima di eliminare",
    agent_delete_rejected: "l’agente ha rifiutato l’eliminazione in sicurezza",
    post_delete_still_present: "il profilo è ancora presente dopo il controllo",
    post_delete_unproven: "non è stato possibile verificare il risultato",
  };
  return reason[errorCode ?? ""] ?? "non completato";
}

export function ProfilesView({
  active = true,
  initialFleet = null,
  onInventory,
}: {
  active?: boolean;
  initialFleet?: ProfileFleet | null;
  onInventory?: (fleet: ProfileFleet) => void;
}) {
  const [fleet, setFleet] = useState<ProfileFleet | null>(initialFleet);
  const [loading, setLoading] = useState(!initialFleet);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [pendingNameSync, setPendingNameSync] = useState<PendingNameSync | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [browserFilters, setBrowserFilters] = useState<BrowserFilter[]>([]);
  const [providerFilters, setProviderFilters] = useState<ProviderFilter[]>([]);
  const [hostFilters, setHostFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<ProfileSort>("name");
  const [selectedInstances, setSelectedInstances] = useState<Record<string, string>>({});
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(
    null,
  );

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const nextFleet = await api.profiles(refresh);
      setFleet(nextFleet);
      onInventory?.(nextFleet);
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onInventory]);

  useEffect(() => {
    if (!active) return;
    if (!initialFleet) void load();
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void load(true);
      }
    }, 45_000);
    return () => window.clearInterval(interval);
  }, [active, initialFleet, load]);

  useEffect(() => {
    if (initialFleet) setFleet(initialFleet);
  }, [initialFleet]);

  const profileInventories = useMemo(
    () => (fleet?.inventories ?? []).filter((inventory) => isProfileBrowserHost(inventory.host.id)),
    [fleet],
  );

  const rows = useMemo<ProfileRow[]>(
    () =>
      profileInventories.flatMap((inventory) =>
        inventory.profiles.map((profile) => ({
          ...profile,
          alias: profile.alias ?? "",
          category: profile.category ?? "",
          hostId: inventory.host.id,
          hostLabel: inventory.host.label,
          hostRuntime: inventory.host.runtime,
        })),
      ),
    [profileInventories],
  );

  const groups = useMemo(() => groupProfileInstances(rows), [rows]);

  const categories = useMemo(
    () =>
      Array.from(new Set(rows.map(profileCategory).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right, "it"),
      ),
    [rows],
  );

  useEffect(() => {
    if (categoryFilters.some((category) => category !== "__none__" && !categories.includes(category))) {
      setCategoryFilters((current) =>
        current.filter((category) => category === "__none__" || categories.includes(category)),
      );
    }
  }, [categories, categoryFilters]);

  // A host filter can only match a reachable host that still contributes
  // profiles.  Drop selected hosts that became unusable mid-session so an
  // unreachable host can never silently leave the page on a misleading
  // "Nessun profilo corrisponde ai filtri" empty state.
  useEffect(() => {
    const selectableHosts = new Set(selectableHostFilters(profileInventories).map((option) => option.value));
    if (hostFilters.some((hostId) => !selectableHosts.has(hostId))) {
      setHostFilters((current) => current.filter((hostId) => selectableHosts.has(hostId)));
    }
  }, [hostFilters, profileInventories]);

  useEffect(() => {
    const validKeys = new Set(groups.map((group) => group.key));
    setSelectedGroupKeys((current) => {
      const next = new Set([...current].filter((key) => validKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [groups]);

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it");
    const filters = {
      browsers: browserFilters,
      providers: providerFilters,
      hosts: hostFilters,
      categories: categoryFilters,
      query: needle,
    };
    const filtered = filterProfileGroups(groups, filters);
    return filtered.sort((left, right) => {
      const leftRow = left.instances[0];
      const rightRow = right.instances[0];
      const values: Record<ProfileSort, [string, string]> = {
        name: [groupDisplayName(left), groupDisplayName(right)],
        host: [leftRow.hostLabel, rightRow.hostLabel],
        browser: [left.browser, right.browser],
        category: [groupCategory(left) || "~", groupCategory(right) || "~"],
      };
      const [leftValue, rightValue] = values[sort];
      return leftValue.localeCompare(rightValue, "it") || left.email.localeCompare(right.email, "it");
    });
  }, [browserFilters, categoryFilters, groups, hostFilters, providerFilters, query, sort]);

  const activeFilterCount =
    browserFilters.length +
    providerFilters.length +
    hostFilters.length +
    categoryFilters.length +
    Number(Boolean(query.trim()));

  const openProfile = async (row: ProfileRow) => {
    const key = `${row.hostId}:${row.profile_key}`;
    setBusyKey(key);
    setToast(null);
    try {
      const result = await api.openProfile(
        row.hostId,
        row.browser,
        row.email,
        row.directory,
      );
      setToast(
        result.ok
          ? { kind: "ok", text: `${displayName(row)} aperto su ${row.hostLabel}${result.receipt_id ? ` · ricevuta ${result.receipt_id}` : ""}.` }
          : {
              kind: "error",
              text: `Apertura fallita: ${result.error_code ?? "errore sconosciuto"}`,
            },
      );
    } catch (exc) {
      setToast({ kind: "error", text: (exc as Error).message });
    } finally {
      setBusyKey(null);
    }
  };

  const saveProfileName = async () => {
    if (!pendingEdit) return;
    const { row } = pendingEdit;
    if (!row.email) {
      setToast({ kind: "error", text: "Questo profilo non ha un account: non può ricevere un nome canonico." });
      return;
    }
    setBusyKey(`edit:${row.hostId}:${row.profile_key}`);
    setToast(null);
    try {
      const matchingGroup = groups.find(
        (g) => g.instances.some((inst) => inst.hostId === row.hostId && inst.profile_key === row.profile_key)
      );
      const targetHosts = matchingGroup
        ? [...new Set(matchingGroup.instances.map((i) => i.hostId))]
        : [row.hostId];

      const preview = await api.previewProfileRename(row.browser, row.email, categoryDraft, targetHosts);
      if (!preview.ok) {
        setToast({
          kind: "error",
          text: `Rinomina non avviata: ${preview.error_code ?? "errore preflight"}.`,
        });
        return;
      }

      const result = await api.renameProfile(
        row.browser,
        row.email,
        categoryDraft,
        targetHosts,
        preview.plan_fingerprint,
      );
      if (!result.ok) {
        setToast({
          kind: "error",
          text: `Rinomina non completata: ${result.error_code ?? "errore sconosciuto"}. Controlla la ricevuta prima di riprovare.`,
        });
        return;
      }
      setToast({
        kind: "ok",
        text: `Nome aggiornato in ${row.browser === "edge" ? "Edge" : "Chrome"} · ricevuta ${result.receipt_id}`,
      });
      setPendingEdit(null);
      api.invalidateProfiles();
      await load(true);
    } catch (exc) {
      setToast({ kind: "error", text: (exc as Error).message });
    } finally {
      setBusyKey(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { group } = pendingDelete;
    const single = group.instances[0];
    setBusyKey(`del:${group.key}`);
    setToast(null);
    try {
      const result = group.isFleetIdentity
        ? await api.deleteProfileGroup(
            group.browser,
            group.email,
            pendingDelete.planFingerprint ?? "",
          )
        : await api.deleteProfile(single.hostId, single.browser, single.email, single.directory);
      if (result.ok) {
        const verifiedHostCount = new Set(group.instances.map((instance) => instance.hostId)).size;
        const deletedCount = result.deleted_count ?? group.instances.length;
        setToast({
          kind: "ok",
          text:
            result.status === "already_absent"
              ? `Profilo già assente · ricevuta ${result.receipt_id}`
              : `${deletedCount} installazioni eliminate e verificate su ${verifiedHostCount} computer · ricevuta ${result.receipt_id}`,
        });
        setPendingDelete(null);
        api.invalidateProfiles();
        await load(true);
      } else {
        const hostResults = result.host_results
          ? Object.entries(result.host_results)
              .map(([hostId, hostResult]) => `${hostId}: ${hostResult.ok ? "completato" : deleteFailureLabel(hostResult.error_code)}`)
              .join(" · ")
          : "";
        setToast({
          kind: "error",
          text: `Eliminazione non completata: ${result.error_code ?? "errore sconosciuto"}${hostResults ? ` (${hostResults})` : ""}. Non ripetere senza verificare la ricevuta.`,
        });
      }
    } catch (exc) {
      setToast({ kind: "error", text: (exc as Error).message });
    } finally {
      setBusyKey(null);
    }
  };

  const beginNameSync = async () => {
    setBusyKey("name-sync-preview");
    setToast(null);
    try {
      const preview = await api.previewProfileNameSync();
      if (!preview.ok) {
        const conflictCount = preview.conflicts?.length ?? 0;
        setToast({
          kind: "error",
          text: `Allineamento bloccato: ${preview.error_code ?? "preflight non verificabile"}${conflictCount ? ` · ${conflictCount} conflitti da risolvere` : ""}.`,
        });
        return;
      }
      if (!preview.target_count) {
        setToast({
          kind: preview.unavailable_hosts?.length ? "warn" : "ok",
          text: preview.unavailable_hosts?.length
            ? `Tutti i computer raggiungibili sono già allineati. Non verificati: ${preview.unavailable_hosts.join(", ")}.`
            : "Tutti i nomi Chrome/Edge sono già allineati su tutta la flotta.",
        });
        api.invalidateProfiles();
        await load(true);
        return;
      }
      if (!preview.plan_fingerprint) {
        setToast({ kind: "error", text: "Il server non ha prodotto un piano verificabile." });
        return;
      }
      setPendingNameSync({
        target_count: preview.target_count,
        plan_fingerprint: preview.plan_fingerprint,
        host_counts: preview.host_counts ?? {},
        browser_counts: preview.browser_counts ?? {},
        unavailable_hosts: preview.unavailable_hosts ?? [],
        targets: preview.targets ?? [],
      });
    } catch (exc) {
      setToast({ kind: "error", text: (exc as Error).message });
    } finally {
      setBusyKey(null);
    }
  };

  const confirmNameSync = async () => {
    if (!pendingNameSync) return;
    setBusyKey("name-sync-apply");
    setToast(null);
    try {
      const result = await api.syncProfileNames(pendingNameSync.plan_fingerprint);
      if (!result.ok) {
        setToast({
          kind: "error",
          text: `Allineamento non completato: ${result.error_code ?? result.status}. La ricevuta ${result.receipt_id ?? ""} conserva l’esito.`,
        });
        return;
      }
      const offline = result.unavailable_hosts ?? [];
      setToast({
        kind: offline.length ? "warn" : "ok",
        text: offline.length
          ? `${result.renamed_count ?? 0} nomi aggiornati e verificati. Restano offline: ${offline.join(", ")} · ricevuta ${result.receipt_id}`
          : `${result.renamed_count ?? 0} nomi aggiornati e verificati su tutta la flotta · ricevuta ${result.receipt_id}`,
      });
      setPendingNameSync(null);
      api.invalidateProfiles();
      await load(true);
    } catch (exc) {
      setToast({ kind: "error", text: (exc as Error).message });
    } finally {
      setBusyKey(null);
    }
  };

  const beginDelete = async (group: ProfileGroup) => {
    const single = group.instances[0];
    if (!group.isFleetIdentity) {
      setPendingDelete({
        group,
        targets: [{
          host_id: single.hostId,
          host_label: single.hostLabel,
          browser: single.browser,
          email: single.email,
          directory: single.directory,
        }],
        planFingerprint: null,
        previewError: null,
      });
      setToast(null);
      return;
    }
    setPendingDelete({ group, targets: null, planFingerprint: null, previewError: null });
    setToast(null);
    try {
      const preview = await api.previewProfileGroupDelete(group.browser, group.email);
      setPendingDelete((current) =>
        current?.group.key === group.key
          ? {
              ...current,
              targets: preview.targets ?? [],
              planFingerprint: preview.plan_fingerprint ?? null,
              previewError: preview.ok ? null : preview.error_code ?? "preflight non verificabile",
            }
          : current,
      );
    } catch (exc) {
      setPendingDelete((current) =>
        current?.group.key === group.key
          ? { ...current, targets: [], planFingerprint: null, previewError: (exc as Error).message }
          : current,
      );
    }
  };

  const clearFilters = () => {
    setQuery("");
    setBrowserFilters([]);
    setProviderFilters([]);
    setHostFilters([]);
    setCategoryFilters([]);
  };

  const selectVisibleGroups = () =>
    setSelectedGroupKeys(new Set(filteredGroups.map((group) => group.key)));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">
            Profile Atlas
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-100">
            Account browser
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-300">
            Identità e installazioni Chrome/Edge sui quattro computer. I percorsi completi restano privati e le azioni non si allargano senza preflight.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void beginNameSync()}
            disabled={busyKey !== null || loading}
            className="min-h-11 rounded-lg bg-ink-100 px-4 text-sm font-semibold text-ink-950 transition-colors hover:bg-ink-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyKey === "name-sync-preview" ? "Verifica nomi…" : "Aggiorna nomi su tutti i computer"}
          </button>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading || busyKey !== null}
            className="min-h-11 rounded-lg border border-ink-600 bg-ink-850 px-4 text-sm font-medium text-ink-200 transition-colors hover:border-ink-500 hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Scansione…" : "Riscansiona flotta"}
          </button>
        </div>
      </header>

      {fleet && (
        <p
          role="status"
          className={`text-xs ${fleet.freshness === "stale" ? "text-signal-warn" : "text-ink-400"}`}
        >
          {freshnessLabel(fleet)}
        </p>
      )}

      {profileInventories.length > 0 && (
        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Copertura inventario browser">
          {profileInventories.map((inventory) => {
            const browsers = [...new Set(inventory.profiles.map((profile) => profile.browser))]
              .map((browser) => browser === "edge" ? "Edge" : "Chrome")
              .join(" · ");
            return (
              <div key={inventory.host.id} className="metric-card cursor-default hover:translate-y-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-800 p-1.5">
                      <HostDeviceMark
                        hostId={inventory.host.id}
                        runtime={inventory.host.runtime}
                        image={inventory.host.image}
                      />
                    </span>
                    <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-100">{inventory.host.label}</p>
                    <p className="mt-1 truncate text-[11px] text-ink-500">
                      {inventory.host.runtime || "runtime non dichiarato"}
                    </p>
                    </div>
                  </div>
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${inventory.online ? "bg-signal-ok" : "bg-signal-warn"}`} />
                </div>
                <p className="tnum mt-4 text-2xl font-semibold text-ink-100">
                  {inventory.online ? inventory.profiles.length : "—"}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  {inventory.online
                    ? `${inventory.profiles.length === 1 ? "profilo" : "profili"}${browsers ? ` · ${browsers}` : ""}`
                    : profileUnavailableReason(inventory.error_code)}
                </p>
              </div>
            );
          })}
        </section>
      )}

      <section
        className="overflow-hidden rounded-xl border border-ink-700 bg-ink-900/70"
        aria-label="Ricerca e filtri profili"
      >
        <div className="grid gap-3 border-b border-ink-700 p-3 lg:grid-cols-[minmax(280px,1fr)_auto]">
          <label className="relative block">
            <span className="sr-only">Cerca profili</span>
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca email, alias, categoria, host…"
              className="h-11 w-full rounded-lg border border-ink-600 bg-ink-950 pr-3 pl-10 text-sm text-ink-100 outline-none placeholder:text-ink-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

        </div>

        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          <FilterCheckboxMenu
            label="Computer"
            options={selectableHostFilters(profileInventories)}
            selected={hostFilters}
            onChange={setHostFilters}
          />

          <FilterCheckboxMenu
            label="Browser"
            options={[{ value: "chrome", label: "Chrome" }, { value: "edge", label: "Edge" }]}
            selected={browserFilters}
            onChange={(values) => setBrowserFilters(values as BrowserFilter[])}
          />

          <FilterCheckboxMenu
            label="Account"
            options={[
              { value: "gmail", label: "Gmail" },
              { value: "other", label: "Altri domini" },
              { value: "no-email", label: "Senza account" },
            ]}
            selected={providerFilters}
            onChange={(values) => setProviderFilters(values as ProviderFilter[])}
          />

          <FilterCheckboxMenu
            label="Categoria"
            options={[
              { value: "__none__", label: "Senza prefisso" },
              ...categories.map((category) => ({ value: category, label: category })),
            ]}
            selected={categoryFilters}
            onChange={setCategoryFilters}
          />

          <label className="flex items-center gap-2 text-xs text-ink-300">
            <span>Ordina</span>
            <select
              aria-label="Ordina profili browser"
              value={sort}
              onChange={(event) => setSort(event.target.value as ProfileSort)}
              className="h-11 rounded-lg border border-ink-600 bg-ink-950 px-3 text-xs text-ink-100 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="name">Nome A–Z</option>
              <option value="host">Computer A–Z</option>
              <option value="browser">Browser A–Z</option>
              <option value="category">Categoria A–Z</option>
            </select>
          </label>

          <span className="text-xs text-ink-400">
            <b className="tnum font-medium text-ink-200">{filteredGroups.length}</b> di{" "}
            <b className="tnum font-medium text-ink-200">{groups.length}</b> identità
            <span className="ml-1 text-ink-500">({rows.length} installazioni)</span>
          </span>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto min-h-11 rounded-lg px-3 text-xs font-medium text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Azzera filtri ({activeFilterCount})
            </button>
          )}
        </div>
      </section>

      {toast && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            toast.kind === "ok"
              ? "border-signal-ok/25 bg-signal-ok/8 text-signal-ok"
              : toast.kind === "warn"
                ? "border-signal-warn/25 bg-signal-warn/8 text-signal-warn"
                : "border-signal-crit/25 bg-signal-crit/8 text-signal-crit"
          }`}
        >
          {toast.text}
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-signal-crit/25 bg-signal-crit/8 p-4">
          <p className="text-sm font-medium text-signal-crit">Inventario non disponibile</p>
          <p className="mt-1 text-xs text-ink-300">{error}</p>
        </div>
      )}

      {profileInventories.some((inventory) => !inventory.online) && (
        <section
          className="flex flex-wrap gap-2 rounded-lg border border-signal-warn/25 bg-signal-warn/8 px-3 py-2"
          aria-label="Computer non raggiungibili"
        >
          {profileInventories.map((inventory) => (
            <span
              key={inventory.host.id}
              className={`text-xs ${
                inventory.online ? "text-ink-400" : "font-medium text-signal-warn"
              }`}
            >
              {inventory.host.label}{inventory.host.runtime ? ` · ${inventory.host.runtime}` : ""}: {inventoryStatus(inventory)}
            </span>
          ))}
        </section>
      )}

      {selectedGroupKeys.size > 0 && (
        <section
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/8 px-4 py-3"
          aria-label="Profili selezionati"
        >
          <p className="text-sm font-medium text-ink-100">
            {selectedGroupKeys.size} {selectedGroupKeys.size === 1 ? "profilo selezionato" : "profili selezionati"}
          </p>
          <div className="flex items-center gap-2">
            {selectedGroupKeys.size < filteredGroups.length && (
              <button
                type="button"
                onClick={selectVisibleGroups}
                className="min-h-11 rounded-lg px-3 text-xs font-medium text-ink-200 hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Seleziona risultati
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedGroupKeys(new Set())}
              className="min-h-11 rounded-lg px-3 text-xs font-medium text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Azzera selezione
            </button>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-ink-700 bg-ink-900/55">
        <div className="hidden grid-cols-[44px_minmax(280px,1.5fr)_minmax(150px,.7fr)_120px_230px] gap-4 border-b border-ink-700 bg-ink-900 px-4 py-2.5 text-[10px] font-semibold tracking-[0.12em] text-ink-400 uppercase lg:grid">
          <span aria-hidden="true" />
          <span>Profilo</span>
          <span>Computer</span>
          <span>Browser</span>
          <span className="text-right">Azioni</span>
        </div>

        {loading && !fleet && (
          <div className="space-y-1 p-2" aria-label="Inventario in caricamento">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="h-[68px] animate-pulse rounded-lg bg-ink-850/80"
              />
            ))}
          </div>
        )}

        {!loading && filteredGroups.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="text-base font-medium text-ink-200">
              {rows.length ? "Nessun profilo corrisponde ai filtri." : "Nessun profilo trovato."}
            </p>
            <p className="mt-1 text-sm text-ink-400">
              {rows.length
                ? "Modifica la ricerca o azzera i filtri."
                : "Riscansiona la flotta per aggiornare l’inventario."}
              {rows.length > 0 && profileInventories.some((inventory) => !inventory.online) && (
                <span className="mt-1 block">
                  I computer non raggiungibili non rientrano nei filtri: lo stato è mostrato qui sopra.
                </span>
              )}
            </p>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 min-h-11 rounded-lg bg-ink-700 px-4 text-sm font-medium text-ink-100 hover:bg-ink-600"
              >
                Azzera filtri
              </button>
            )}
          </div>
        )}

        <ul className="divide-y divide-ink-700/80">
          {filteredGroups.map((group) => {
            const actionInstances = group.instances.filter((instance) =>
              matchesProfileFilters(instance, {
                browsers: browserFilters,
                providers: providerFilters,
                hosts: hostFilters,
                categories: categoryFilters,
                query: query.trim().toLocaleLowerCase("it"),
              }),
            );
            const selectedKey = selectedInstances[group.key];
            const row = actionInstances.find(
              (instance) => `${instance.hostId}:${instance.profile_key}` === selectedKey,
            ) ?? actionInstances[0];
            const key = `${row.hostId}:${row.profile_key}`;
            const category = groupCategory(group);
            return (
              <li
                key={group.key}
                className="grid gap-3 px-4 py-3 transition-colors hover:bg-ink-850/70 lg:grid-cols-[44px_minmax(280px,1.5fr)_minmax(150px,.7fr)_120px_230px] lg:items-center lg:gap-4"
              >
                <label className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-ink-800 lg:self-start">
                  <span className="sr-only">Seleziona {groupDisplayName(group)}</span>
                  <input
                    type="checkbox"
                    checked={selectedGroupKeys.has(group.key)}
                    onChange={(event) =>
                      setSelectedGroupKeys((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(group.key);
                        else next.delete(group.key);
                        return next;
                      })
                    }
                    className="h-4 w-4 rounded border-ink-600 bg-ink-950 text-accent focus:ring-accent"
                  />
                </label>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    {category && (
                      <span className="shrink-0 rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-200">
                        {category}
                      </span>
                    )}
                    <p className="truncate text-sm font-medium text-ink-100">
                      {nameWithoutCategory(groupDisplayName(group))}
                    </p>
                    {isGmail(row.email) && (
                      <span className="shrink-0 rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-ink-200 uppercase">
                        Gmail
                      </span>
                    )}
                    {!row.email && (
                      <span className="shrink-0 rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-ink-300 uppercase">
                        Senza account
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-300">
                    {group.email || row.directory}
                  </p>
                  {row.email && row.name_policy_ok === false && (
                    <p className="mt-0.5 truncate text-[10px] text-ink-300">
                      Nome da riallineare alla policy
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 lg:block">
                  <span className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase lg:hidden">
                    Computer
                  </span>
                  <span className="flex flex-wrap justify-end gap-1.5 lg:justify-start">
                    {group.instances.map((instance) => {
                      const instKey = `${instance.hostId}:${instance.profile_key}`;
                      const isActive = actionInstances.length > 1
                        ? instKey === `${row.hostId}:${row.profile_key}`
                        : true;
                      return actionInstances.length > 1 ? (
                        <button
                          key={instKey}
                          type="button"
                          title={`${instance.hostLabel}${instance.hostRuntime ? ` · ${instance.hostRuntime}` : ""}`}
                          aria-label={`Seleziona ${instance.hostLabel}${instance.hostRuntime ? ` ${instance.hostRuntime}` : ""}`}
                          onClick={() => setSelectedInstances((current) => ({ ...current, [group.key]: instKey }))}
                          className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                            isActive
                              ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                              : "border-ink-600 bg-ink-800 hover:border-ink-500 hover:bg-ink-700"
                          }`}
                        >
                          <HostDeviceMark
                            hostId={instance.hostId}
                            runtime={instance.hostRuntime}
                            image={profileInventories.find((item) => item.host.id === instance.hostId)?.host.image}
                          />
                        </button>
                      ) : (
                        <span
                          key={instKey}
                          className="inline-flex items-center justify-center rounded-lg border border-ink-600 bg-ink-800 p-1.5"
                          title={`${instance.hostLabel}${instance.hostRuntime ? ` · ${instance.hostRuntime}` : ""} · ${instance.directory}`}
                        >
                          <HostDeviceMark
                            hostId={instance.hostId}
                            runtime={instance.hostRuntime}
                            image={profileInventories.find((item) => item.host.id === instance.hostId)?.host.image}
                          />
                        </span>
                      );
                    })}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 lg:block">
                  <span className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase lg:hidden">
                    Browser
                  </span>
                  <span
                    className="inline-flex items-center justify-center rounded-lg border border-ink-600 bg-ink-800 p-1.5"
                    title={row.browser === "edge" ? "Microsoft Edge" : "Google Chrome"}
                  >
                    <BrowserIcon browser={row.browser} />
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1.5 sm:flex-nowrap">

                  <button
                    type="button"
                    aria-label={`Apri ${displayName(row)} su ${row.hostLabel}`}
                    onClick={() => void openProfile(row)}
                    disabled={busyKey === key}
                    className="min-h-11 rounded-lg bg-ink-100 px-3 text-xs font-semibold text-ink-950 transition-colors hover:bg-ink-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyKey === key ? "Apro…" : "Apri"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Rinomina e categorizza ${displayName(row)} su ${row.hostLabel}`}
                    title="Imposta il prefisso e aggiorna il nome locale. Il browser può mostrare anche il nome dell'account sincronizzato."
                    onClick={() => {
                      setPendingEdit({ row });
                      setCategoryDraft(profileCategory(row) || "");
                      setToast(null);
                    }}
                    className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-medium text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4.5 w-4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    >
                      <path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" />
                      <path d="m14.5 6.5 3 3" />
                    </svg>
                    Modifica
                  </button>
                  <button
                    type="button"
                    aria-label={group.isFleetIdentity
                      ? `Elimina il profilo ${groupDisplayName(group)} da tutti i computer verificati`
                      : `Elimina il profilo ${groupDisplayName(group)} da ${row.hostLabel}`}
                    title={row.directory === "Default" || group.instances.some((instance) => instance.directory === "Default")
                      ? "Il profilo predefinito non è eliminabile"
                      : group.isFleetIdentity
                        ? "Elimina da tutte le installazioni verificate di questa identità"
                        : `Elimina solo l'installazione su ${row.hostLabel}`}
                    onClick={() => {
                      if (row.directory === "Default" || group.instances.some((instance) => instance.directory === "Default")) return;
                      void beginDelete(group);
                    }}
                    disabled={row.directory === "Default" || group.instances.some((instance) => instance.directory === "Default")}
                    className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-medium text-ink-400 transition-colors hover:bg-signal-crit/15 hover:text-signal-crit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-crit disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4.5 w-4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    >
                      <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                    </svg>
                    {group.isFleetIdentity ? "Elimina ovunque" : "Elimina"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {pendingEdit && (
        <ProfileEditDialog
          row={pendingEdit.row}
          category={categoryDraft}
          busy={busyKey !== null}
          onCategoryChange={setCategoryDraft}
          onCancel={() => setPendingEdit(null)}
          onSave={() => void saveProfileName()}
        />
      )}

      {pendingDelete && (
        <ProfileDeleteDialog
          group={pendingDelete.group}
          targets={pendingDelete.targets}
          planFingerprint={pendingDelete.planFingerprint}
          previewError={pendingDelete.previewError}
          busy={busyKey !== null}
          onCancel={() => setPendingDelete(null)}
          onDelete={() => void confirmDelete()}
        />
      )}

      {pendingNameSync && (
        <ProfileNameSyncDialog
          preview={pendingNameSync}
          busy={busyKey === "name-sync-apply"}
          onCancel={() => setPendingNameSync(null)}
          onApply={() => void confirmNameSync()}
        />
      )}
    </div>
  );
}

function FilterCheckboxMenu({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const selectedLabel =
    selected.length === 0
      ? "Tutti"
      : selected.length === 1
        ? options.find((option) => option.value === selected[0])?.label ?? "1 selezionato"
        : `${selected.length} selezionati`;
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );

  return (
    <details className="group relative">
      <summary
        aria-label={`${label}: ${selectedLabel}`}
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-ink-600 bg-ink-950 px-3 text-xs text-ink-200 marker:hidden hover:border-ink-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
      >
        <span className="font-medium">{label}</span>
        <span className="max-w-28 truncate text-ink-400">{selectedLabel}</span>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 text-ink-400">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </summary>
      <fieldset className="absolute z-20 mt-2 min-w-52 rounded-xl border border-ink-600 bg-ink-900 p-2 shadow-xl shadow-black/25 hidden group-open:block">
        <legend className="sr-only">Filtra per {label}</legend>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={selected.length === 0}
          className="flex min-h-11 w-full items-center rounded-lg px-2 text-left text-xs font-medium text-accent hover:bg-accent/10 disabled:cursor-default disabled:text-ink-500"
        >
          Tutti
        </button>
        <div className="my-1 border-t border-ink-700" />
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-ink-200 hover:bg-ink-800">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
              className="h-4 w-4 rounded border-ink-600 bg-ink-950 text-accent focus:ring-accent"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}

function ProfileEditDialog({
  row,
  category,
  busy,
  onCategoryChange,
  onCancel,
  onSave,
}: {
  row: ProfileRow;
  category: string;
  busy: boolean;
  onCategoryChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-edit-title"
    >
      <button
        type="button"
        aria-label="Annulla modifica"
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md rounded-xl border border-ink-600 bg-ink-900 p-6 shadow-2xl shadow-black/35">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
          Organizza profilo
        </p>
        <h2 id="profile-edit-title" className="mt-1 text-lg font-semibold text-ink-100">
          {row.email}
        </h2>
        <p className="mt-1 text-xs text-ink-400">
          {row.hostLabel} · {row.browser} · {row.directory}
        </p>

        <label className="mt-5 block text-xs font-medium text-ink-200">
          Categoria
          <input
            value={category}
            onChange={(event) => onCategoryChange(event.target.value)}
            maxLength={40}
            list="profile-category-suggestions"
            autoFocus
            placeholder="Es. [AICONIC]"
            className="mt-2 h-11 w-full rounded-lg border border-ink-600 bg-ink-950 px-3 text-sm text-ink-100 outline-none placeholder:text-ink-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <datalist id="profile-category-suggestions">
            {CATEGORY_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </label>

        <p className="mt-4 text-xs leading-relaxed text-ink-400">
          Il nome reale diventa <b>{category.trim() || "[CATEGORIA]"} {row.email}</b> su tutte
          le installazioni verificate di {row.browser === "edge" ? "Edge" : "Chrome"}. Chrome e Edge
          vengono chiusi solo durante l’aggiornamento, poi la flotta viene riletta.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg px-4 text-sm text-ink-300 hover:bg-ink-800"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="min-h-11 rounded-lg bg-ink-100 px-4 text-sm font-semibold text-ink-950 hover:bg-ink-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Aggiornamento…" : "Applica nome"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileNameSyncDialog({
  preview,
  busy,
  onCancel,
  onApply,
}: {
  preview: PendingNameSync;
  busy: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);

  const hostLabels = new Map(preview.targets.map((target) => [target.host_id, target.host_label]));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-name-sync-title"
    >
      <button
        type="button"
        aria-label="Annulla allineamento nomi"
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-lg rounded-xl border border-accent/35 bg-ink-900 p-6 shadow-2xl shadow-black/35">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
          Allineamento fleet
        </p>
        <h2 id="profile-name-sync-title" className="mt-1 text-lg font-semibold text-ink-100">
          Aggiorna {preview.target_count} nomi Chrome/Edge
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-300">
          Signal Deck applicherà lo stesso nome canonico <b>[TAG] email</b> a tutte le installazioni
          verificate. L’azione parte solo da questo pulsante: non esiste un processo periodico che chiude
          browser in background.
        </p>

        <ul className="mt-4 space-y-1 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs text-ink-300">
          {Object.entries(preview.host_counts).map(([hostId, count]) => (
            <li key={hostId} className="flex items-center justify-between gap-4">
              <span className="font-medium text-ink-100">{hostLabels.get(hostId) ?? hostId}</span>
              <span className="tnum">{count} {count === 1 ? "nome" : "nomi"}</span>
            </li>
          ))}
          <li className="mt-2 border-t border-ink-700 pt-2 text-ink-400">
            Chrome: {preview.browser_counts.chrome ?? 0} · Edge: {preview.browser_counts.edge ?? 0}
          </li>
        </ul>

        {preview.unavailable_hosts.length > 0 && (
          <p className="mt-3 rounded-lg border border-signal-warn/30 bg-signal-warn/8 px-3 py-2 text-xs text-signal-warn">
            Non raggiungibili adesso: {preview.unavailable_hosts.join(", ")}. Verranno lasciati invariati e
            il risultato resterà parziale finché non torneranno online.
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          Per scrivere in sicurezza i file profilo, Chrome/Edge vengono chiusi solo sui computer e per le
          famiglie browser che hanno davvero drift. Prima della scrittura vengono creati backup limitati;
          dopo l’aggiornamento Signal Deck rilegge la flotta e verifica ogni target.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-lg px-4 text-sm text-ink-300 hover:bg-ink-800 disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={busy}
            className="min-h-11 rounded-lg bg-ink-100 px-4 text-sm font-semibold text-ink-950 hover:bg-ink-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Aggiornamento…" : "Aggiorna tutto"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileDeleteDialog({
  group,
  targets,
  planFingerprint,
  previewError,
  busy,
  onCancel,
  onDelete,
}: {
  group: ProfileGroup;
  targets: { host_id: string; host_label: string; browser: string; email: string; directory: string }[] | null;
  planFingerprint: string | null;
  previewError: string | null;
  busy: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const confirmationTarget = group.email || group.instances[0].directory;
  const targetHostCount = new Set(
    (targets ?? group.instances).map((target) =>
      "host_id" in target ? target.host_id : target.hostId
    )
  ).size;
  const targetInstallCount = targets?.length ?? group.instances.length;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-delete-title"
    >
      <button
        type="button"
        aria-label="Annulla eliminazione"
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md rounded-xl border border-signal-crit/35 bg-ink-900 p-6 shadow-2xl shadow-black/35">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-signal-crit uppercase">
          Azione irreversibile
        </p>
        <h2 id="profile-delete-title" className="mt-1 text-lg font-semibold text-ink-100">
          Elimina definitivamente
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-300">
          Verranno rimosse solo le installazioni appena verificate del profilo <b>{confirmationTarget}</b>.
          Ogni host risolve il proprio percorso locale prima dell’eliminazione.
        </p>
        {targets === null ? (
          <p className="mt-3 text-xs text-ink-400">Verifico ora ogni computer e il percorso locale…</p>
        ) : previewError ? (
          <p className="mt-3 rounded-lg border border-signal-crit/30 bg-signal-crit/8 px-3 py-2 text-xs text-signal-crit">
            Preflight bloccato: {previewError}. Nessuna eliminazione è iniziata.
          </p>
        ) : (
          <ul className="mt-3 space-y-1 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs text-ink-300">
            {targets.map((target) => (
              <li key={`${target.host_id}:${target.browser}:${target.directory}`}>
                <b className="font-medium text-ink-100">{target.host_label}</b>
                {" · "}{target.browser} · {target.directory}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs leading-relaxed text-ink-400">
          Se uno dei computer non è raggiungibile, il percorso non è verificabile o il piano cambia,
          l’operazione si blocca prima di iniziare. Signal Deck prova a chiudere in sicurezza solo il browser coinvolto; un errore remoto durante
          l’esecuzione può lasciare un risultato parziale: la ricevuta indica esattamente quali host verificare.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg px-4 text-sm text-ink-300 hover:bg-ink-800"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={
              busy ||
                targets === null ||
                (group.isFleetIdentity && !planFingerprint) ||
                Boolean(previewError)
            }
            onClick={onDelete}
            className="min-h-11 rounded-lg bg-signal-crit px-4 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy
              ? "Eliminazione…"
              : `Elimina ${targetInstallCount} ${targetInstallCount === 1 ? "installazione" : "installazioni"} su ${targetHostCount} ${targetHostCount === 1 ? "computer" : "computer"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
