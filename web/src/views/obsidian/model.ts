/** Small, read-only projections over the bounded Obsidian API index. */
export interface IndexedNote {
  title: string;
  path: string;
  modified: number;
  size: number;
}

export interface NoteFolder {
  name: string;
  path: string;
  count: number;
  folders: NoteFolder[];
  notes: IndexedNote[];
}

export function noteTree(notes: IndexedNote[]): NoteFolder[] {
  const roots: NoteFolder[] = [];
  const folders = new Map<string, NoteFolder>();
  for (const note of notes) {
    const parts = note.path.split("/");
    if (parts.length < 2 || parts.some((part) => !part || part === "." || part === "..")) continue;
    let siblings = roots;
    for (let index = 0; index < parts.length - 1; index++) {
      const path = parts.slice(0, index + 1).join("/");
      let folder = folders.get(path);
      if (!folder) {
        folder = { name: parts[index], path, count: 0, folders: [], notes: [] };
        folders.set(path, folder);
        siblings.push(folder);
      }
      folder.count++;
      siblings = folder.folders;
      if (index === parts.length - 2) folder.notes.push(note);
    }
  }
  const sort = (branches: NoteFolder[]) => {
    branches.sort((a, b) => a.name.localeCompare(b.name, "it"));
    branches.forEach((branch) => sort(branch.folders));
  };
  sort(roots);
  return roots;
}

export interface FrontmatterField { key: string; value: string }

export function inAllowedRoots(path: string, roots: string[]): boolean {
  return roots.some((root) => path.startsWith(`${root}/`))
    && path.endsWith(".md")
    && path.split("/").every((part) => part && part !== "." && part !== ".." && !part.startsWith("."));
}

/** Same-origin read-only sidecar route; intersect the server's roots with the UI policy. */
export function silverBulletNoteUrl(path: string, allowedRoots: string[]): string | null {
  const root = "05-knowledge";
  if (!allowedRoots.includes(root) || !inAllowedRoots(path, [root])) return null;
  const segments = path.slice(`${root}/`.length).replace(/\.md$/, "").split("/");
  return `/notes/${segments.map(encodeURIComponent).join("/")}`;
}

export function splitFrontmatter(content: string): { body: string; fields: FrontmatterField[]; raw: string | null } {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { body: content, fields: [], raw: null };
  const closing = normalized.slice(4).search(/^---\s*$|^\.\.\.\s*$/m);
  if (closing === -1) return { body: content, fields: [], raw: null };
  const frontmatterEnd = 4 + closing;
  const markerEnd = normalized.indexOf("\n", frontmatterEnd);
  const raw = normalized.slice(4, frontmatterEnd).trimEnd();
  const fields = raw.split("\n").flatMap((line) => {
    const match = /^([\w-]+):\s*(.*)$/.exec(line);
    return match ? [{ key: match[1], value: match[2].trim() }] : [];
  });
  const body = markerEnd === -1 ? "" : normalized.slice(markerEnd + 1).replace(/^\n/, "");
  return { body, fields, raw };
}

/** Resolve only unambiguous paths in the server's allowlisted, truncated index. */
export function resolveNoteTarget(
  target: string,
  sourcePath: string,
  indexed: Pick<IndexedNote, "path">[],
  allowedRoots: string[],
): string | null {
  const raw = target.split("#", 1)[0].trim().replace(/\.md$/i, "");
  if (!raw || raw.startsWith("/") || raw.includes("\\") || raw.includes(":") || raw.includes("?") || raw.includes("%")) return null;
  const parts = raw.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) return null;
  const targetPath = `${raw}.md`;
  const candidates = indexed.map((note) => note.path).filter((path) => inAllowedRoots(path, allowedRoots));
  // Explicit vault-relative paths always win over basename matching.
  if (candidates.includes(targetPath)) return targetPath;
  const directory = sourcePath.split("/").slice(0, -1).join("/");
  const local = `${directory}/${targetPath}`;
  if (candidates.includes(local)) return local;
  const matches = candidates.filter((path) => path === targetPath || path.endsWith(`/${targetPath}`));
  return matches.length === 1 ? matches[0] : null;
}
