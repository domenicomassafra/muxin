import { useId } from "react";

interface SparklineProps {
  points: (number | null)[];
  height?: number;
  className?: string;
  stroke?: string;
  /** Segments with no measurement are drawn as gaps, never as zero. */
  label?: string;
}

export function Sparkline({
  points,
  height = 44,
  className = "",
  stroke = "currentColor",
  label,
}: SparklineProps) {
  const gradientId = `spark-fill-${useId().replace(/:/g, "")}`;
  const width = 240;
  const usable = points.length > 1 ? points : [];
  if (usable.length === 0) {
    return (
      <div
        className={`flex items-center text-[11px] text-ink-400 ${className}`}
        style={{ height }}
      >
        Nessuno storico ancora
      </div>
    );
  }

  const max = Math.max(100, ...usable.map((value) => value ?? 0));
  const step = width / (usable.length - 1);
  const y = (value: number) => height - (value / max) * (height - 4) - 2;

  // Build one path per contiguous run of measured points so gaps stay gaps.
  const segments: string[] = [];
  let current: string[] = [];
  usable.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${(index * step).toFixed(1)},${y(value).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  const last = [...usable].reverse().find((value) => value !== null) ?? null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      role="img"
      aria-label={label ?? "Andamento"}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {segments.map((segment, index) => (
        <path
          key={`fill-${index}`}
          d={`${segment} L${width},${height} L0,${height} Z`}
          fill={`url(#${gradientId})`}
          stroke="none"
        />
      ))}
      {segments.map((segment, index) => (
        <path
          key={`line-${index}`}
          d={segment}
          fill="none"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {last !== null && (
        <circle
          cx={width}
          cy={y(last)}
          r="2.4"
          fill={stroke}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
