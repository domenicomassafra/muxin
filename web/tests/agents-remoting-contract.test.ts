import assert from "node:assert/strict";
import test from "node:test";
import {
  AdapterError,
  getHermesMessages,
  getHermesProfiles,
  getHermesSessions,
  getRemoteDesktops,
} from "../src/lib/agents-remoting.ts";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("Hermes inventory uses same-origin cookies and refuses non-native sources", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const read = await getHermesProfiles(async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response({
      source: "hermes-native",
      profiles: [{ id: "signor-coding", name: "Coding", host: "minipc", gateway: "running" }],
    });
  });
  assert.equal(calls[0].url, "/api/v1/hermes/profiles");
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.equal(calls[0].init.cache, "no-store");
  assert.deepEqual(read.profiles[0].capabilities, {
    readable: false, attachable: false, sendable: false,
  });
  await assert.rejects(getHermesProfiles(async () => response({
    source: "orca-history", profiles: [{ id: "hermes" }],
  })), (error: unknown) => error instanceof AdapterError && error.kind === "invalid_contract");
});

test("Hermes session readback uses bound IDs and never trusts permissive data", async () => {
  const urls: string[] = [];
  const get = async (url: RequestInfo | URL) => {
    urls.push(String(url));
    return response({
      source: "hermes-native", profile_id: "signor-coding",
      sessions: [{ id: "existing_1", updated_at: "2026-10-23T06:00:00Z" }],
    });
  };
  const sessions = await getHermesSessions("signor-coding", get);
  assert.equal(urls[0], "/api/v1/hermes/profiles/signor-coding/sessions?limit=20");
  assert.equal(sessions.sessions[0].id, "existing_1");
  await assert.rejects(getHermesSessions("../other", get), (error: unknown) =>
    error instanceof AdapterError && error.kind === "invalid_identifier");
  await assert.rejects(getHermesSessions("signor-coding", async () => response({
    source: "hermes-native", profile_id: "other", sessions: [],
  })), (error: unknown) => error instanceof AdapterError && error.kind === "invalid_contract");
});

test("Hermes messages must be redacted, belong to the same session and be bounded", async () => {
  const get = async () => response({
    source: "hermes-native", profile_id: "signor-coding", session_id: "existing_1",
    redacted: true, messages: [{ role: "assistant", text: "readback", timestamp: null }],
  });
  const messages = await getHermesMessages("signor-coding", "existing_1", get);
  assert.equal(messages.messages[0].text, "readback");
  await assert.rejects(getHermesMessages("signor-coding", "existing_1", async () => response({
    source: "hermes-native", profile_id: "signor-coding", session_id: "existing_1",
    redacted: false, messages: [{ role: "assistant", text: "unredacted" }],
  })), (error: unknown) => error instanceof AdapterError && error.kind === "invalid_contract");
  await assert.rejects(getHermesMessages("signor-coding", "existing_1", async () => response({
    source: "hermes-native", profile_id: "signor-coding", session_id: "from_other",
    redacted: true, messages: [],
  })), (error: unknown) => error instanceof AdapterError && error.kind === "invalid_contract");
});

test("The Guacamole WIP inventory can be displayed but never grants controls", async () => {
  const read = await getRemoteDesktops(async () => response({
    donor: "apache-guacamole-1.6.0",
    desktops: [{ id: "test-desktop", name: "Host autorizzato", protocol: "vnc" }],
  }));
  assert.equal(read.desktops[0].state, "unconfigured");
  assert.deepEqual(read.desktops[0].capabilities, {
    view: false, input: false, clipboard: false,
  });
});

test("Remote target requires explicit server ready status and explicit grants", async () => {
  const read = await getRemoteDesktops(async () => response({
    donor: "apache-guacamole-1.6.0", status: "ready",
    desktops: [{ id: "test-desktop", name: "Host", protocol: "rdp", state: "ready",
      capabilities: { view: true, input: false, clipboard: false } }],
  }));
  assert.equal(read.desktops[0].capabilities.view, true);
  assert.equal(read.desktops[0].capabilities.input, false);
  const noGrants = await getRemoteDesktops(async () => response({
    donor: "apache-guacamole-1.6.0", status: "ready",
    desktops: [{ id: "test", name: "Host", protocol: "vnc", state: "ready" }],
  }));
  assert.deepEqual(noGrants.desktops[0].capabilities, {
    view: false, input: false, clipboard: false,
  });
  const noView = await getRemoteDesktops(async () => response({
    donor: "apache-guacamole-1.6.0", status: "ready",
    desktops: [{ id: "test", name: "Host", protocol: "vnc", state: "ready",
      capabilities: { view: false, input: true, clipboard: true } }],
  }));
  assert.deepEqual(noView.desktops[0].capabilities, {
    view: false, input: false, clipboard: false,
  });
  await assert.rejects(getRemoteDesktops(async () => response({
    donor: "unknown-donor", status: "ready", desktops: [],
  })), (error: unknown) => error instanceof AdapterError && error.kind === "invalid_contract");
});

test("Oversized and duplicate server payloads are rejected in full", async () => {
  await assert.rejects(getHermesMessages("signor-coding", "existing_1", async () => response({
    source: "hermes-native", profile_id: "signor-coding", session_id: "existing_1",
    redacted: true, messages: [{ role: "assistant", text: "x".repeat(262_144) }],
  })), (error: unknown) => error instanceof AdapterError && error.kind === "invalid_contract");
  const profile = { id: "signor-coding", name: "Coding", host: "minipc" };
  await assert.rejects(getHermesProfiles(async () => response({
    source: "hermes-native", profiles: [profile, profile],
  })), (error: unknown) => error instanceof AdapterError && error.kind === "invalid_contract");
});

test("Missing, denied, unauthenticated and offline adapters remain distinct", async () => {
  for (const [status, kind] of [
    [404, "unavailable"], [401, "unauthenticated"], [403, "permission_denied"], [503, "offline"],
  ] as const) {
    await assert.rejects(getHermesProfiles(async () => response({}, status)),
      (error: unknown) => error instanceof AdapterError && error.kind === kind);
  }
  await assert.rejects(getRemoteDesktops(async () => { throw new TypeError("network down"); }),
    (error: unknown) => error instanceof AdapterError && error.kind === "offline");
});
