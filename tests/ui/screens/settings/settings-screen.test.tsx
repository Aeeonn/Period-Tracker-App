// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceId } from '../../../../src/contracts/brand.ts';
import type { Tracker } from '../../../../src/contracts/enums.ts';
import { createSettingsRepo } from '../../../../src/data/repos/index.ts';
import { RepositoriesContext, type Repositories } from '../../../../src/ui/layout/repositories.tsx';
import {
  LockControlsContext,
  type LockControls,
} from '../../../../src/ui/layout/lock-controls.tsx';
import { createMemoryService } from '../../../lock/fixtures.ts';
import {
  DEFAULT_SETTINGS_PROFILE,
  SettingsScreen,
} from '../../../../src/ui/screens/settings/main/settings-screen.tsx';
import { MemoryRecordStore } from '../../../data/repos/memory-record-store.ts';

const DEVICE_ID = 'synthetic-settings-screen-device' as DeviceId;
const roots: HTMLElement[] = [];

function createRepositories() {
  const store = new MemoryRecordStore();
  const settingsRepo = createSettingsRepo(store, {
    deviceId: DEVICE_ID,
    nowMs: () => 1_800_000_000_000,
  });
  return {
    settingsRepo,
    repositories: {
      logRepo: {
        async listPortableRecords() {
          return [];
        },
      },
      settingsRepo,
    } as unknown as Repositories,
  };
}

async function mount(
  repositories: Repositories,
  pinnedTrackers: readonly Tracker[],
  onPinnedTrackersChange = vi.fn(),
  onThemeChange = vi.fn(),
): Promise<{
  root: HTMLElement;
  onPinnedTrackersChange: typeof onPinnedTrackersChange;
  onThemeChange: typeof onThemeChange;
}> {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  await act(async () => {
    render(
      <RepositoriesContext.Provider value={repositories}>
        <SettingsScreen
          pinnedTrackers={pinnedTrackers}
          onPinnedTrackersChange={onPinnedTrackersChange}
          onThemeChange={onThemeChange}
        />
      </RepositoriesContext.Provider>,
      root,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { root, onPinnedTrackersChange, onThemeChange };
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const result = [...root.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent?.trim() === label || candidate.getAttribute('aria-label') === label,
  );
  if (!(result instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  return result;
}

async function choose(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    render(null, root);
    root.remove();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Settings screen accessible behavior', () => {
  it('applies a saved lock timeout to the running auto-lock and shows Face ID only with lock controls', async () => {
    const { repositories, settingsRepo } = createRepositories();
    const withoutControls = await mount(repositories, ['flow']);
    expect(withoutControls.root.textContent).not.toContain('Face ID unlock');

    const onLockTimeoutChange = vi.fn();
    const controls: LockControls = {
      service: createMemoryService(),
      passkeys: {
        isAvailable: async () => false,
        enroll: async () => ({ ok: false, error: 'unsupported' }),
        evaluate: async () => ({ ok: false, error: 'unsupported' }),
        forget: async () => undefined,
      },
      onLockTimeoutChange,
    };
    const root = document.createElement('div');
    document.body.append(root);
    roots.push(root);
    await act(async () => {
      render(
        <LockControlsContext.Provider value={controls}>
          <RepositoriesContext.Provider value={repositories}>
            <SettingsScreen
              pinnedTrackers={['flow']}
              onPinnedTrackersChange={vi.fn()}
              onThemeChange={vi.fn()}
            />
          </RepositoriesContext.Provider>
        </LockControlsContext.Provider>,
        root,
      );
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(root.textContent).toContain('Face ID unlock');
    const timeout = root.querySelector<HTMLSelectElement>('#settings-lock-timeout');
    if (!timeout) throw new Error('Lock timeout selector is missing.');
    expect(DEFAULT_SETTINGS_PROFILE.lockTimeoutSec).toBe(60);
    await choose(timeout, '0');
    await expect(settingsRepo.getProfile()).resolves.toMatchObject({ lockTimeoutSec: 0 });
    expect(onLockTimeoutChange).toHaveBeenCalledWith(0);
  });
  it('persists display preferences, announces saves, and delegates pinned tracker ordering', async () => {
    const { repositories, settingsRepo } = createRepositories();
    const { root, onPinnedTrackersChange, onThemeChange } = await mount(
      repositories,
      ['flow', 'mood'],
    );

    expect(root.querySelector('h1')?.textContent).toBe('Settings');
    expect(root.querySelector<HTMLSelectElement>('#settings-theme')?.value).toBe('system');
    expect(root.querySelector('[data-testid="temperature-preview"]')?.textContent).toContain(
      '20',
    );

    const temperature = root.querySelector<HTMLInputElement>(
      'input[name="settings-temperature"][value="fahrenheit"]',
    );
    if (!temperature) throw new Error('Fahrenheit preference control is missing.');
    await act(async () => {
      temperature.checked = true;
      temperature.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    await expect(settingsRepo.getProfile()).resolves.toMatchObject({
      units: { temp: 'fahrenheit', weight: 'kg' },
    });
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Settings saved on this device.',
    );
    expect(root.querySelector('[data-testid="temperature-preview"]')?.textContent).toContain(
      '68.0 °F',
    );

    const theme = root.querySelector<HTMLSelectElement>('#settings-theme');
    if (!theme) throw new Error('Theme selector is missing.');
    await choose(theme, 'dark');
    await expect(settingsRepo.getProfile()).resolves.toMatchObject({ theme: 'dark' });
    expect(onThemeChange).toHaveBeenCalledWith('dark');

    await act(async () => button(root, 'Move Mood up').click());
    expect(onPinnedTrackersChange).toHaveBeenCalledWith(['mood', 'flow']);
    await act(async () => button(root, 'Hide Flow').click());
    expect(onPinnedTrackersChange).toHaveBeenLastCalledWith(['mood']);

    // Another screen stored pinned trackers after Settings loaded; the next
    // settings change must keep them.
    const stored = await settingsRepo.getProfile();
    if (!stored) throw new Error('Synthetic profile is missing.');
    await settingsRepo.putProfile({ ...stored, pinnedTrackers: ['mood'] });
    await choose(theme, 'light');
    await expect(settingsRepo.getProfile()).resolves.toMatchObject({
      theme: 'light',
      pinnedTrackers: ['mood'],
    });

    // Trackers for dropped features (ADR-0017) are not offered for pinning.
    const offered = [...root.querySelectorAll('.tracker-pin-list button')].map((candidate) =>
      candidate.getAttribute('aria-label'),
    );
    expect(offered).toContain('Pin Weight');
    for (const dropped of [
      'Basal body temperature',
      'Ovulation',
      'Pill intake',
      'Medication',
      'Perimenopause impacts',
      'Postpartum bleeding',
      'Heavy-flow details',
    ]) {
      expect(offered).not.toContain(`Pin ${dropped}`);
    }
  });

  it('shows a safe load error and rolls back failed setting writes without changing the saved profile', async () => {
    const loadFixture = createRepositories();
    vi.spyOn(loadFixture.settingsRepo, 'getProfile').mockRejectedValue(
      new Error('synthetic settings read failure'),
    );
    const failedLoad = await mount(loadFixture.repositories, []);
    expect(failedLoad.root.querySelector('[role="alert"]')?.textContent).toContain(
      'Settings could not be loaded.',
    );
    expect(failedLoad.root.querySelector<HTMLSelectElement>('#settings-theme')?.disabled).toBe(
      true,
    );

    const saveFixture = createRepositories();
    const originalProfile = {
      goal: 'track',
      lifeStage: 'cycle',
      units: { temp: 'celsius', weight: 'kg' },
      weekStart: 1,
      theme: 'system',
      lockTimeoutSec: 300,
      quickHideEnabled: false,
    } as const;
    await saveFixture.settingsRepo.putProfile(originalProfile);
    vi.spyOn(saveFixture.settingsRepo, 'putProfile').mockRejectedValue(
      new Error('synthetic settings write failure'),
    );
    const failedSave = await mount(saveFixture.repositories, ['flow']);
    const theme = failedSave.root.querySelector<HTMLSelectElement>('#settings-theme');
    if (!theme) throw new Error('Theme selector is missing.');
    await choose(theme, 'dark');

    expect(failedSave.root.querySelector('[role="alert"]')?.textContent).toContain(
      'Your previous choice is unchanged.',
    );
    await expect(saveFixture.settingsRepo.getProfile()).resolves.toMatchObject({
      theme: 'system',
    });
    expect(failedSave.root.querySelector<HTMLSelectElement>('#settings-theme')?.value).toBe(
      'system',
    );
  });

  it('opens the portable data screen and returns to settings with the same repositories', async () => {
    const { repositories } = createRepositories();
    const { root } = await mount(repositories, ['flow']);

    await act(async () => button(root, 'Export / import my data').click());
    expect(root.querySelector('h1')?.textContent).toBe('Export / import my data');
    await act(async () => button(root, 'Back to settings').click());
    expect(root.querySelector('h1')?.textContent).toBe('Settings');
  });
});
