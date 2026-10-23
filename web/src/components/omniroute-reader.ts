import type { OmniRouteStatus } from "../lib/types";

export interface OmniRouteReadState {
  status: OmniRouteStatus | null;
  error: string | null;
  loading: boolean;
}

const EMPTY: OmniRouteReadState = { status: null, error: null, loading: false };

/** A new activation is a new observation; previous requests must never repaint it. */
export function createOmniRouteReader(
  read: () => Promise<OmniRouteStatus>,
  update: (state: OmniRouteReadState) => void,
) {
  let active = false;
  let generation = 0;

  const refresh = () => {
    if (!active) return;
    const current = ++generation;
    update({ ...EMPTY, loading: true });
    try {
      void read().then((status) => {
        if (active && generation === current) update({ status, error: null, loading: false });
      }).catch((cause: unknown) => {
        if (active && generation === current) {
          update({ ...EMPTY, error: cause instanceof Error ? cause.message : "Lettura non disponibile" });
        }
      });
    } catch (cause) {
      if (active && generation === current) {
        update({ ...EMPTY, error: cause instanceof Error ? cause.message : "Lettura non disponibile" });
      }
    }
  };

  return {
    setActive(next: boolean) {
      if (!next) {
        active = false;
        ++generation;
        update(EMPTY);
      } else if (!active) {
        active = true;
        refresh();
      }
    },
    refresh,
    dispose() {
      active = false;
      ++generation;
    },
  };
}

/** Client-side guard against marking incomplete or unverified checks healthy. */
export function isOmniRouteConverged(status: OmniRouteStatus | null): boolean {
  const observed = status?.observation;
  return observed?.result === "clean"
    && observed.exit_code === 0
    && observed.scope_complete === true
    && typeof observed.checked_at === "string"
    && Number.isFinite(Date.parse(observed.checked_at));
}
