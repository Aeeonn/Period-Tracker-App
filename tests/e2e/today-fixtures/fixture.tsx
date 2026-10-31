import { render } from 'preact';
import type { ReminderId } from '../../../src/contracts/brand.ts';
import type { ReminderRule } from '../../../src/contracts/entities.ts';
import type { SuppressionReason } from '../../../src/contracts/enums.ts';
import type { LocalTime } from '../../../src/contracts/localdate.ts';
import { evaluateReminders } from '../../../src/reminders/inapp/index.ts';
import {
  SUPPRESSION_REASONS,
  TODAY_EMERGENCY_FIXTURE,
  TODAY_PREVIEW_FIXTURE,
  TODAY_SUPPRESSION_FIXTURES,
} from '../../../src/ui/screens/today/index.ts';
import { TodayScreen } from '../../../src/ui/screens/today/today-screen.tsx';

const params = new URLSearchParams(window.location.search);
const fixture = params.get('fixture');
const suppression = params.get('suppression');
const syntheticReminder: ReminderRule = {
  id: 'synthetic-today-checkin' as ReminderId,
  kind: 'custom',
  localTime: '08:00' as LocalTime,
  days: [4],
  condition: 'always',
  enabled: true,
};
const reminderFixture = {
  ...TODAY_PREVIEW_FIXTURE,
  reminders: evaluateReminders({
    today: TODAY_PREVIEW_FIXTURE.today,
    now: '12:00' as LocalTime,
    rules: [syntheticReminder],
    engineOutput: TODAY_PREVIEW_FIXTURE.engineOutput,
    recentDayLogs: [],
  }),
};
const props =
  fixture === 'reminder'
    ? reminderFixture
    : fixture === 'emergency'
      ? TODAY_EMERGENCY_FIXTURE
      : suppression !== null && (SUPPRESSION_REASONS as readonly string[]).includes(suppression)
        ? TODAY_SUPPRESSION_FIXTURES[suppression as SuppressionReason]
        : TODAY_PREVIEW_FIXTURE;
const root = document.getElementById('today-root');

if (root === null) throw new Error('Today fixture mount point is missing.');
render(<TodayScreen {...props} />, root);
