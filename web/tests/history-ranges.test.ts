import assert from "node:assert/strict";
import { HISTORY_RANGES } from "../src/lib/history-ranges.ts";

assert.deepEqual(HISTORY_RANGES.map((range) => range.minutes), [60, 360, 1440, 20160]);
assert.equal(HISTORY_RANGES.at(-1)?.label, "14 giorni");

// Esegue anche le regressioni TSX di Flotta/Panoramica/HostDetail con npm test.
import "./fleet-ui.test.mjs";
