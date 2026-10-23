// A response for an earlier row/packet must never mutate the mounted panel.
// The canonical apply result can still update parent readback and receipts.
interface RowPacket { row_id: string }

export function createNotionPanelIdentity() {
  let mounted = true;
  let rowId: string | null = null;
  let preview: RowPacket | null = null;
  let applied: RowPacket | null = null;
  return {
    sync(nextRow: string | null, nextPreview: RowPacket | null, nextApplied: RowPacket | null = null) {
      rowId = nextRow;
      preview = nextPreview;
      applied = nextApplied;
    },
    reactivate() { mounted = true; },
    dispose() { mounted = false; },
    matchesApply(requestRow: string, packet: RowPacket) {
      return mounted && rowId === requestRow && preview === packet;
    },
    matchesRollback(requestRow: string, packet: RowPacket) {
      return mounted && rowId === requestRow && applied === packet;
    },
  };
}
