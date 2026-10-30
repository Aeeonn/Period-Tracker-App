// synthetic: true - banner tests use synthetic rule ids and no personal data.
import { describe, expect, it } from 'vitest';
import type { ReminderId } from '../../../src/contracts/brand.ts';
import type { DueReminder } from '../../../src/contracts/reminders.ts';
import {
  ReminderBanner,
  reminderMessage,
} from '../../../src/ui/components/reminder-banner/index.tsx';

const due = (kind: DueReminder['kind'], ruleId: string): DueReminder => ({
  kind,
  ruleId: ruleId as ReminderId,
});

describe('ReminderBanner', () => {
  it('uses reviewed in-app copy for the four supported reminder kinds', () => {
    expect(reminderMessage('still_bleeding')).toBe('Still bleeding today?');
    expect(reminderMessage('daily_symptom_log')).toBe('Log your symptoms today?');
    expect(reminderMessage('period_start_window')).toBe('Your period may start in ~2 days.');
    expect(reminderMessage('custom')).toBe('Time for your check-in.');
    expect(reminderMessage('pill')).toBeNull();
  });

  it('renders no banner when there are no supported reminders', () => {
    expect(ReminderBanner({ reminders: [] })).toBeNull();
    expect(ReminderBanner({ reminders: [due('pill', 'synthetic-pill-rule')] })).toBeNull();
  });

  it('renders a polite accessible status region for due prompts', () => {
    const banner = ReminderBanner({
      reminders: [due('still_bleeding', 'synthetic-bleeding-rule')],
    });

    expect(banner).not.toBeNull();
    expect(banner?.type).toBe('section');
    expect(banner?.props.role).toBe('status');
    expect(banner?.props['aria-live']).toBe('polite');
  });
});
