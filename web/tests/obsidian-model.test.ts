import assert from "node:assert/strict";
import { test } from "node:test";
import { inAllowedRoots, noteTree, resolveNoteTarget, splitFrontmatter } from "../src/views/obsidian/model.ts";

const notes = [
  { path: "05-knowledge/Guides/Start.md", title: "Start", size: 42, modified: 1 },
  { path: "05-knowledge/Guides/Check.md", title: "Check", size: 12, modified: 2 },
  { path: "05-knowledge/Daily.md", title: "Daily", size: 12, modified: 3 },
  { path: "03-projects/Start.md", title: "Start", size: 33, modified: 4 },
];

test("tree preserves nested folders, counts, and bounded index order without duplicating notes", () => {
  const tree = noteTree(notes);
  assert.deepEqual(tree.map(({ name, count }) => [name, count]), [["03-projects", 1], ["05-knowledge", 3]]);
  assert.deepEqual(tree[1].folders[0].notes.map((note) => note.path), ["05-knowledge/Guides/Start.md", "05-knowledge/Guides/Check.md"]);
  assert.equal(tree[1].notes[0].path, "05-knowledge/Daily.md");
});

test("frontmatter appears separately and markdown remains intact", () => {
  const source = "---\r\ntitle: My note\r\ntags: [one, two]\r\n---\r\n\r\n# Hello\r\nworld";
  assert.deepEqual(splitFrontmatter(source), {
    raw: "title: My note\ntags: [one, two]",
    fields: [{ key: "title", value: "My note" }, { key: "tags", value: "[one, two]" }],
    body: "# Hello\nworld",
  });
  assert.equal(splitFrontmatter("---\nunterminated: yaml").body, "---\nunterminated: yaml");
});

test("wikilinks resolve known files, reject ambiguity and paths outside the index", () => {
  const indexed = notes.map(({ path }) => ({ path }));
  const roots = ["03-projects", "05-knowledge"];
  assert.equal(resolveNoteTarget("Guides/Start#Heading", "05-knowledge/Daily.md", indexed, roots), "05-knowledge/Guides/Start.md");
  assert.equal(resolveNoteTarget("Start", "05-knowledge/Daily.md", indexed, roots), null);
  assert.equal(resolveNoteTarget("Start", "03-projects/Home.md", indexed, roots), "03-projects/Start.md");
  assert.equal(resolveNoteTarget("../../private", "05-knowledge/Daily.md", indexed, roots), null);
  assert.equal(resolveNoteTarget("javascript:alert(1)", "05-knowledge/Daily.md", indexed, roots), null);
  assert.equal(resolveNoteTarget(".obsidian/secrets", "05-knowledge/Daily.md", indexed, roots), null);
  assert.equal(resolveNoteTarget("NoSuchNote", "05-knowledge/Daily.md", indexed, roots), null);
  assert.equal(resolveNoteTarget("03-projects/Start", "05-knowledge/Daily.md", indexed, ["05-knowledge"]), null);
  assert.equal(inAllowedRoots("05-knowledge/.obsidian/private.md", roots), false);
});
