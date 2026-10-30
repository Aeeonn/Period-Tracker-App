import type { DueReminder } from '../../../contracts/reminders.ts';
import type { ReminderKind } from '../../../contracts/enums.ts';
import { PERIOD_START_REMINDER_LEAD_DAYS } from '../../../reminders/inapp/index.ts';
import './reminder-banner.css';

const leadDayLabel = PERIOD_START_REMINDER_LEAD_DAYS === 1 ? 'day' : 'days';
const REMINDER_MESSAGES: Partial<Record<ReminderKind, string>> = {
  still_bleeding: 'Still bleeding today?',
  daily_symptom_log: 'Log your symptoms today?',
  period_start_window: `Your period may start in ~${PERIOD_START_REMINDER_LEAD_DAYS} ${leadDayLabel}.`,
  custom: 'Time for your check-in.',
};

export function reminderMessage(kind: ReminderKind): string | null {
  return REMINDER_MESSAGES[kind] ?? null;
}

export interface ReminderBannerProps {
  readonly reminders: readonly DueReminder[];
}

/** Display-only in-app prompts; Today owns any response or logging action. */
export function ReminderBanner({ reminders }: ReminderBannerProps) {
  const visibleReminders = reminders.flatMap((reminder) => {
    const message = reminderMessage(reminder.kind);
    return message === null ? [] : [{ ruleId: reminder.ruleId, message }];
  });

  if (visibleReminders.length === 0) return null;

  return (
    <section
      class="ui-card reminder-banner"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="In-app reminders"
    >
      {visibleReminders.map(({ ruleId, message }) => (
        <p class="reminder-banner__message" key={String(ruleId)}>
          {message}
        </p>
      ))}
    </section>
  );
}
