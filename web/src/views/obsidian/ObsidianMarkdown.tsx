import { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkWikiLink from "remark-wiki-link";
import { resolveNoteTarget, splitFrontmatter, type IndexedNote } from "./model";

const NOTE_FRAGMENT = "#obsidian-note=";

export function ObsidianMarkdown({ content, sourcePath, indexed, allowedRoots, onSelect }: {
  content: string;
  sourcePath: string;
  indexed: IndexedNote[];
  allowedRoots: string[];
  onSelect: (path: string) => void;
}) {
  const { body, fields, raw } = useMemo(() => splitFrontmatter(content), [content]);
  const plugins = useMemo(() => [
    remarkGfm,
    [remarkWikiLink, {
      aliasDivider: "|",
      pageResolver: (name: string) => [name],
      hrefTemplate: (name: string) => `${NOTE_FRAGMENT}${encodeURIComponent(name)}`,
      wikiLinkClassName: "",
      newClassName: "",
    }],
  ] as const, []);

  return (
    <div className="space-y-5 text-sm leading-7 text-ink-200 sm:text-[15px]">
      {raw !== null && (
        <details className="rounded-lg border border-ink-700 bg-ink-950/65" open>
          <summary className="min-h-11 cursor-pointer px-4 py-2 text-xs font-semibold text-ink-200">Frontmatter · {fields.length} proprietà</summary>
          <div className="border-t border-ink-800 px-4 py-3">
            {fields.length > 0 && <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(90px,150px)_minmax(0,1fr)]">{fields.map(({ key, value }, index) => (
              <div key={`${key}-${index}`} className="contents"><dt className="break-all text-xs font-medium text-ink-400">{key}</dt><dd className="min-w-0 break-words text-xs text-ink-200">{value || "—"}</dd></div>
            ))}</dl>}
            <details className="mt-3"><summary className="cursor-pointer text-xs text-ink-400 underline underline-offset-2">Mostra YAML originale</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-ink-900 p-3 text-xs leading-5 text-ink-300">{raw}</pre></details>
          </div>
        </details>
      )}
      <div className="min-w-0 break-words [&_li]:my-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6">
        <Markdown skipHtml remarkPlugins={plugins as unknown as NonNullable<React.ComponentProps<typeof Markdown>["remarkPlugins"]>} components={{
          h1: ({ children }) => <h1 className="mb-4 mt-6 text-2xl font-bold leading-tight text-ink-100 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-6 border-b border-ink-800 pb-1 text-xl font-semibold text-ink-100">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 text-lg font-semibold text-ink-100">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-2 mt-4 font-semibold text-ink-100">{children}</h4>,
          p: ({ children }) => <p className="my-3">{children}</p>,
          blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-ink-500 pl-4 text-ink-300">{children}</blockquote>,
          hr: () => <hr className="my-6 border-ink-700" />,
          pre: ({ children }) => <pre className="my-4 max-w-full overflow-x-auto rounded-lg border border-ink-800 bg-ink-950 p-3 text-xs leading-6 text-ink-200">{children}</pre>,
          code: ({ children }) => <code className="rounded bg-ink-850 px-1 py-0.5 font-mono text-[0.9em]">{children}</code>,
          table: ({ children }) => <div className="my-4 max-w-full overflow-x-auto" role="region" aria-label="Tabella nella nota" tabIndex={0}><table className="w-full min-w-max border-collapse text-left text-xs">{children}</table></div>,
          th: ({ children }) => <th className="border border-ink-700 bg-ink-850 px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-ink-700 px-3 py-2">{children}</td>,
          img: ({ alt }) => <span className="rounded border border-ink-700 px-1.5 py-0.5 text-xs text-ink-400" role="note">Allegato non caricato{alt ? `: ${alt}` : ""}</span>,
          a: ({ href, children }) => {
            if (href?.startsWith(NOTE_FRAGMENT)) {
              let target = "";
              try { target = decodeURIComponent(href.slice(NOTE_FRAGMENT.length)); } catch { /* Bad fragment remains unresolved. */ }
              const path = resolveNoteTarget(target, sourcePath, indexed, allowedRoots);
              return path
                ? <button type="button" onClick={() => onSelect(path)} className="inline rounded text-ink-100 underline decoration-ink-400 underline-offset-2 hover:decoration-ink-100 focus-visible:outline-2 focus-visible:outline-ink-100">{children}</button>
                : <span title="Nota non presente nell'indice autorizzato o collegamento ambiguo" className="text-ink-400 underline decoration-dotted underline-offset-2">{children}</span>;
            }
            if (!href || !/^(https?:\/\/|mailto:)/i.test(href)) return <span className="text-ink-400">{children}</span>;
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-ink-100 underline underline-offset-2 hover:text-white">{children}</a>;
          },
        }}>{body}</Markdown>
      </div>
    </div>
  );
}
