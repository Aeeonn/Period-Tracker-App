/**
 * `ReminderService` (architecture.md §3 `reminders`; ADR-0008). Reminder
 * details are evaluated in the unlocked app only. Push is at most one generic
 * daily notification with fixed text; no health data reaches the relay or
 * the lock screen.
 */
import type { ReminderId } from './brand.ts';
import type { ReminderKind } from './enums.ts';
import type { EngineOutput } from './engine-api.ts';
import type { DayLog, ReminderRule } from './entities.ts';
import type { LocalDate, LocalTime } from './localdate.ts';

export interface ReminderContext {
  readonly today: LocalDate;
  readonly now: LocalTime;
  readonly rules: readonly ReminderRule[];
  readonly engineOutput: EngineOutput;
  readonly recentDayLogs: readonly DayLog[];
}

/** An in-app reminder due now; the UI renders reviewed text for its kind. */
export interface DueReminder {
  readonly ruleId: ReminderId;
  readonly kind: ReminderKind;
}

/** Push schedule sent to the relay: `{IANA zone, HH:MM}` only (PR-07). */
export interface PushSchedule {
  readonly tz: string;
  readonly time: LocalTime;
  readonly enabled: boolean;
}

export type PushSubscribeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: 'permission_denied' | 'unsupported' | 'unavailable' };

export interface ReminderService {
  /** Pure in-app evaluation. */
  evaluate(context: ReminderContext): readonly DueReminder[];
  /** Must be called from a user tap (permission prompt). */
  subscribePush(schedule: PushSchedule): Promise<PushSubscribeResult>;
  unsubscribePush(): Promise<void>;
}
