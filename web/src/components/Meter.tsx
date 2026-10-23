import { SEVERITY_BG, metric } from "../lib/format";
import type { Severity } from "../lib/types";

interface MeterProps {
  label: string;
  value: number | null;
  unit?: string;
  severity: Severity;
  detail?: string;
  compact?: boolean;
}

export function Meter({ label, value, unit = "%", severity, detail, compact }: MeterProps) {
  const measured = value !== null && value !== undefined;
  const width = measured ? Math.min(100, Math.max(2, value)) : 0;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-medium tracking-wide text-ink-400 uppercase">
          {label}
        </span>
        <span
          className={`tnum text-sm font-semibold ${measured ? "text-ink-200" : "text-ink-400"}`}
        >
          {metric(value, unit, unit === "°C" || (value !== null && value < 10) ? 1 : 0)}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700"
        role="meter"
        aria-valuenow={measured ? Math.round(value) : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {measured ? (
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${SEVERITY_BG[severity]}`}
            style={{ width: `${width}%` }}
          />
        ) : (
          <div className="h-full w-full bg-[repeating-linear-gradient(135deg,var(--color-ink-600)_0px,var(--color-ink-600)_4px,transparent_4px,transparent_9px)]" />
        )}
      </div>
      {!compact && detail && (
        <p className="mt-1 truncate text-[11px] text-ink-400" title={detail}>
          {detail}
        </p>
      )}
    </div>
  );
}
