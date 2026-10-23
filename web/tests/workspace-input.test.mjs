import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let vite;
let NotionTypedInput;
let createNotionPreviewGate;
let NotionEditPanel;
let createNotionPanelIdentity;

before(async () => {
  vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  ({ NotionTypedInput } = await vite.ssrLoadModule("/src/components/NotionTypedInput.tsx"));
  ({ createNotionPreviewGate } = await vite.ssrLoadModule("/src/views/notionPreviewGate.ts"));
  ({ NotionEditPanel } = await vite.ssrLoadModule("/src/views/NotionEditPanel.tsx"));
  ({ createNotionPanelIdentity } = await vite.ssrLoadModule("/src/views/notionPanelIdentity.ts"));
});

after(async () => {
  if (vite) await vite.close();
});

test("Notion multi_select shows existing tags and sends typed arrays for each toggle", () => {
  const changes = [];
  const column = { id: "tags", name: "Tags", type: "multi_select", options: ["Urgent", "Later"], editable: true };
  const fieldset = NotionTypedInput({ column, value: ["Urgent", "Legacy"], onChange: (value) => changes.push(value) });
  assert.equal(fieldset.type, "fieldset");

  const labels = fieldset.props.children[0];
  const inputs = Object.fromEntries(labels.map((label) => [label.props.children[1].props.children, label.props.children[0]]));
  assert.deepEqual(Object.keys(inputs), ["Urgent", "Later", "Legacy"]);
  assert.equal(inputs.Urgent.props.checked, true);
  assert.equal(inputs.Later.props.checked, false);
  assert.equal(inputs.Legacy.props.checked, true);

  inputs.Later.props.onChange({ target: { checked: true } });
  inputs.Urgent.props.onChange({ target: { checked: false } });
  assert.deepEqual(changes, [["Urgent", "Legacy", "Later"], ["Legacy"]]);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function packet(rowId, changes) {
  return { row_id: rowId, changes, packet_id: `${rowId}-packet`, apply_allowed: true };
}

test("late preview A cannot replace B or send A to canonical apply", async () => {
  const gate = createNotionPreviewGate();
  const a = deferred();
  const b = deferred();
  const accepted = [];
  const errors = [];
  const onReady = (value) => accepted.push(value);
  const onError = (message) => errors.push(message);
  const first = gate.preview({ rowId: "A", changes: { Status: "Doing" }, fetchPacket: () => a.promise, onReady, onError });
  gate.invalidate(); // The user selects row B before A responds.
  const second = gate.preview({ rowId: "B", changes: { Status: "Done" }, fetchPacket: () => b.promise, onReady, onError });
  const bPacket = packet("B", { Status: "Done" });
  b.resolve(bPacket);
  await second;
  a.resolve(packet("A", { Status: "Doing" }));
  await first;

  assert.deepEqual(accepted, [bPacket]);
  assert.deepEqual(errors, []);
  const sent = [];
  await assert.rejects(gate.apply(packet("A", { Status: "Doing" }), "APPLICA", async (value) => { sent.push(value); }), /scaduta/i);
  await gate.apply(bPacket, "APPLICA", async (value) => { sent.push(value); });
  assert.deepEqual(sent, [bPacket]);
});

test("changing draft or refreshing invalidates pending and accepted previews", async () => {
  const gate = createNotionPreviewGate();
  const pending = deferred();
  const accepted = [];
  const onReady = (value) => accepted.push(value);
  const onError = () => assert.fail("A stale preview must be silent");
  const task = gate.preview({ rowId: "A", changes: { Priority: "High" }, fetchPacket: () => pending.promise, onReady, onError });
  gate.invalidate(); // Draft edited while the preview is still pending.
  pending.resolve(packet("A", { Priority: "High" }));
  await task;
  assert.deepEqual(accepted, []);

  const current = packet("A", { Priority: "Low" });
  await gate.preview({ rowId: "A", changes: { Priority: "Low" }, fetchPacket: async () => current, onReady, onError });
  assert.equal(gate.isCurrent(current), true);
  gate.invalidate(); // Refresh begins before apply.
  assert.equal(gate.isCurrent(current), false);
  await assert.rejects(gate.apply(current, "APPLICA", async () => assert.fail("Stale apply")), /scaduta/i);
});

test("reject mismatched server preview row or edits and stale errors", async () => {
  const gate = createNotionPreviewGate();
  const accepted = [];
  const errors = [];
  const props = { rowId: "B", changes: { Status: "Done" }, onReady: (value) => accepted.push(value), onError: (message) => errors.push(message) };
  await gate.preview({ ...props, fetchPacket: async () => packet("A", props.changes) });
  await gate.preview({ ...props, fetchPacket: async () => packet("B", { Status: "Doing" }) });
  assert.deepEqual(accepted, []);
  assert.equal(errors.length, 2);
  await assert.rejects(gate.apply(packet("A", props.changes), "APPLICA", async () => {}), /scaduta/i);

  const stale = deferred();
  const task = gate.preview({ ...props, fetchPacket: () => stale.promise });
  gate.invalidate();
  stale.reject(new Error("errore da A"));
  await task;
  assert.equal(errors.length, 2);
});

test("Notion editor exposes all editable properties, before/after values and only the matching packet", () => {
  const schema = Array.from({ length: 10 }, (_, index) => ({
    id: `property-${index}`, name: `Property ${index}`, type: "rich_text", options: [], editable: true,
  }));
  const row = { id: "row-b", title: "Action B", url: null, properties: { "Property 9": "before" } };
  const current = { ...packet("row-b", { "Property 9": "after" }), before: { "Property 9": "before" }, preimage_hash: "digest", receipt_id: "receipt" };
  const props = {
    row, schema, draft: { "Property 9": "after" }, packet: current,
    onDraft: () => {}, onPreview: () => {}, onApply: async () => {}, onApplied: () => {},
    onRolledBack: () => {}, onReplayRolledBack: () => {}, isPacketCurrent: (value) => value === current,
  };
  const html = renderToStaticMarkup(createElement(NotionEditPanel, props));
  assert.match(html, /Property 9/);
  assert.match(html, /Prima: before/);
  assert.match(html, /Dopo: after/);
  assert.match(html, /10 proprietà editabili/);
  assert.match(html, /Salva su Notion/);

  const stale = renderToStaticMarkup(createElement(NotionEditPanel, { ...props, packet: packet("row-a", { "Property 9": "wrong" }) }));
  assert.doesNotMatch(stale, /Salva su Notion/);
});

test("apply of A resolving after selecting and previewing B never contaminates B or enables rollback B", async () => {
  const gate = createNotionPreviewGate();
  const lifecycle = createNotionPanelIdentity();
  const patchA = packet("A", { Status: "Doing" });
  const patchB = { ...packet("B", { Status: "Done" }), before: { Status: "Doing" }, preimage_hash: "digest-B", receipt_id: "preview-B" };
  const preview = (p) => gate.preview({ rowId: p.row_id, changes: p.changes, fetchPacket: async () => p, onReady: () => {}, onError: assert.fail });
  await preview(patchA);
  lifecycle.sync("A", patchA);
  const delayed = deferred();
  const applied = gate.apply(patchA, "APPLICA", () => delayed.promise);
  lifecycle.sync("B", null); // row changes while canonical writer works
  gate.invalidate();
  await preview(patchB);
  lifecycle.sync("B", patchB);
  delayed.resolve({ status: "applied", row: { id: "A" }, receipt_id: "receipt-A" });
  const result = await applied;
  assert.equal(lifecycle.matchesApply("A", patchA), false);
  assert.equal(lifecycle.matchesApply("B", patchB), true);
  assert.equal(gate.isCurrent(patchB), true);
  assert.equal(gate.isCurrent(patchA), false);
  assert.equal(result.receipt_id, "receipt-A");

  const base = { row: { id: "B", title: "B", properties: {}, url: null }, schema: [], draft: {}, packet: patchB,
    onDraft: () => {}, onPreview: () => {}, onApply: async () => {}, onApplied: () => {}, onRolledBack: () => {},
    onReplayRolledBack: () => {}, isPacketCurrent: (p) => p === patchB };
  const html = renderToStaticMarkup(createElement(NotionEditPanel, { ...base, applied: { packet: patchA, receiptId: result.receipt_id } }));
  assert.doesNotMatch(html, /Ripristina modifica|receipt-A/);
});

test("successful apply permanently consumes packet across editor remount while rollback uses its own packet", async () => {
  const gate = createNotionPreviewGate();
  const saved = packet("A", { Status: "Done" });
  await gate.preview({ rowId: "A", changes: saved.changes, fetchPacket: async () => saved, onReady: () => {}, onError: assert.fail });
  const writer = [];
  const receipt = await gate.apply(saved, "APPLICA", async (p) => { writer.push(p); return { status: "applied", receipt_id: "r1" }; });
  assert.equal(gate.isCurrent(saved), false);
  await assert.rejects(gate.apply(saved, "APPLICA", async (p) => writer.push(p)), /scaduta|consumat/i);
  assert.deepEqual(writer, [saved]);
  const repeatPreviewErrors = [];
  await gate.preview({ rowId: "A", changes: saved.changes, fetchPacket: async () => ({ ...saved }), onReady: () => assert.fail("Duplicate logical packet accepted"), onError: (message) => repeatPreviewErrors.push(message) });
  assert.equal(repeatPreviewErrors.length, 1);
  const base = { row: { id: "A", title: "A", properties: {}, url: null }, schema: [], draft: {}, packet: saved,
    onDraft: () => {}, onPreview: () => {}, onApply: async () => {}, onApplied: () => {}, onRolledBack: () => {},
    onReplayRolledBack: () => {}, isPacketCurrent: (p) => gate.isCurrent(p),
    applied: { packet: saved, receiptId: receipt.receipt_id } };
  // Stateless remount represents leaving and returning to the Notion tab.
  const remounted = renderToStaticMarkup(createElement(NotionEditPanel, base));
  assert.doesNotMatch(remounted, /Salva su Notion/);
  assert.match(remounted, /Ripristina modifica/);
  assert.match(remounted, /r1/);
  const wrongRow = renderToStaticMarkup(createElement(NotionEditPanel, { ...base, row: { ...base.row, id: "B" } }));
  assert.doesNotMatch(wrongRow, /Ripristina modifica/);
});

// A tiny synchronous hook harness runs the actual NotionEditPanel function and
// its event handlers (not just static SSR markup), with zero DOM/test dependencies.
function hookPanelHarness(Component) {
  const hooks = [];
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  let index = 0;
  let effects = [];
  let changed = false;
  const dispatcher = {
    useState(initial) {
      const slot = index++;
      if (!Object.hasOwn(hooks, slot)) hooks[slot] = typeof initial === "function" ? initial() : initial;
      return [hooks[slot], (value) => {
        const next = typeof value === "function" ? value(hooks[slot]) : value;
        if (!Object.is(next, hooks[slot])) { hooks[slot] = next; changed = true; }
      }];
    },
    useRef(initial) {
      const slot = index++;
      return hooks[slot] ??= { current: initial };
    },
    useEffect(effect, deps) {
      const slot = index++;
      const previous = hooks[slot];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          hooks[slot] = { deps, cleanup: effect() };
        });
      }
    },
  };
  return {
    render(props) {
      let tree;
      for (let attempt = 0; attempt < 5; attempt++) {
        index = 0;
        effects = [];
        changed = false;
        const former = internals.H;
        internals.H = dispatcher;
        try { tree = Component(props); } finally { internals.H = former; }
        for (const run of effects) run();
        if (!changed) return tree;
      }
      assert.fail("Hook effects did not stabilize");
    },
  };
}

function findElement(tree, tag, matches = () => true) {
  if (Array.isArray(tree)) return tree.map((child) => findElement(child, tag, matches)).find(Boolean);
  if (!tree || typeof tree !== "object" || !tree.props) return null;
  if (tree.type === tag && matches(tree)) return tree;
  return findElement(tree.props.children, tag, matches);
}

test("same-row preview P2 is savable while P1 apply is in-flight; P1 finally cannot clear P2 pending", async () => {
  const view = hookPanelHarness(NotionEditPanel);
  const row = { id: "A", title: "Action A", properties: { Status: "Todo" }, url: null };
  const makePreview = (packetId, status) => ({
    ...packet("A", { Status: status }), packet_id: packetId,
    before: { Status: "Todo" }, preimage_hash: `hash-${packetId}`, receipt_id: `preview-${packetId}`,
  });
  const p1 = makePreview("P1", "Doing");
  const p2 = makePreview("P2", "Done");
  const remote1 = deferred();
  const remote2 = deferred();
  const writes = [];
  const receipts = [];
  const props = { row, schema: [], draft: {}, packet: p1, applied: null,
    onDraft: () => {}, onPreview: () => {}, isPacketCurrent: () => true,
    onApply: (submitted) => { writes.push(submitted); return submitted === p1 ? remote1.promise : remote2.promise; },
    onApplied: (result, submitted) => receipts.push([submitted, result.receipt_id]),
    onRolledBack: () => {}, onReplayRolledBack: () => {},
  };
  const render = () => view.render(props);
  const applyButton = () => findElement(render(), "button", (el) => el.props.children === "Salva su Notion" || el.props.children === "Salvataggio…");
  function confirmAndSave() {
    const input = findElement(render(), "input");
    assert.ok(input, "Confirmation input exists for preview");
    input.props.onChange({ target: { value: "APPLICA" } });
    const save = applyButton();
    assert.equal(save.props.disabled, false, `Packet ${props.packet.packet_id} should be savable`);
    save.props.onClick();
  }

  confirmAndSave(); // P1 starts, remains pending at the canonical writer.
  assert.equal(applyButton().props.children, "Salvataggio…");
  props.packet = p2; // Same row, no component remount: draft changed and preview P2 arrived.
  confirmAndSave(); // P2 must be separately usable, not blocked by P1's boolean flag.
  assert.deepEqual(writes, [p1, p2]);
  assert.equal(applyButton().props.children, "Salvataggio…");

  remote1.resolve({ status: "applied", row, registry_id: "registry-P1", receipt_id: "receipt-P1" });
  await remote1.promise;
  await new Promise((resolve) => setImmediate(resolve)); // settle P1 .then/.finally
  assert.deepEqual(receipts, [[p1, "receipt-P1"]]);
  assert.equal(applyButton().props.children, "Salvataggio…", "P1 finally must not clear P2 pending state");
  assert.doesNotMatch(renderToStaticMarkup(render()), /receipt-P1/);

  remote2.resolve({ status: "applied", row, registry_id: "registry-P2", receipt_id: "receipt-P2" });
  await remote2.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(receipts, [[p1, "receipt-P1"], [p2, "receipt-P2"]]);
  assert.equal(applyButton().props.children, "Salva su Notion", "P2 pending clears when P2 settles");
});
