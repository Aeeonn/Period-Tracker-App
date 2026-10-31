import { render } from 'preact';
import type { DeviceId } from '../../../src/contracts/brand.ts';
import type { LocalDate } from '../../../src/contracts/localdate.ts';
import { createLogRepo, createSettingsRepo } from '../../../src/data/repos/index.ts';
import { parse } from '../../../src/lib/localdate/index.ts';
import { AppShell } from '../../../src/ui/layout/app.tsx';
import { LogScreen } from '../../../src/ui/screens/log/index.ts';
import { MemoryRecordStore } from '../../data/repos/memory-record-store.ts';

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

async function mountFixture(): Promise<void> {
  if (fixture === 'heavy') await repository.setTracker(date, 'flow', 'heavy');
  if (fixture === 'note') await repository.setTracker(date, 'notes', notePayload);

  const root = document.getElementById('log-root');
  if (root === null) throw new Error('Log fixture mount point is missing.');

  if (fixture === 'app' || fixture === 'day-log' || fixture === 'calendar') {
    window.location.hash = fixture === 'calendar' ? 'calendar' : 'log';
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
    <LogScreen logRepo={fixture === 'locked' ? undefined : repository} localDate={date} />,
    root,
  );
}

void mountFixture();
