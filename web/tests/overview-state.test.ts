import assert from "node:assert/strict";
import type { FleetSnapshot, HostView } from "../src/lib/types.ts";
import { overviewFleetStatus, overviewHostState, showCurrentMetrics } from "../src/lib/overview-state.ts";

function host(overrides: Partial<HostView> = {}): HostView {
  return {
    id: "studio",
    lifecycle: "managed",
    reachable: true,
    stale: false,
    sample: { sampled_at: "2026-10-22T08:00:00Z" } as HostView["sample"],
    health: { severity: "ok" } as HostView["health"],
    ...overrides,
  } as HostView;
}

function snapshot(hosts: HostView[]): FleetSnapshot {
  const managed = hosts.filter((item) => item.lifecycle === "managed");
  return {
    hosts,
    fleet: {
      total: hosts.length,
      managed_total: managed.length,
      pending: hosts.length - managed.length,
      reachable: managed.filter((item) => item.reachable && !item.stale).length,
      worst_severity: "ok",
    },
  } as FleetSnapshot;
}

assert.equal(overviewHostState(host(), false), "ok");
assert.equal(showCurrentMetrics(host(), false), true);
assert.equal(overviewHostState(host({ health: { severity: "unknown" } as HostView["health"] }), false), "unknown");
assert.equal(showCurrentMetrics(host({ health: { severity: "unknown" } as HostView["health"] }), false), true);

for (const [changed, expected] of [
  [{ lifecycle: "pending" }, "pending"],
  [{ stale: true }, "stale"],
  [{ reachable: false }, "unknown"],
  [{ sample: null }, "unknown"],
] as const) {
  const observed = host(changed as Partial<HostView>);
  assert.equal(overviewHostState(observed, false), expected);
  assert.equal(showCurrentMetrics(observed, false), false);
}

assert.equal(overviewHostState(host(), true), "stale");
assert.equal(showCurrentMetrics(host(), true), false);
assert.equal(overviewFleetStatus(snapshot([host()]), false), "ok");
assert.equal(overviewFleetStatus(snapshot([host(), host({ id: "windows", lifecycle: "pending" })]), false), "unknown");
assert.equal(overviewFleetStatus(snapshot([host({ stale: true })]), false), "unknown");
assert.equal(overviewFleetStatus(snapshot([host({ reachable: false })]), false), "unknown");
assert.equal(overviewFleetStatus(snapshot([host({ health: { severity: "crit" } as HostView["health"] })]), false), "crit");
assert.equal(overviewFleetStatus(snapshot([host()]), true), "unknown");
assert.equal(overviewFleetStatus(null, false), "unknown");
