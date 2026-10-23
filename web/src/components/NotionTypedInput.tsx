import type { WorkspaceNotionColumn } from "../lib/types";

export function NotionTypedInput({ column, value, onChange }: {
  column: WorkspaceNotionColumn;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (column.type === "multi_select") {
    const selected = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
    // Keep existing values even when the source schema contains only a bounded
    // subset of the choices. Unchecking must be an explicit action.
    const options = [...new Set([...column.options, ...selected])];
    return (
      <fieldset aria-label={column.name} className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 p-2">
        {options.map((option) => (
          <label key={option} className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 text-xs text-ink-200 hover:bg-ink-850">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={(event) => onChange(event.target.checked
                ? [...selected, option]
                : selected.filter((item) => item !== option))}
              className="h-4 w-4 shrink-0 accent-accent"
            />
            <span className="break-words">{option}</span>
          </label>
        ))}
        {!options.length && <p className="px-2 py-1 text-xs text-ink-500">Nessuna opzione disponibile</p>}
      </fieldset>
    );
  }
  if (column.type === "checkbox") {
    return <input aria-label={column.name} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="mt-2 h-4 w-4 accent-accent" />;
  }
  if (column.type === "select" || column.type === "status") {
    return <select aria-label={column.name} value={String(value ?? "")} onChange={(event) => onChange(event.target.value || null)} className="min-h-11 w-full rounded-lg border border-ink-700 bg-ink-950 px-2 text-xs text-ink-100 focus-visible:outline-2 focus-visible:outline-accent"><option value="">Vuoto</option>{column.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  }
  return <input aria-label={column.name} type={column.type === "number" ? "number" : column.type === "date" ? "date" : "text"} value={String(value ?? "")} onChange={(event) => onChange(column.type === "number" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value)} className="min-h-11 w-full rounded-lg border border-ink-700 bg-ink-950 px-2 text-xs text-ink-100 focus-visible:outline-2 focus-visible:outline-accent" />;
}
