import { useEffect, useMemo, useRef, useState } from "react";
import { relativeTime, sourceReason } from "../lib/format";
import type { WorkspaceSnapshot } from "../lib/types";
import { ObsidianMarkdown } from "./obsidian/ObsidianMarkdown";
import { inAllowedRoots, noteTree, silverBulletNoteUrl, type IndexedNote, type NoteFolder } from "./obsidian/model";

type Props = {
  snapshot: WorkspaceSnapshot;
  search: string;
  root: string;
  onSearch: (value: string) => void;
  onRoot: (value: string) => void;
  onSelect: (path: string) => void;
};
type Sort = "recent" | "title" | "path";

export function ObsidianWorkspace({ snapshot, search, root, onSearch, onRoot, onSelect }: Props) {
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState(search);
  const detailRef = useRef<HTMLElement>(null);
  const selected = snapshot.obsidian.selected;
  const selectedPath = selected?.path;
  const searching = Boolean(search.trim());

  useEffect(() => setQuery(search), [search]);
  useEffect(() => {
    if (query === search) return;
    const timeout = window.setTimeout(() => onSearch(query), 250);
    return () => window.clearTimeout(timeout);
  }, [query, search, onSearch]);
  useEffect(() => {
    if (selectedPath && window.matchMedia("(max-width: 1023px)").matches) {
      detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [selectedPath]);

  const notes = useMemo(() => {
    // `nodes` contains up to 180 indexed notes; `results` contains only 40 search matches.
    const candidates = searching ? snapshot.obsidian.results : snapshot.obsidian.nodes;
    const filtered = candidates.filter((note) => inAllowedRoots(note.path, snapshot.obsidian.allowlisted_roots) && (root === "all" || note.path.startsWith(`${root}/`)));
    return [...filtered].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "it");
      if (sort === "path") return a.path.localeCompare(b.path, "it");
      return b.modified - a.modified;
    });
  }, [root, searching, snapshot.obsidian.allowlisted_roots, snapshot.obsidian.nodes, snapshot.obsidian.results, sort]);
  const folders = useMemo(() => noteTree(notes), [notes]);
  const indexed = useMemo(() => {
    const all = snapshot.obsidian.nodes;
    return selected && !all.some((note) => note.path === selected.path) ? [...all, selected] : all;
  }, [selected, snapshot.obsidian.nodes]);
  const silverBulletUrl = selectedPath && silverBulletNoteUrl(selectedPath, snapshot.obsidian.allowlisted_roots);

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
      <section aria-label="Navigazione delle note Obsidian" className={`min-w-0 overflow-hidden rounded-xl border border-ink-700 bg-ink-900/60 ${selected ? "order-2 lg:order-1" : ""}`}>
        <div className="border-b border-ink-700 p-4">
          <h2 className="text-base font-semibold text-ink-100">Esplora il vault</h2>
          <p className="mt-2 text-xs leading-5 text-ink-400">Indice parziale: massimo 180 note recenti per filtro; ricerca massima 40 risultati, solo su titolo, percorso e metadati. Il corpo non è indicizzato.</p>
          <label htmlFor="obsidian-search" className="mt-4 block text-xs font-semibold text-ink-300">Cerca nelle note indicizzate</label>
          <form onSubmit={(event) => { event.preventDefault(); onSearch(query); }} role="search" className="mt-2 flex min-w-0 gap-2">
            <input id="obsidian-search" value={query} maxLength={120} onChange={(event) => setQuery(event.target.value)} placeholder="Titolo, percorso o metadati" className="min-h-11 min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-950 px-3 text-sm text-ink-100 placeholder:text-ink-400 focus-visible:outline-2 focus-visible:outline-ink-100" />
            <button type="submit" className="min-h-11 rounded-lg border border-ink-600 px-3 text-xs font-semibold text-ink-100 hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-ink-100">Cerca</button>
          </form>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <label className="min-w-0 text-xs text-ink-400">Cartella
              <select value={root} onChange={(event) => onRoot(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-ink-600 bg-ink-950 px-2 text-sm text-ink-100 focus-visible:outline-2 focus-visible:outline-ink-100">
                <option value="all">Tutte le cartelle</option>
                {snapshot.obsidian.allowlisted_roots.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
              </select>
            </label>
            <label className="min-w-0 text-xs text-ink-400">Ordine
              <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="mt-1 min-h-11 w-full rounded-lg border border-ink-600 bg-ink-950 px-2 text-sm text-ink-100 focus-visible:outline-2 focus-visible:outline-ink-100">
                <option value="recent">Recenti</option>
                <option value="title">Titolo A–Z</option>
                <option value="path">Percorso A–Z</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-ink-400" role="status">{notes.length} note mostrate{searching ? " (massimo 40 risultati)" : " (indice massimo 180)"}</p>
        </div>
        {!snapshot.obsidian.source.available ? (
          <p className="p-4 text-sm text-ink-400">{sourceReason(snapshot.obsidian.source.reason ?? "Vault non disponibile.")}</p>
        ) : folders.length ? (
          <nav aria-label="Albero delle note" className="max-h-[70vh] overflow-y-auto px-2 py-3">
            {folders.map((folder) => <Folder key={`${search}:${folder.path}`} folder={folder} depth={0} searching={searching} selectedPath={selectedPath} onSelect={onSelect} />)}
          </nav>
        ) : (
          <p className="p-4 text-sm text-ink-400">Nessuna nota nell'indice disponibile per questi filtri.</p>
        )}
      </section>
      <article ref={detailRef} aria-label="Lettura nota Obsidian" className={`min-w-0 rounded-xl border border-ink-700 bg-ink-900/60 p-4 sm:p-6 ${selected ? "order-1 lg:order-2" : ""}`}>
        {selected ? (
          <>
            <div className="border-b border-ink-700 pb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Nota canonica · sola lettura</p>
              <h2 className="mt-2 break-words text-xl font-semibold text-ink-100 sm:text-2xl">{selected.title}</h2>
              <p className="mt-2 break-all font-mono text-xs text-ink-400">{selected.path}</p>
              <p className="mt-2 text-xs text-ink-400">Modificata {relativeTime(selected.modified)} · {selected.size.toLocaleString("it-IT")} byte</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span role="note" className="inline-flex min-h-11 items-center rounded-lg border border-ink-700 px-3 text-xs text-ink-400" title="Nome del vault non attestato da un'autorità indipendente">Obsidian · apertura esterna non verificata</span>
                {silverBulletUrl && <a className="inline-flex min-h-11 items-center rounded-lg border border-ink-600 px-3 text-xs text-ink-100 hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-ink-100" href={silverBulletUrl}>Apri in SilverBullet ↗</a>}
              </div>
              <p className="mt-3 text-xs leading-5 text-ink-400">La modifica in Plancia richiede ancora un endpoint autorizzato del writer canonico con controllo versione e gestione dei conflitti.</p>
            </div>
            {selected.content_truncated && <p role="status" className="mt-4 rounded-lg border border-ink-600 p-3 text-xs text-ink-300">Anteprima troncata a 64 KiB: la nota potrebbe contenere altro testo.</p>}
            <div className="mt-6"><ObsidianMarkdown content={selected.content} sourcePath={selected.path} indexed={indexed} allowedRoots={snapshot.obsidian.allowlisted_roots} onSelect={onSelect} /></div>
            <div className="mt-8 grid gap-4 border-t border-ink-700 pt-4 sm:grid-cols-2">
              <LinkList label="Wikilink in uscita" items={selected.links.filter((link) => inAllowedRoots(link.path, snapshot.obsidian.allowlisted_roots))} onSelect={onSelect} />
              <LinkList label="Note che puntano qui" items={selected.backlinks.filter((link) => inAllowedRoots(link.path, snapshot.obsidian.allowlisted_roots))} onSelect={onSelect} />
            </div>
          </>
        ) : (
          <div className="py-8 text-center"><h2 className="text-lg font-semibold text-ink-100">Seleziona una nota</h2><p className="mt-2 text-sm text-ink-400">Scegli un file dall'albero per leggere Markdown e frontmatter dalla fonte canonica.</p></div>
        )}
      </article>
    </div>
  );
}

function Folder({ folder, depth, searching, selectedPath, onSelect }: {
  folder: NoteFolder;
  depth: number;
  searching: boolean;
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0 || searching);
  return <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} className="group/folder">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-ink-200 hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-ink-100" style={{ paddingLeft: `${8 + depth * 14}px` }}>
      <span aria-hidden="true" className="inline-block transition-transform group-open/folder:rotate-90">›</span>
      <span className="min-w-0 flex-1 break-words">{folder.name}</span>
      <span className="shrink-0 tabular-nums text-ink-400">{folder.count}</span>
    </summary>
    <div>
      {folder.notes.map((note) => <NoteButton key={note.path} note={note} depth={depth + 1} selected={note.path === selectedPath} onSelect={onSelect} />)}
      {folder.folders.map((nested) => <Folder key={nested.path} folder={nested} depth={depth + 1} searching={searching} selectedPath={selectedPath} onSelect={onSelect} />)}
    </div>
  </details>;
}

function NoteButton({ note, depth, selected, onSelect }: {
  note: IndexedNote;
  depth: number;
  selected: boolean;
  onSelect: (path: string) => void;
}) {
  return <button type="button" aria-current={selected ? "page" : undefined} onClick={() => onSelect(note.path)} className={`flex min-h-11 w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-ink-100 ${selected ? "bg-ink-700 font-semibold text-ink-100" : "text-ink-300 hover:bg-ink-800"}`} style={{ paddingLeft: `${8 + depth * 14}px` }}>
    <span aria-hidden="true" className="shrink-0">◇</span><span className="min-w-0 flex-1 break-words">{note.title}</span>
  </button>;
}

function LinkList({ label, items, onSelect }: {
  label: string;
  items: { title: string; path: string; open_uri: string }[];
  onSelect: (path: string) => void;
}) {
  return <section aria-label={label}><h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</h3>
    {items.length ? <ul className="mt-2 space-y-1">{items.map((item) => <li key={item.path}><button type="button" onClick={() => onSelect(item.path)} className="min-h-11 w-full rounded px-2 py-2 text-left text-sm text-ink-200 underline decoration-ink-600 underline-offset-2 hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-ink-100">{item.title}</button></li>)}</ul> : <p className="mt-2 text-xs text-ink-400">Nessuna nota nell'indice disponibile.</p>}
  </section>;
}
