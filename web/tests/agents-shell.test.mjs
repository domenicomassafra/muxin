import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Bundle real domain components without a browser session or backend.
const directory = mkdtempSync(join(process.cwd(), "node_modules/.agents-shell-test-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({
  entryPoints: ["src/views/AgentsSection.tsx", "src/views/RemoteDesktopView.tsx"],
  outdir: directory,
  outbase: "src",
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["react", "react-dom"],
  logLevel: "silent",
});
const { AgentsSection } = await import(pathToFileURL(join(directory, "views/AgentsSection.js")).href);
const { RemoteDesktopView } = await import(pathToFileURL(join(directory, "views/RemoteDesktopView.js")).href);

test("Agenti integra Hermes e i due selettori interni senza navigazione globale duplicata", () => {
  const html = renderToStaticMarkup(createElement(AgentsSection));
  assert.doesNotMatch(html, /<nav\b/);
  assert.match(html, /aria-label="Sezioni Agenti"/);
  assert.match(html, /aria-pressed="true"[^>]*>Sessioni<\/button>/);
  assert.match(html, /aria-pressed="false"[^>]*>Desktop<\/button>/);
  assert.match(html, /role="region" aria-label="Sessioni Agenti"/);
  assert.match(html, /Profili Signori e sessioni/);
  assert.match(html, /Verifica dell&#x27;adapter Hermes in corso/);
  assert.match(html, /href="\/agents"/, "Orca legacy remains a distinct same-origin link");
});

test("il caricamento Desktop resta prudente senza aprire una connessione", () => {
  const desktop = renderToStaticMarkup(createElement(RemoteDesktopView));
  assert.match(desktop, /Verifica del servizio remoto in corso/);
  assert.doesNotMatch(desktop, /<iframe|<video|<canvas/i);
});
