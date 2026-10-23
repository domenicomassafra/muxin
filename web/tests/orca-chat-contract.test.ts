import assert from "node:assert/strict";
import test from "node:test";
import {
  orcaScreen, orcaSearch, orcaSend, orcaTerminals,
  type OrcaRequester,
} from "../src/lib/orca-chat.ts";

const reply = (body: unknown): OrcaRequester => async <T>() => body as T;

test("Orca terminal inventory keeps the native handle and a server-controlled write grant", async () => {
  const called: string[] = [];
  const client: OrcaRequester = async <T>(path: string) => {
    called.push(path);
    return { donor: "orca", terminals: [
      { handle: "term_native-1", title: "Pi", agent: "pi", connected: false, writable: true },
    ] } as T;
  };
  const terminals = await orcaTerminals(client);
  assert.equal(called[0], "/api/v1/agents/terminals");
  assert.equal(terminals[0].writable, false);
  await assert.rejects(orcaTerminals(reply({ donor: "fake", terminals: [] })), /incompatibile/);
  await assert.rejects(orcaTerminals(reply({ donor: "orca", terminals: [
    { handle: "../escape", agent: "pi", title: "bad" },
  ] })), /Handle/);
});

test("Live readback refuses another terminal's screen and unbounded payloads", async () => {
  const valid = { handle: "term_a", source: "screen", text: "output incrementale" };
  assert.equal(await orcaScreen("term_a", reply(valid)), valid.text);
  await assert.rejects(orcaScreen("term_a", reply({ ...valid, handle: "term_b" })), /incompatibile/);
  await assert.rejects(orcaScreen("term_a", reply({ ...valid, text: "x".repeat(16_001) })), /non valido/);
  await assert.rejects(orcaScreen("../oops", reply(valid)), /Handle/);
});

test("Pi's native indexed session remains a search excerpt, not a fabricated transcript", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const client: OrcaRequester = async <T>(path, init) => {
    calls.push({ path, init });
    return {
      host: "minipc",
      hits: [{ agent: "pi", sessionId: "original-1", title: "Test",
        updatedAt: null, messageCount: 9, snippet: "Estratto autentico" }],
    } as T;
  };
  const hits = await orcaSearch("  git   ", client);
  assert.equal(hits[0].agent, "pi");
  assert.equal(hits[0].sessionId, "original-1");
  assert.equal(calls[0].path, "/api/v1/agents/search");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { query: "git", host: "minipc" });
  await assert.rejects(orcaSearch("x", client), /2–120/);
  await assert.rejects(orcaSearch("git", reply({ host: "other", hits: [] })), /incompatibili/);
});

test("Native send is a single, bounded operation, with no client-side retry", async () => {
  const calls: string[] = [];
  const client: OrcaRequester = async <T>(path, init) => {
    calls.push(path);
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { text: "ciao" });
    return { handle: "term_real", accepted: true, submissionObserved: false } as T;
  };
  assert.equal(await orcaSend("term_real", "ciao", client), false);
  assert.equal(calls.length, 1);
  await assert.rejects(orcaSend("term_real", "bad\u0000", client), /non valido/);
  await assert.rejects(orcaSend("term_real", "x".repeat(2001), client), /non valido/);
  assert.equal(calls.length, 1);
  await assert.rejects(orcaSend("term_real", "ciao", reply({ handle: "another", accepted: true })), /confermato/);
});
