import type { FleetSnapshot, HostView, Severity } from "./types";

export type OverviewHostState = Severity | "pending" | "stale";

/** Only a fresh sample from the selected runtime can certify host health. */
export function overviewHostState(host: HostView, connectionOffline: boolean): OverviewHostState {
  if (host.lifecycle === "pending") return "pending";
  if (connectionOffline || host.stale) return host.sample ? "stale" : "unknown";
  if (!host.reachable || !host.sample) return "unknown";
  return host.health.severity;
}

export function showCurrentMetrics(host: HostView, connectionOffline: boolean): boolean {
  return host.lifecycle === "managed" && !connectionOffline && !host.stale && host.reachable && !!host.sample;
}

export function overviewFleetStatus(fleet: FleetSnapshot | null, connectionOffline: boolean): Severity {
  if (connectionOffline || !fleet) return "unknown";
  const states = fleet.hosts.map((host) => overviewHostState(host, false));
  if (states.includes("crit")) return "crit";
  if (states.includes("warn")) return "warn";
  if (states.some((state) => state === "pending" || state === "stale" || state === "unknown")) return "unknown";
  if (fleet.fleet.managed_total === 0 || fleet.fleet.reachable !== fleet.fleet.managed_total) return "unknown";
  return fleet.fleet.worst_severity;
}
