import assert from "node:assert/strict";
import test from "node:test";

import { receiptEvidence } from "../src/lib/format.ts";

test("receipt evidence exposes only bounded audit identifiers", () => {
  const evidence = receiptEvidence({
    id: "receipt-123",
    host_id: "control-plane",
    action: "notion-edit-apply",
    outcome: "rolled-back",
    detail: "preimage obsoleta: conflitto rilevato",
    started_at: 1,
    finished_at: 2,
    payload: {
      source_key: "actions",
      registry_id: "registry-apply",
      rollback_registry_id: "registry-rollback",
      receipt_sha: "a".repeat(64),
      packet_id: "packet-123",
      before: { "Daily Improvement": "journal privato" },
      after: { "Daily Improvement": "altro testo privato" },
      rollback_post_fetch: { body: "non mostrare" },
    },
  });

  assert.deepEqual(
    evidence.map((item) => item.label),
    ["Fonte", "Registry applicazione", "Registry ripristino", "Digest ricevuta", "Packet", "Verifica"],
  );
  assert.equal(evidence[0].value, "Notion · Actions");
  assert.equal(evidence.at(-1).value, "Conflitto o drift rilevato");
  assert.doesNotMatch(JSON.stringify(evidence), /journal privato|altro testo privato|non mostrare/);
});

test("generic receipts do not leak arbitrary payload fields", () => {
  const evidence = receiptEvidence({
    id: "receipt-456",
    host_id: "matebook",
    action: "restart-agent",
    outcome: "succeeded",
    detail: "completed",
    started_at: 1,
    finished_at: 2,
    payload: { command: "secret command", token: "secret token" },
  });

  assert.deepEqual(evidence, []);
});
