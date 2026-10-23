import type { ProfileEntry } from "./types";

export interface ProfileInstance extends ProfileEntry {
  hostId: string;
  hostLabel: string;
  hostRuntime?: string;
}

export interface ProfileGroup {
  /** A stable identity key, never a display name. */
  key: string;
  browser: string;
  email: string;
  instances: ProfileInstance[];
  /** Email-backed browser identity. Missing-email profiles stay host-local. */
  isFleetIdentity: boolean;
}

export interface ProfileGroupFilters {
  browsers: string[];
  providers: string[];
  hosts: string[];
  categories: string[];
  query: string;
}

/**
 * Browser identity is host-local evidence. All four owner computers are
 * inventory surfaces; a host only becomes an operator target when the live
 * agent proves the exact profile directory/action preconditions.
 */
const PROFILE_BROWSER_HOST_IDS = new Set(["minipc", "mac-studio", "macbook-air", "matebook"]);

export function isProfileBrowserHost(hostId: string) {
  return PROFILE_BROWSER_HOST_IDS.has(hostId);
}

function instanceKey(instance: ProfileInstance) {
  return `instance:${instance.hostId}:${instance.profile_key}`;
}

function canonicalIdentityKey(instance: ProfileInstance) {
  if (!instance.email) return "";
  const browser = instance.browser.trim().toLowerCase();
  const email = instance.email.trim().toLowerCase();
  const expected = `${browser}:${email}`;
  // Current inventories provide this server-owned field. The fallback keeps a
  // still-cached response from an older release readable during a rolling
  // deploy, without ever using a directory or host in the fleet identity.
  const declared = instance.identity_key?.trim().toLowerCase() ?? "";
  return declared === expected ? declared : expected;
}

function isGmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain === "gmail.com" || domain === "googlemail.com";
}

export function profileCategory(instance: ProfileInstance) {
  const metadata = instance.category?.trim() ?? "";
  if (metadata) return metadata;
  const label = instance.label ?? "";
  return label.match(/^\s*(\[[^\]]+\])/u)?.[1] ?? "";
}

/**
 * Which browser hosts are valid "Computer" filter options.  An unreachable or
 * otherwise failed inventory contributes no profiles, so offering it as a
 * selectable filter can only ever produce a misleading empty result (the
 * "Nessun profilo corrisponde ai filtri" bug) while its real status is
 * already surfaced by the reachability banner.  Filters may only target hosts
 * that can actually match.
 */
export interface HostInventoryLike {
  host: { id: string; label?: string };
  online: boolean;
}

export function selectableHostFilters(hosts: HostInventoryLike[]) {
  return hosts
    .filter((inventory) => inventory.online && Boolean(inventory.host?.id))
    .map((inventory) => ({ value: inventory.host.id, label: inventory.host.label ?? inventory.host.id }));
}

/**
 * Truthful, transport-specific label for a failed profile inventory.  A real
 * remote-agent error (nonzero_exit / agent_failed) must never be conflated
 * with network unreachability, and an unknown code must never be claimed to be
 * a transient out-of-reach state.
 */
const UNAVAILABLE_REASONS: Record<string, string> = {
  timeout: "temporaneamente non raggiungibile",
  unreachable: "computer non raggiungibile",
  dns_failure: "nome host non risolvibile",
  transport: "connessione non disponibile",
  host_key: "connessione da verificare",
  missing_installation: "agente non installato",
  invalid_agent_response: "risposta non verificabile",
  nonzero_exit: "errore dell\u2019agente remoto",
  agent_failed: "errore dell\u2019agente remoto",
};

export function profileUnavailableReason(errorCode?: string): string {
  return UNAVAILABLE_REASONS[errorCode ?? ""] ?? "stato non disponibile";
}

export function matchesProfileFilters(instance: ProfileInstance, filters: ProfileGroupFilters) {
  if (filters.browsers.length > 0 && !filters.browsers.includes(instance.browser)) return false;
  if (filters.providers.length > 0) {
    const provider = !instance.email ? "no-email" : isGmail(instance.email) ? "gmail" : "other";
    if (!filters.providers.includes(provider)) return false;
  }
  if (filters.hosts.length > 0 && !filters.hosts.includes(instance.hostId)) return false;
  const category = profileCategory(instance) || "__none__";
  if (filters.categories.length > 0 && !filters.categories.includes(category)) return false;
  if (!filters.query) return true;
  return [instance.alias, instance.label, instance.email, instance.category, instance.hostLabel, instance.directory, instance.browser]
    .map((field) => (field ?? "").toString())
    .join(" ")
    .toLocaleLowerCase("it")
    .includes(filters.query);
}

/** A group matches only when one installation satisfies every selected filter. */
export function filterProfileGroups(groups: ProfileGroup[], filters: ProfileGroupFilters) {
  return groups.filter((group) => group.instances.some((instance) => matchesProfileFilters(instance, filters)));
}

/**
 * Collapse only unambiguous, account-backed browser identities.  Browser is
 * intentionally part of the key: Chrome and Edge maintain independent local
 * profile directories even when the signed-in email is the same.
 */
export function groupProfileInstances(instances: ProfileInstance[]): ProfileGroup[] {
  const candidates = new Map<string, ProfileInstance[]>();
  const groups: ProfileGroup[] = [];

  for (const instance of instances) {
    if (!instance.email) {
      groups.push({
        key: instanceKey(instance),
        browser: instance.browser,
        email: "",
        instances: [instance],
        isFleetIdentity: false,
      });
      continue;
    }
    const key = `identity:${canonicalIdentityKey(instance)}`;
    candidates.set(key, [...(candidates.get(key) ?? []), instance]);
  }

  for (const [key, candidatesForIdentity] of candidates) {
    groups.push({
      key,
      browser: candidatesForIdentity[0].browser,
      email: candidatesForIdentity[0].email,
      instances: [...candidatesForIdentity].sort(
        (left, right) =>
          left.hostLabel.localeCompare(right.hostLabel, "it") ||
          left.directory.localeCompare(right.directory, "it"),
      ),
      isFleetIdentity: true,
    });
  }

  return groups;
}
