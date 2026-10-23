import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import Guacamole from "@pelotech/guacamole-common-js";
import { createServer } from "vite";

test("the viewer connects the real Guacamole tunnel with valid dimensions and subprotocol", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  const formerClient = Guacamole.Client;
  const previous = Object.fromEntries(["window", "location", "WebSocket", "ResizeObserver"].map(k => [k, globalThis[k]]));
  const sockets = [];
  const effects = [];
  const cleanups = [];
  const element = { clientWidth: 800, replaceChildren() {}, removeEventListener() {} };
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const formerDispatcher = internals.H;
  try {
    globalThis.location = { protocol: "https:", host: "fleet.example.test" };
    globalThis.window = { location, innerHeight: 900, setTimeout, clearTimeout, setInterval, clearInterval };
    globalThis.ResizeObserver = class { observe() {} disconnect() {} };
    globalThis.WebSocket = class {
      constructor(url, protocol) { sockets.push({ url, protocol }); }
      close() {}
      send() {}
    };
    // Keep the actual vendor tunnel, replacing only canvas rendering.
    Guacamole.Client = class {
      constructor(tunnel) { this.tunnel = tunnel; }
      getDisplay() { return { getElement: () => ({}), scale() {}, getWidth: () => 800 }; }
      connect(data) { this.tunnel.connect(data); }
      disconnect() { this.tunnel.disconnect(); }
    };
    const { GuacamoleSession } = await vite.ssrLoadModule("/src/views/GuacamoleSession.tsx");
    internals.H = {
      useRef: value => ({ current: value }),
      useState: value => [value, () => {}],
      useEffect: effect => effects.push(effect),
    };
    const tree = GuacamoleSession({ desktop: {
      id: "test", name: "Isolated", protocol: "vnc", state: "ready",
      capabilities: { view: true, input: false, clipboard: false },
    }, onDisconnect() {} });
    function mount(node) {
      if (Array.isArray(node)) return node.forEach(mount);
      if (!node?.props) return;
      if (node.props.ref) node.props.ref.current = element;
      mount(node.props.children);
    }
    mount(tree);
    for (const effect of effects) cleanups.push(effect());
    assert.equal(sockets.length, 1);
    const url = new URL(sockets[0].url);
    assert.equal(sockets[0].protocol, "guacamole");
    assert.equal(url.pathname, "/api/v1/desktops/test/tunnel");
    assert.deepEqual([...url.searchParams.keys()], ["width", "height"]);
    assert.equal(Number(url.searchParams.get("width")), 800);
    assert.equal(Number(url.searchParams.get("height")), 585);
  } finally {
    for (const cleanup of cleanups) cleanup?.();
    internals.H = formerDispatcher;
    Guacamole.Client = formerClient;
    Object.assign(globalThis, previous);
    await vite.close();
  }
});
