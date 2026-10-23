import assert from "node:assert/strict";
import test from "node:test";
import { isTerminalStreamError, subscribeFleet } from "../src/lib/api.ts";

test("non-retryable stream errors stop reconnect attempts", () => {
  assert.equal(isTerminalStreamError({ type: "error", retryable: false }), true);
  assert.equal(isTerminalStreamError({ type: "error", retryable: true }), false);
  assert.equal(isTerminalStreamError({ type: "snapshot" }), false);
});

test("a delivering HTTP polling fallback keeps a non-offline status after a failure", async () => {
  const scope = globalThis as Record<string, unknown>;
  const original = {
    window: scope.window,
    fetch: scope.fetch,
    WebSocket: scope.WebSocket,
  };

  const intervals: (() => void)[] = [];
  const sockets: { onclose?: () => void }[] = [];
  let fail = false;

  scope.window = {
    location: { protocol: "https:", host: "fleet.example.test" },
    setInterval: (handler: () => void) => {
      intervals.push(handler);
      return intervals.length;
    },
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  scope.fetch = async () => {
    if (fail) throw new Error("temporary network failure");
    return {
      ok: true,
      json: async () => ({ generated_at: 0, poll_interval_s: 5, hosts: [], fleet: {} }),
    };
  };
  scope.WebSocket = class {
    onclose?: () => void;
    constructor() {
      sockets.push(this);
    }
    close() {}
  };

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  try {
    const statuses: string[] = [];
    const unsubscribe = subscribeFleet(
      () => {},
      (status) => statuses.push(status),
    );

    sockets[0].onclose?.(); // WebSocket drops, HTTP fallback takes over.
    await settle();
    assert.equal(statuses.at(-1), "polling");

    fail = true;
    intervals[0](); // One poll tick fails.
    await settle();
    assert.equal(statuses.at(-1), "offline");

    fail = false;
    intervals[0](); // The next poll tick recovers with live data.
    await settle();
    assert.equal(statuses.at(-1), "polling");

    unsubscribe();
  } finally {
    scope.window = original.window;
    scope.fetch = original.fetch;
    scope.WebSocket = original.WebSocket;
  }
});
