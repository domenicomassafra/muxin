import assert from "node:assert/strict";
import test from "node:test";
import { actionDate, monthCells, romeToday } from "../src/views/notionDates.ts";
import type { WorkspaceNotionRow } from "../src/lib/types.ts";

const row = (value: unknown) => ({ properties: { "Do Date": value } }) as WorkspaceNotionRow;
test("Actions dates follow Rome midnight and preserve calendar-only dates", () => {
  assert.equal(romeToday(new Date("2026-10-23T22:30:00Z")), "2026-10-24");
  assert.equal(actionDate(row("2026-10-23")), "2026-10-23");
  assert.equal(actionDate(row("2026-10-23T22:30:00Z")), "2026-10-24");
  assert.equal(actionDate(row("2026-02-30")), null);
  assert.equal(actionDate(row(null)), null);
  assert.equal(actionDate(row({ start: "2026-10-23" })), null);
});
test("calendar starts on Monday and includes leap days without timezone drift", () => {
  assert.deepEqual(monthCells("2024-02").slice(0, 4), [null, null, null, "2024-02-01"]);
  assert.equal(monthCells("2024-02").at(-1), "2024-02-29");
  assert.equal(monthCells("2026-02").at(-1), "2026-02-28");
});
