import type { WorkspaceActionItemOperationApplyResult as ApplyResult } from "../src/lib/types";

declare const result: ApplyResult;

if (result.status === "already-rolled-back") {
  // @ts-expect-error A terminal replay must never be treated as an applied row.
  result.row.id;
} else {
  result.row.id;
}
