// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceId, LogicalId } from '../../src/contracts/brand.ts';
import type { LogicalRecord } from '../../src/contracts/store.ts';
import { SCHEMA_VERSION } from '../../src/data/store/schema.ts';
import { createLogRepo, createSettingsRepo } from '../../src/data/repos/index.ts';
import { RepositoriesContext, type Repositories } from '../../src/ui/layout/repositories.tsx';
import { PortableDataScreen } from '../../src/backup/portable/portable-screen.tsx';
import { createPortableDocument } from '../../src/backup/portable/codec.ts';
import { MemoryRecordStore } from '../data/repos/memory-record-store.ts';

const DEVICE_ID = 'synthetic-portable-screen-device' as DeviceId;
const PROFILE_ID = 'profile' as LogicalId;
const roots: HTMLElement[] = [];

function fixture(): {
  readonly root: HTMLElement;
  readonly repositories: Repositories;
  readonly store: MemoryRecordStore;
  readonly settingsRepo: ReturnType<typeof createSettingsRepo>;
} {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  const store = new MemoryRecordStore();
  const options = { deviceId: DEVICE_ID, nowMs: () => 1_800_000_000_000 };
  const repositories: Repositories = {
    logRepo: createLogRepo(store, options),
    settingsRepo: createSettingsRepo(store, options),
  };
  render(
    <RepositoriesContext.Provider value={repositories}>
      <PortableDataScreen onBack={() => undefined} />
    </RepositoriesContext.Provider>,
    root,
  );
  return { root, repositories, store, settingsRepo: repositories.settingsRepo as ReturnType<typeof createSettingsRepo> };
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const result = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(result instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  return result;
}

async function click(root: HTMLElement, label: string): Promise<void> {
  await act(async () => {
    button(root, label).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function selectFile(root: HTMLElement, file: File): Promise<void> {
  const input = root.querySelector<HTMLInputElement>('#portable-import-file');
  if (!input) throw new Error('Portable import input is missing.');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function profileRecord(): LogicalRecord<'Profile'> {
  return {
    entity: 'Profile',
    logicalId: PROFILE_ID,
    authorDevice: DEVICE_ID,
    hlc: { wallMs: 1_800_000_000_000, counter: 0, deviceId: DEVICE_ID },
    deleted: false,
    body: {
      goal: 'track',
      lifeStage: 'cycle',
      units: { temp: 'celsius', weight: 'kg' },
      weekStart: 1,
      theme: 'dark',
      lockTimeoutSec: 300,
      quickHideEnabled: false,
    },
  } as LogicalRecord<'Profile'>;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    render(null, root);
    root.remove();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('portable data screen', () => {
  it('exports JSON and a selected CSV, falls back when sharing is unavailable, and returns to settings', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    roots.push(root);
    const store = new MemoryRecordStore();
    const options = { deviceId: DEVICE_ID, nowMs: () => 1_800_000_000_000 };
    const repositories: Repositories = {
      logRepo: createLogRepo(store, options),
      settingsRepo: createSettingsRepo(store, options),
    };
    const onBack = vi.fn();
    render(
      <RepositoriesContext.Provider value={repositories}>
        <PortableDataScreen onBack={onBack} />
      </RepositoriesContext.Provider>,
      root,
    );
    const createdObjectUrl = vi.fn(() => 'blob:synthetic-export');
    const revokedObjectUrl = vi.fn();
    const clickedAnchors: HTMLAnchorElement[] = [];
    const nativeUrl = globalThis.URL;
    class TestURL extends nativeUrl {
      static override createObjectURL = createdObjectUrl;
      static override revokeObjectURL = revokedObjectUrl;
    }
    vi.stubGlobal('URL', TestURL);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchors.push(this);
    });

    await click(root, 'Download JSON export');
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Your JSON export is ready to save.',
    );
    expect(clickedAnchors.at(-1)?.download).toBe('data-export.json');

    await click(root, 'Share JSON export');
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Sharing is not available here, so your JSON export is ready to save.',
    );
    expect(clickedAnchors.at(-1)?.download).toBe('data-export.json');

    const tracker = root.querySelector<HTMLSelectElement>('#portable-tracker');
    if (!tracker) throw new Error('Portable tracker selector is missing.');
    await act(async () => {
      tracker.value = 'mood';
      tracker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(root, 'Download tracker CSV');
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 5));
    });
    expect(clickedAnchors.at(-1)?.download).toBe('data-export-mood.csv');
    expect(createdObjectUrl).toHaveBeenCalledTimes(3);
    expect(revokedObjectUrl).toHaveBeenCalledTimes(3);

    await click(root, 'Back to settings');
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('previews valid imports without writing, confirms the import, and rejects invalid/newer files accessibly', async () => {
    const { root, settingsRepo } = fixture();
    const document = createPortableDocument([profileRecord()], SCHEMA_VERSION);
    const validFile = new File([JSON.stringify(document)], 'synthetic-valid.json', {
      type: 'application/json',
    });

    await selectFile(root, new File(['not json'], 'synthetic-invalid.json'));
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'This file is not a valid data export. Nothing was imported.',
    );
    expect(root.querySelector('[aria-label="Import preview summary"]')).toBeNull();

    const newerFile = new File(
      [
        JSON.stringify({
          ...document,
          schemaVersion: SCHEMA_VERSION + 1,
        }),
      ],
      'synthetic-newer.json',
    );
    await selectFile(root, newerFile);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'This file was created by a newer app version.',
    );

    await selectFile(root, validFile);
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Review this dry-run summary. No data has been changed.',
    );
    expect(root.querySelector('[aria-label="Import preview summary"]')?.textContent).toContain(
      'Profile: 1',
    );
    await expect(settingsRepo.getProfile()).resolves.toBeUndefined();

    await click(root, 'Import these records');
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Your data was imported.',
    );
    await expect(settingsRepo.getProfile()).resolves.toMatchObject({
      theme: 'dark',
      units: { temp: 'celsius', weight: 'kg' },
    });
    expect(root.querySelector('[aria-label="Import preview summary"]')).not.toBeNull();
  });

  it('uses the native share sheet when available and presents safe export errors', async () => {
    const { root, repositories } = fixture();
    const share = vi.fn(async () => undefined);
    const canShare = vi.fn(() => true);
    vi.stubGlobal('navigator', { share, canShare });
    const createdObjectUrl = vi.fn(() => 'blob:synthetic-share-fallback');
    const nativeUrl = globalThis.URL;
    class TestURL extends nativeUrl {
      static override createObjectURL = createdObjectUrl;
      static override revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', TestURL);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await click(root, 'Share JSON export');
    expect(canShare).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Data export', files: [expect.any(File)] }),
    );
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Your data was shared using the device share sheet.',
    );
    expect(createdObjectUrl).not.toHaveBeenCalled();

    share.mockRejectedValueOnce(new Error('synthetic share permission failure'));
    await click(root, 'Share JSON export');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Your data could not be shared. You can still download an export.',
    );

    vi.spyOn(
      repositories.logRepo as unknown as {
        listPortableRecords(): Promise<readonly LogicalRecord[]>;
      },
      'listPortableRecords',
    ).mockRejectedValue(
      new Error('synthetic export failure'),
    );
    await click(root, 'Download JSON export');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Your data could not be exported. Please try again.',
    );
  });
});
