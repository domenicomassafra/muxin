import type { WorkspaceNotionRow } from "../lib/types";
import { actionDate, monthCells, romeToday } from "./notionDates";

export function NotionCalendar({ rows, month, onMonth, onSelect }: { rows: WorkspaceNotionRow[]; month: string; onMonth: (month: string) => void; onSelect: (row: WorkspaceNotionRow) => void }) {
  const today = romeToday();
  const byDate = new Map<string, WorkspaceNotionRow[]>();
  let undated = 0;
  for (const row of rows) {
    const date = actionDate(row);
    if (date) byDate.set(date, [...(byDate.get(date) ?? []), row]);
    else undated++;
  }
  const label = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  function move(offset: number) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    onMonth(date.toISOString().slice(0, 7));
  }
  return <section aria-label="Calendario Actions" className="p-3">
    <div className="mb-3 flex items-center justify-between gap-2">
      <button type="button" aria-label="Mese precedente" onClick={() => move(-1)} className="min-h-11 rounded-lg border border-ink-700 px-3 text-sm text-ink-100">Precedente</button>
      <h3 className="text-center text-sm font-semibold capitalize text-ink-100">{label}</h3>
      <button type="button" aria-label="Mese successivo" onClick={() => move(1)} className="min-h-11 rounded-lg border border-ink-700 px-3 text-sm text-ink-100">Successivo</button>
    </div>
    <p className="mb-3 text-sm text-ink-400">Scadenze Do Date delle righe caricate, nel fuso Europe/Rome. Apri una data per modificare l'Action.</p>
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-ink-700 bg-ink-700">
      {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((day) => <div key={day} className="bg-ink-950 py-2 text-center text-xs text-ink-400">{day}</div>)}
      {monthCells(month).map((date, i) => <div key={date ?? i} className="min-h-16 min-w-0 bg-ink-950 p-1 sm:p-2">
        {date && <>
          <time dateTime={date} aria-current={date === today ? "date" : undefined} className={`block text-xs ${date === today ? "font-bold underline" : "text-ink-400"}`}>{Number(date.slice(-2))}</time>
          {(byDate.get(date) ?? []).map((row) => <button key={row.id} type="button" onClick={() => onSelect(row)} aria-label={`${row.title}, ${date}`} title={row.title} className="mt-1 min-h-11 w-full min-w-0 truncate rounded border border-ink-600 bg-ink-800 px-1 text-left text-xs text-ink-100 focus-visible:outline-2 focus-visible:outline-ink-100">{row.title}</button>)}
        </>}
      </div>)}
    </div>
    <p className="mt-3 text-sm text-ink-400">{undated} righe senza Do Date valida non compaiono nel calendario.</p>
  </section>;
}
