import { useEffect, useMemo, useRef, useState } from "react";
import { relativeTime, sourceReason } from "../lib/format";
import type { WorkspaceSnapshot } from "../lib/types";

export function ObsidianWorkspace({ snapshot, search, root, onSearch, onRoot, onSelect }: { snapshot: WorkspaceSnapshot; search: string; root: string; onSearch: (value: string) => void; onRoot: (value: string) => void; onSelect: (path: string) => void }) {
  const [sort, setSort] = useState<"recent" | "title" | "path">("recent");
  const detailRef = useRef<HTMLElement>(null);
  const selectedPath = snapshot.obsidian.selected?.path;
  useEffect(() => {
    if (selectedPath && window.matchMedia("(max-width: 1279px)").matches) {
      detailRef.current?.scrollIntoView({ block: "start" });
    }
  }, [selectedPath]);
  const silverBulletUrl = selectedPath?.startsWith("05-knowledge/")
    ? `/notes/${selectedPath.slice("05-knowledge/".length).replace(/\.md$/, "").split("/").map(encodeURIComponent).join("/")}`
    : null;
  const notes = useMemo(() => {
    const filtered = snapshot.obsidian.results.filter((note) => root === "all" || note.path.startsWith(`${root}/`));
    return [...filtered].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "it");
      if (sort === "path") return a.path.localeCompare(b.path, "it");
      return b.modified - a.modified;
    });
  }, [root, snapshot.obsidian.results, sort]);
  const folders = useMemo(() => {
    const grouped = new Map<string, typeof notes>();
    notes.forEach((note) => {
      const folder = note.path.split("/").slice(0, -1).join("/") || "Root";
      grouped.set(folder, [...(grouped.get(folder) ?? []), note]);
    });
    return [...grouped.entries()];
  }, [notes]);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className={`min-w-0 overflow-hidden rounded-xl border border-ink-800 bg-ink-900/45 ${selectedPath ? "order-2 xl:order-1" : ""}`}>
        <div className="border-b border-ink-800 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold text-ink-100">Esplora Obsidian</h2><a href={silverBulletUrl ?? "/notes"} className="text-xs text-accent underline underline-offset-4">SilverBullet · 05-knowledge ↗</a></div>
          <p className="mt-1 text-xs text-ink-400">Indice limitato e anteprima testuale in sola lettura. Solo la nota selezionata viene letta.</p>
          <input aria-label="Cerca note Obsidian" value={search} onChange={(event) => onSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSearch(event.currentTarget.value); }} placeholder="Cerca per titolo, path o metadata" className="mt-3 min-h-11 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-ink-100 placeholder:text-ink-600 focus-visible:outline-2 focus-visible:outline-accent" />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select aria-label="Filtra cartella Obsidian" value={root} onChange={(event) => onRoot(event.target.value)} className="min-h-11 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-ink-100 focus-visible:outline-2 focus-visible:outline-accent">
              <option value="all">Tutte le cartelle</option>
              {snapshot.obsidian.allowlisted_roots.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
            </select>
            <select aria-label="Ordina note Obsidian" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="min-h-11 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-ink-100 focus-visible:outline-2 focus-visible:outline-accent">
              <option value="recent">Modificate di recente</option>
              <option value="title">Titolo A–Z</option>
              <option value="path">Cartella e nome</option>
            </select>
          </div>
        </div>
        {!snapshot.obsidian.source.available ? <p className="p-4 text-sm text-ink-400">{sourceReason(snapshot.obsidian.source.reason ?? "Vault non disponibile.")}</p> : notes.length ? <div className="divide-y divide-ink-800">{folders.map(([folder, folderNotes]) => <details key={folder} open={Boolean(search.trim())} className="group/folder"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 bg-ink-850 px-4 text-xs font-medium text-ink-300 hover:bg-ink-800"><span className="transition-transform group-open/folder:rotate-90">›</span><span>▢</span><span className="truncate">{folder}</span><span className="ml-auto tnum text-ink-500">{folderNotes.length}</span></summary><div className="divide-y divide-ink-850">{folderNotes.map((note) => <button key={note.path} type="button" onClick={() => onSelect(note.path)} className="flex min-h-14 w-full items-center gap-3 px-4 pl-8 text-left hover:bg-ink-850 focus-visible:outline-2 focus-visible:outline-accent"><span className="text-accent">⌁</span><span className="min-w-0 flex-1"><span className="block truncate text-sm text-ink-200">{note.title}</span><span className="block truncate text-[11px] text-ink-500">{note.path}</span></span><span className="shrink-0 text-[11px] text-ink-500">{relativeTime(note.modified)}</span></button>)}</div></details>)}</div> : <p className="p-5 text-sm text-ink-400">Nessuna nota corrisponde ai filtri.</p>}
      </section>
      <aside ref={detailRef} className={`min-w-0 rounded-xl border border-ink-800 bg-ink-900/45 p-4 ${selectedPath ? "order-1 xl:order-2" : ""}`}>
        <p className="text-[10px] font-semibold tracking-[0.14em] text-ink-500 uppercase">Allowlist</p>
        <p className="mt-2 text-xs leading-5 text-ink-400">{snapshot.obsidian.allowlisted_roots.join(" · ")}</p>
        {snapshot.obsidian.selected && <><div className="mt-5 border-t border-ink-800 pt-4"><p className="text-[10px] font-semibold tracking-[0.12em] text-ink-500 uppercase">Puntatore canonico</p><h3 className="mt-2 text-sm font-semibold text-ink-100">{snapshot.obsidian.selected.title}</h3><p className="mt-1 break-words text-[11px] text-ink-500">{snapshot.obsidian.selected.path}</p><div className="mt-3 rounded-lg border border-ink-700 bg-ink-950 p-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Nota · sola lettura</p><pre className="max-h-[50vh] w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-ink-200">{snapshot.obsidian.selected.content}</pre>{snapshot.obsidian.selected.content_truncated && <p className="mt-2 text-xs text-ink-400">Anteprima limitata a 64 KiB.</p>}</div><a className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-ink-100 px-3 text-xs font-semibold text-ink-950 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-accent" href={snapshot.obsidian.selected.open_uri}>Apri in Obsidian ↗</a></div><LinkList label="Puntatori in uscita" items={snapshot.obsidian.selected.links} onSelect={onSelect} /><LinkList label="Note che puntano qui" items={snapshot.obsidian.selected.backlinks} onSelect={onSelect} /></>}
      </aside>
    </div>
  );
}

function LinkList({ label, items, onSelect }: { label: string; items: { title: string; path: string; open_uri: string }[]; onSelect: (path: string) => void }) {
  return <div className="mt-4 border-t border-ink-800 pt-3"><p className="text-[10px] font-semibold tracking-[0.12em] text-ink-500 uppercase">{label}</p>{items.length ? <ul className="mt-2 space-y-1">{items.map((item) => <li key={item.path}><button type="button" onClick={() => onSelect(item.path)} className="min-h-11 w-full truncate rounded px-2 text-left text-xs text-accent hover:bg-ink-850 hover:underline focus-visible:outline-2 focus-visible:outline-accent" title={`${item.title} · ${item.path}`}>{item.title} →</button></li>)}</ul> : <p className="mt-2 text-xs text-ink-500">Nessuno</p>}</div>;
}
