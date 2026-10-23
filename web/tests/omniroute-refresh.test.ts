import assert from "node:assert/strict";
import test from "node:test";
import { createOmniRouteReader, isOmniRouteConverged } from "../src/components/omniroute-reader.ts";
import type { OmniRouteStatus } from "../src/lib/types.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function status(result: OmniRouteStatus["observation"]["result"]): OmniRouteStatus {
  return {
    policy: { available: true, source: "omniroute/fleet-default-models.json", sha256: "a".repeat(64) },
    observation: {
      source: "controlcenter fleet check", result, exit_code: result === "clean" ? 0 : 2,
      checked_at: "2026-10-23T08:50:00Z", scope_complete: true, policy_revision: "rev-1",
      items: [{ host: "minipc", component: "omniroute-core", result }],
    },
  };
}

test("returning to Flotta reads the canonical status again and hides the old green state", async () => {
  const pending = [deferred<OmniRouteStatus>(), deferred<OmniRouteStatus>()];
  const states: Array<{ loading: boolean; status: OmniRouteStatus | null; error: string | null }> = [];
  let calls = 0;
  const reader = createOmniRouteReader(() => pending[calls++].promise, (next) => states.push(next));
  reader.setActive(false);
  assert.equal(calls, 0);
  reader.setActive(true);
  assert.equal(calls, 1);
  pending[0].resolve(status("clean"));
  await pending[0].promise;
  await Promise.resolve();
  assert.equal(isOmniRouteConverged(states.at(-1)?.status ?? null), true);

  reader.setActive(false);
  reader.setActive(true);
  assert.equal(calls, 2, "a second activation must issue a fresh GET");
  assert.equal(states.at(-1)?.loading, true);
  assert.equal(states.at(-1)?.status, null, "old success must not appear during refetch");
  pending[1].resolve(status("changes"));
  await pending[1].promise;
  await Promise.resolve();
  assert.equal(states.at(-1)?.status?.observation.result, "changes");
  reader.dispose();
});

test("late responses after hiding or overlapping refreshes cannot overwrite current status", async () => {
  const pending = [deferred<OmniRouteStatus>(), deferred<OmniRouteStatus>(), deferred<OmniRouteStatus>()];
  const states: Array<{ loading: boolean; status: OmniRouteStatus | null; error: string | null }> = [];
  let calls = 0;
  const reader = createOmniRouteReader(() => pending[calls++].promise, (next) => states.push(next));
  reader.setActive(true);
  reader.setActive(false);
  reader.setActive(true);
  pending[0].resolve(status("clean"));
  await pending[0].promise;
  await Promise.resolve();
  assert.equal(states.at(-1)?.status, null, "hidden view's result must be ignored");
  reader.refresh();
  pending[1].reject(new Error("network failure from old request"));
  await pending[1].promise.catch(() => {});
  await Promise.resolve();
  assert.equal(states.at(-1)?.error, null, "stale rejection must be ignored");
  pending[2].resolve(status("changes"));
  await pending[2].promise;
  await Promise.resolve();
  assert.equal(states.at(-1)?.status?.observation.result, "changes");
  reader.dispose();
});

test("clean requires completed scope, exit 0 and valid observation timestamp", () => {
  assert.equal(isOmniRouteConverged(status("clean")), true);
  assert.equal(isOmniRouteConverged(status("changes")), false);
  assert.equal(isOmniRouteConverged({ ...status("clean"), policy: { ...status("clean").policy, available: false } }), false);
  assert.equal(isOmniRouteConverged({ ...status("clean"), policy: { ...status("clean").policy, sha256: undefined } }), false);
  assert.equal(isOmniRouteConverged({ ...status("clean"), policy: { ...status("clean").policy, sha256: "invalid" } }), false);
  assert.equal(isOmniRouteConverged({ ...status("clean"), observation: { ...status("clean").observation, scope_complete: false } }), false);
  assert.equal(isOmniRouteConverged({ ...status("clean"), observation: { ...status("clean").observation, exit_code: 2 } }), false);
  assert.equal(isOmniRouteConverged({ ...status("clean"), observation: { ...status("clean").observation, checked_at: null } }), false);
  assert.equal(isOmniRouteConverged({ ...status("clean"), observation: { ...status("clean").observation, items: [] } }), false);
});
