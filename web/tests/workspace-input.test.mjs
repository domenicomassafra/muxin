import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
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
