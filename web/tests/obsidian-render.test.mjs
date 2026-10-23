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

test("Obsidian desktop deep links fail closed until canonical vault identity is attested", () => {
  const snapshot = {
    obsidian: {
      source: { available: true, reason: null },
      allowlisted_roots: ["05-knowledge"],
      nodes: indexed,
      results: indexed,
      selected: {
        ...indexed[1],
        content: "# Safe note",
        content_truncated: false,
        links: [], backlinks: [],
        open_uri: "obsidian://open?vault=Test&file=00-system%2FSecret.md",
      },
    },
  };
  const render = () => renderToStaticMarkup(React.createElement(ObsidianWorkspace, {
    snapshot, search: "", root: "all", onSearch: () => {}, onRoot: () => {}, onSelect: () => {},
  }));
  assert.doesNotMatch(render(), /href="obsidian:\/\/open\?/);
  snapshot.obsidian.selected.open_uri = "obsidian://open?vault=Test&file=05-knowledge%2FDaily.md";
  assert.doesNotMatch(render(), /href="obsidian:\/\/open\?/);
  snapshot.obsidian.source.vault = "Test";
  assert.doesNotMatch(render(), /href="obsidian:\/\/open\?/);
  snapshot.obsidian.selected.open_uri = "obsidian://open?vault=Unrelated&file=05-knowledge%2FDaily.md";
  assert.doesNotMatch(render(), /href="obsidian:\/\/open\?/);
  snapshot.obsidian.selected.open_uri += "&file=00-system%2FSecret.md";
  assert.doesNotMatch(render(), /href="obsidian:\/\/open\?/);
  snapshot.obsidian.selected.open_uri = "obsidian://open?vault=Test&file=05-knowledge%2FDaily.md&intent=edit";
  assert.doesNotMatch(render(), /href="obsidian:\/\/open\?/);
  snapshot.obsidian.selected.open_uri = "obsidian://open?vault=Test&file=05-knowledge%2FDaily.md#forged";
  assert.doesNotMatch(render(), /href="obsidian:\/\/open\?/);
  snapshot.obsidian.selected.path = "00-system/Secret.md";
  snapshot.obsidian.selected.open_uri = "obsidian://open?vault=Test&file=00-system%2FSecret.md";
  assert.doesNotMatch(render(), /href="obsidian:\/\/open\?/);
});

test("SilverBullet link requires source allowlist in addition to local 05-knowledge policy", () => {
  const snapshot = { obsidian: {
    source: { available: true, reason: null, vault: "Untrusted" },
    allowlisted_roots: ["03-projects"], nodes: indexed, results: indexed,
    selected: { ...indexed[1], content: "# Test", content_truncated: false, links: [], backlinks: [], open_uri: "obsidian://open?vault=Untrusted&file=05-knowledge%2FDaily.md" },
  } };
  const render = () => renderToStaticMarkup(React.createElement(ObsidianWorkspace, {
    snapshot, search: "", root: "all", onSearch: () => {}, onRoot: () => {}, onSelect: () => {},
  }));
  assert.doesNotMatch(render(), /href="\/notes\//);
  snapshot.obsidian.allowlisted_roots = ["03-projects", "05-knowledge"];
  assert.match(render(), /href="\/notes\/Daily"/);
  snapshot.obsidian.selected.path = "05-knowledge/.obsidian/Secret.md";
  assert.doesNotMatch(render(), /href="\/notes\//);
});

test("Markdown never makes unsupported protocols or external embeds clickable/loadable", () => {
  const content = [
    "[javascript](javascript:alert(1))",
    "[data](data:text/html;base64,PHNjcmlwdD4=)",
    "[file](file:///private/secret)",
    "[ftp](ftp://example.test/file)",
    "[custom](obsidian://open?vault=Other&file=Secret.md)",
    "[protocol relative](//tracker.example.test/collect)",
    "[safe](https://example.test/path)",
    "[email](mailto:person@example.test)",
    "![local](file:///private/secret)",
    "![remote](https://tracker.example.test/pixel.png)",
    "<iframe src=\"https://tracker.example.test/\"></iframe>",
  ].join("\n\n");
  const html = renderToStaticMarkup(React.createElement(ObsidianMarkdown, {
    content, sourcePath: "05-knowledge/Daily.md", indexed, allowedRoots: ["05-knowledge"], onSelect: () => {},
  }));
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(links, ["https://example.test/path", "mailto:person@example.test"]);
  assert.doesNotMatch(html, /<(?:iframe|img|script|video|audio|object|embed)\b/i);
  assert.match(html, /Allegato non caricato: local/);
  assert.match(html, /Allegato non caricato: remote/);
});
