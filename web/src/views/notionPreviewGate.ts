// The canonical writer accepts a preview packet as an apply input. Only a
// packet produced for the currently selected row and draft may reach it.
interface PreviewPacket {
  packet_id: string;
  row_id: string;
  changes: Record<string, unknown>;
  apply_allowed: boolean;
}

function equalValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function equalChanges(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every((key) => Object.hasOwn(b, key) && equalValue(a[key], b[key]));
}

export function notionDraftChanges(
  draft: Record<string, unknown>,
  original: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(draft).filter(([name, value]) => !equalValue(value, original[name])));
}

export function createNotionPreviewGate() {
  let revision = 0;
  let accepted: PreviewPacket | null = null;
  const inFlight = new WeakSet<PreviewPacket>();
  const consumed = new WeakSet<PreviewPacket>();
  const consumedIds = new Set<string>();

  const invalidate = () => {
    revision += 1;
    accepted = null;
  };

  return {
    invalidate,
    isCurrent: (packet: PreviewPacket) => accepted === packet && packet.apply_allowed && !consumed.has(packet) && !consumedIds.has(packet.packet_id),
    async preview<P extends PreviewPacket>({ rowId, changes, fetchPacket, onReady, onError }: {
      rowId: string;
      changes: Record<string, unknown>;
      fetchPacket: () => Promise<P>;
      onReady: (packet: P) => void;
      onError: (message: string) => void;
    }): Promise<void> {
      invalidate();
      const requestedRevision = revision;
      try {
        const packet = await fetchPacket();
        if (requestedRevision !== revision) return;
        if (packet.row_id !== rowId || !equalChanges(packet.changes, changes) || !packet.apply_allowed || consumedIds.has(packet.packet_id)) {
          onError("Preview non coerente con la riga o il draft. Ricarica e prepara una nuova preview.");
          return;
        }
        accepted = packet;
        onReady(packet);
      } catch (reason) {
        if (requestedRevision === revision) {
          onError(reason instanceof Error ? reason.message : "Preview Notion non disponibile.");
        }
      }
    },
    async apply<P extends PreviewPacket, R>(packet: P, confirmation: string, submit: (packet: P, confirmation: string) => Promise<R>): Promise<R> {
      if (accepted !== packet || !packet.apply_allowed || inFlight.has(packet) || consumed.has(packet) || consumedIds.has(packet.packet_id)) {
        return Promise.reject(new Error("Preview scaduta: prepara una nuova preview prima di applicare."));
      }
      inFlight.add(packet);
      try {
        const result = await submit(packet, confirmation);
        // Even when the user is now on row B, A is permanently consumed.
        consumed.add(packet);
        consumedIds.add(packet.packet_id);
        if (accepted === packet) invalidate();
        return result;
      } finally {
        inFlight.delete(packet);
      }
    },
  };
}
