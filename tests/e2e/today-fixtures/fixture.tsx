import { render } from 'preact';
import type { DeviceId, ReminderId } from '../../../src/contracts/brand.ts';
import type { DayBundle, ReminderRule } from '../../../src/contracts/entities.ts';
import type { SuppressionReason } from '../../../src/contracts/enums.ts';
import type { LocalTime } from '../../../src/contracts/localdate.ts';
import { createLogRepo, createSettingsRepo } from '../../../src/data/repos/index.ts';
import { evaluateReminders } from '../../../src/reminders/inapp/index.ts';
import {
  SUPPRESSION_REASONS,
  TODAY_EMERGENCY_FIXTURE,
  TODAY_PREVIEW_FIXTURE,
  TODAY_SUPPRESSION_FIXTURES,
} from '../../../src/ui/screens/today/index.ts';
import { TodayScreen } from '../../../src/ui/screens/today/today-screen.tsx';
import { RepositoriesContext, type Repositories } from '../../../src/ui/layout/repositories.tsx';
import { MemoryRecordStore } from '../../data/repos/memory-record-store.ts';

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
const deviceId = 'synthetic-e2e-quicklog-device' as DeviceId;
const store = new MemoryRecordStore();
const repositoryOptions = { deviceId, nowMs: () => 1_800_000_000_000 };
const logRepo = createLogRepo(store, repositoryOptions);
const repositories = {
  logRepo,
  settingsRepo: createSettingsRepo(store, repositoryOptions),
};

type QuickLogTestDay = {
  readonly flow?: DayBundle['flow'] | undefined;
  readonly symptoms_body?: DayBundle['symptoms_body'] | undefined;
  readonly mood?: DayBundle['mood'] | undefined;
  readonly desire?: DayBundle['desire'] | undefined;
  readonly sex?: DayBundle['sex'] | undefined;
};

declare global {
  interface Window {
    __quickLogTest?: { readDay: () => Promise<QuickLogTestDay | undefined> };
  }
}

async function mountFixture(): Promise<void> {
  if (root === null) throw new Error('Today fixture mount point is missing.');
  if (fixture === 'existing') {
    await logRepo.setTracker(props.today, 'flow', 'medium');
    await logRepo.setTracker(props.today, 'symptoms_body', ['fatigue']);
    await logRepo.setTracker(props.today, 'desire', 'high');
  }

  window.__quickLogTest = {
    readDay: async () => {
      const day = await logRepo.getDay(props.today);
      if (!day) return undefined;
      return {
        flow: day.flow,
        symptoms_body: day.symptoms_body,
        mood: day.mood,
        desire: day.desire,
        sex: day.sex,
      };
    },
  };

  const contextValue =
    fixture === 'locked'
      ? { ...repositories, logRepo: null as unknown as typeof logRepo }
      : repositories;
  render(
    <RepositoriesContext.Provider value={contextValue as Repositories}>
      <TodayScreen {...props} />
    </RepositoriesContext.Provider>,
    root,
  );
}

void mountFixture();
