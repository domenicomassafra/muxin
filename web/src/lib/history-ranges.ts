// The MiniPC Fleet2 store retains 14 days of samples for every runtime identity.
export const HISTORY_RANGES = [
  { minutes: 60, label: "1 ora" },
  { minutes: 360, label: "6 ore" },
  { minutes: 1440, label: "24 ore" },
  { minutes: 20160, label: "14 giorni" },
] as const;
