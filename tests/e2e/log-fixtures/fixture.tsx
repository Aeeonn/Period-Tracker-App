import { render } from 'preact';
import type { DeviceId } from '../../../src/contracts/brand.ts';
import type { DayBundle } from '../../../src/contracts/entities.ts';
import { TRACKERS } from '../../../src/contracts/enums.ts';
import type { LocalDate, LocalTime } from '../../../src/contracts/localdate.ts';
import { createLogRepo, createSettingsRepo } from '../../../src/data/repos/index.ts';
import { parse } from '../../../src/lib/localdate/index.ts';
import { AppShell } from '../../../src/ui/layout/app.tsx';
import { LogScreen } from '../../../src/ui/screens/log/index.ts';
import { MemoryRecordStore } from '../../data/repos/memory-record-store.ts';

// The app offers only in-scope trackers; this fixture offers every one so each
// editor stays covered by the accessibility audits.
const ALL_PINNABLE_TRACKERS = TRACKERS.filter((tracker) => tracker !== 'heavy_detail');

function syntheticDate(): LocalDate {
  const parsed = parse('2032-04-05');
  if (parsed === null) throw new Error('Synthetic log fixture date did not parse.');
  return parsed;
}

const date = syntheticDate();
const deviceId = 'synthetic-e2e-log-device' as DeviceId;
const store = new MemoryRecordStore();
const repositoryOptions = { deviceId, nowMs: () => 1_800_000_000_000 };
const repository = createLogRepo(store, repositoryOptions);
const repositories = {
  logRepo: repository,
  settingsRepo: createSettingsRepo(store, repositoryOptions),
};
const notePayload =
  '<script>window.logPayloadRan = true</script><img src=x onerror="window.logPayloadRan=true">';
const params = new URLSearchParams(window.location.search);
const fixture = params.get('fixture');
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';

declare global {
  interface Window {
    __logTest?: { readDay: (localDate: string) => Promise<DayBundle | undefined> };
  }
}

async function mountFixture(): Promise<void> {
  if (fixture === 'heavy') await repository.setTracker(date, 'flow', 'heavy');
  if (fixture === 'note') await repository.setTracker(date, 'notes', notePayload);
  // An earlier temperature reading: the tracker is no longer offered for pinning,
  // but a day that already has one must still show and edit it.
  if (params.get('seed') === 'bbt') {
    await repository.setTracker(date, 'bbt', {
      valueC: 36.5,
      measuredAt: '06:30' as LocalTime,
      disturbances: [],
    });
  }
  if (params.get('unit') === 'fahrenheit' || params.get('weekstart') === 'sunday') {
    await repositories.settingsRepo.putProfile({
      goal: 'track',
      lifeStage: 'cycle',
      units: {
        temp: params.get('unit') === 'fahrenheit' ? 'fahrenheit' : 'celsius',
        weight: 'kg',
      },
      weekStart: params.get('weekstart') === 'sunday' ? 7 : 1,
      theme: 'system',
      lockTimeoutSec: 300,
      quickHideEnabled: false,
    });
  }
  window.__logTest = {
    readDay: async (localDate) => {
      const parsed = parse(localDate);
      return parsed === null ? undefined : repository.getDay(parsed);
    },
  };

  const root = document.getElementById('log-root');
  if (root === null) throw new Error('Log fixture mount point is missing.');

  if (
    fixture === 'app' ||
    fixture === 'day-log' ||
    fixture === 'calendar' ||
    fixture === 'calendar-live'
  ) {
    window.location.hash =
      fixture === 'calendar' || fixture === 'calendar-live' ? 'calendar' : 'log';
    render(
      <AppShell
        repositories={repositories}
        updateNotice={null}
        restartStatus="ready"
        cancelRestart={() => undefined}
        sessionOnboardingComplete
      />,
      root,
    );
    return;
  }

  render(
    <LogScreen
      logRepo={fixture === 'locked' ? undefined : repository}
      localDate={date}
      offeredTrackers={ALL_PINNABLE_TRACKERS}
    />,
    root,
  );
}

void mountFixture();
