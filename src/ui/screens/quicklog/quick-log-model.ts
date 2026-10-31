import type { DayBundle, TrackerValues } from '../../../contracts/entities.ts';
import type { Tracker } from '../../../contracts/enums.ts';
import type { LocalDate } from '../../../contracts/localdate.ts';
import { persistLogEntries } from '../log/log-screen.tsx';
import type { LogEntry, LogRepo } from '../log/types.ts';

export interface QuickLogUndoReceipt {
  readonly tracker: Tracker;
  readonly previousValue: TrackerValues[Tracker] | undefined;
  readonly savedValue: TrackerValues[Tracker];
}

export async function saveQuickLogEntry(
  logRepo: LogRepo,
  localDate: LocalDate,
  createEntry: (day: DayBundle | undefined) => LogEntry,
): Promise<QuickLogUndoReceipt> {
  const previousDay = await logRepo.getDay(localDate);
  const entry = createEntry(previousDay);
  await persistLogEntries(logRepo, localDate, [entry]);
  return {
    tracker: entry.tracker,
    previousValue: previousDay?.[entry.tracker],
    savedValue: entry.value,
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function undoQuickLogEntry(
  logRepo: LogRepo,
  localDate: LocalDate,
  receipt: QuickLogUndoReceipt,
): Promise<boolean> {
  const currentDay = await logRepo.getDay(localDate);
  if (!sameValue(currentDay?.[receipt.tracker], receipt.savedValue)) return false;

  if (receipt.previousValue === undefined) {
    await logRepo.clearTracker(localDate, receipt.tracker);
  } else {
    const previousEntry = {
      tracker: receipt.tracker,
      value: receipt.previousValue,
    } as LogEntry;
    await persistLogEntries(logRepo, localDate, [previousEntry]);
  }
  return true;
}
