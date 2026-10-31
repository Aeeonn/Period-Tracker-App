import type { Tracker } from '../../../contracts/enums.ts';
import type { LogEntry } from './types.ts';

export interface PendingTrackerDraft {
  readonly entries: readonly LogEntry[];
  readonly dirty: boolean;
}

export type PendingTrackerDrafts = Partial<Record<Tracker, PendingTrackerDraft>>;

export interface PendingEdits {
  readonly entries: readonly LogEntry[];
  readonly dirtyTrackers: readonly Tracker[];
}

function sameDraft(left: PendingTrackerDraft | undefined, right: PendingTrackerDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function updatePendingTrackerDrafts(
  current: PendingTrackerDrafts,
  tracker: Tracker,
  entries: readonly LogEntry[],
  dirty: boolean,
): PendingTrackerDrafts {
  const nextDraft = { entries, dirty };
  if (!dirty && current[tracker] === undefined) return current;
  if (dirty && sameDraft(current[tracker], nextDraft)) return current;

  const next = { ...current };
  if (dirty) next[tracker] = nextDraft;
  else delete next[tracker];
  return next;
}

export function getPendingEdits(drafts: PendingTrackerDrafts): PendingEdits {
  const dirtyTrackers = Object.keys(drafts).filter(
    (tracker): tracker is Tracker => drafts[tracker as Tracker]?.dirty === true,
  );
  return {
    dirtyTrackers,
    entries: dirtyTrackers.flatMap((tracker) => drafts[tracker]?.entries ?? []),
  };
}
