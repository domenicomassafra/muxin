import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;
let ObsidianMarkdown;
let ObsidianWorkspace;

const indexed = [
  { title: "Start", path: "05-knowledge/Guides/Start.md", modified: 2, size: 17, metadata: {}, open_uri: "obsidian://open?vault=Test&file=Start" },
  { title: "Daily", path: "05-knowledge/Daily.md", modified: 3, size: 22, metadata: {}, open_uri: "obsidian://open?vault=Test&file=Daily" },
];

before(async () => {
  vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  ({ ObsidianMarkdown } = await vite.ssrLoadModule("/src/views/obsidian/ObsidianMarkdown.tsx"));
  ({ ObsidianWorkspace } = await vite.ssrLoadModule("/src/views/WorkspaceObsidianView.tsx"));
});

after(async () => { await vite?.close(); });

test("vault Markdown renders headings, GFM and wikilinks while stripping dangerous HTML and remote media", () => {
  const content = [
    "---", "title: Test note", "tags: [foo, bar]", "---", "",
    "# Hello **world**", "", "| Colonna | Valore |", "| --- | --- |", "| A | B |", "",
    "[[Guides/Start|Guida]]", "", "[[../../private|segreto]]", "",
    "<script>alert('xss')</script>", "",
    "<img src=x onerror=alert(2)>", "", "![tracking](https://evil.example/pixel.gif)", "",
    "[javascript](javascript:alert(3))", "", "[safe](https://example.com)", "",
    "```md", "[[Guides/Start|non-link]]", "```",
  ].join("\n");
  const html = renderToStaticMarkup(React.createElement(ObsidianMarkdown, {
    content, sourcePath: "05-knowledge/Daily.md", indexed, allowedRoots: ["05-knowledge"], onSelect: () => {},
  }));
  assert.match(html, /<h1[^>]*>Hello <strong>world<\/strong><\/h1>/);
  assert.match(html, /<table/);
  assert.match(html, /<button[^>]*>Guida<\/button>/);
  assert.match(html, /<span[^>]*>segreto<\/span>/);
  assert.match(html, /Frontmatter/);
  assert.match(html, /title.*Test note/);
  assert.match(html, /Allegato non caricato: tracking/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<script|<img|onerror=|<iframe|href="javascript:|src="https:\/\/evil/i);
  assert.doesNotMatch(html, /<button[^>]*>non-link<\/button>/);
});

test("Obsidian tree navigates full bounded nodes even when results only include 40 matches", () => {
  const snapshot = {
    obsidian: {
      source: { available: true, reason: null },
      allowlisted_roots: ["05-knowledge"],
      nodes: indexed,
      results: [indexed[0]],
      selected: null,
    },
  };
  const html = renderToStaticMarkup(React.createElement(ObsidianWorkspace, {
    snapshot, search: "", root: "all", onSearch: () => {}, onRoot: () => {}, onSelect: () => {},
  }));
  assert.match(html, /05-knowledge/);
  assert.match(html, />Daily<\/span>/);
  assert.match(html, />Start<\/span>/);
  assert.match(html, /ricerca massima 40 risultati/);
  assert.match(html, /Seleziona una nota/);
});
