// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceId } from '../../../../src/contracts/brand.ts';
import type { EngineOutput } from '../../../../src/contracts/engine-api.ts';
import type { LogRepo } from '../../../../src/ui/screens/log/types.ts';
import { createLogRepo } from '../../../../src/data/repos/index.ts';
import { contentSourcesById } from '../../../../src/content/index.ts';
import { TodayScreen } from '../../../../src/ui/screens/today/today-screen.tsx';
import {
  TODAY_EMERGENCY_FIXTURE,
  TODAY_NO_DATA_FIXTURE,
  TODAY_PREVIEW_FIXTURE,
} from '../../../../src/ui/screens/today/preview-fixtures.ts';
import { MemoryRecordStore } from '../../../data/repos/memory-record-store.ts';

const DEVICE_ID = 'synthetic-today-screen-device' as DeviceId;
const roots: HTMLElement[] = [];

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  return root;
}

async function click(root: HTMLElement, label: string): Promise<void> {
  const target = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(target instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  await act(async () => {
    target.click();
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

describe('Today screen accessible behavior', () => {
  it('explains ring segments, opens the first-period quick log, and keeps emergency guidance non-dismissible', async () => {
    const root = mount();
    render(<TodayScreen {...TODAY_NO_DATA_FIXTURE} logRepo={null} />, root);

    expect(root.querySelector('h1')?.textContent).toBe('Today');
    expect(root.querySelector('[role="img"][aria-label="Cycle ring"]')).not.toBeNull();
    expect(root.textContent).toContain('Log your first period');
    expect(root.querySelector('[data-testid="today-content-card"]')?.textContent).toContain(
      'Cycle basics',
    );
    expect(root.querySelector('.today-content-slot__sources a')?.getAttribute('href')).toBe(
      'https://www.nhs.uk/symptoms/irregular-periods/',
    );
    await click(root, 'Log first period');
    expect(root.querySelector('dialog[open][aria-modal="true"]')).not.toBeNull();
    expect(
      [...root.querySelectorAll('fieldset')].some(
        (fieldset) => fieldset.querySelector('legend')?.textContent === 'Flow level',
      ),
    ).toBe(true);

    render(null, root);
    render(<TodayScreen {...TODAY_EMERGENCY_FIXTURE} logRepo={null} />, root);
    const warning = root.querySelector('[role="alert"]');
    expect(warning?.textContent).toContain(
      'Very heavy bleeding with chest pain, breathlessness, or dizziness needs emergency care now.',
    );
    expect(warning?.textContent).toContain('Abnormal Uterine Bleeding');
    expect(root.textContent).toContain('Cannot dismiss while active');
    const periodControl = root.querySelector<HTMLButtonElement>(
      '[data-testid="today-ring-period-control"]',
    );
    if (!periodControl) throw new Error('Predicted period control is missing.');
    await act(async () => periodControl.click());
    expect(root.querySelector('.today-ring__explanation')?.textContent).toContain(
      'predicted period window',
    );
  });

  it('shows rule-specific copy and cited sources for W-01 through W-07 at each relevant severity', () => {
    const guidanceCases = [
      {
        ruleId: 'W-01',
        severity: 'EMERGENCY',
        copy: 'Very heavy bleeding with chest pain, breathlessness, or dizziness needs emergency care now.',
        sourceIds: ['ACOG_ABNORMAL_BLEEDING'],
      },
      {
        ruleId: 'W-02',
        severity: 'INFO',
        copy: 'The heavy-bleeding details you logged may be worth discussing with a clinician.',
        sourceIds: ['NHS_HEAVY_PERIODS', 'NICE_NG88'],
      },
      {
        ruleId: 'W-03',
        severity: 'INFO',
        copy: 'A period lasting longer than 7 days can be a reason to discuss with a clinician.',
        sourceIds: ['ACOG_ABNORMAL_BLEEDING', 'FIGO_AUB_SYSTEMS_2023'],
      },
      {
        ruleId: 'W-03',
        severity: 'DISCUSS',
        copy: 'A period lasting longer than 7 days can be a reason to discuss with a clinician.',
        sourceIds: ['ACOG_ABNORMAL_BLEEDING', 'FIGO_AUB_SYSTEMS_2023'],
      },
      {
        ruleId: 'W-04',
        severity: 'INFO',
        copy: 'A cycle shorter than 21 days or longer than 35 days can be a reason to discuss with a clinician.',
        sourceIds: ['ACOG_ABNORMAL_BLEEDING', 'FIGO_AUB_SYSTEMS_2023'],
      },
      {
        ruleId: 'W-04',
        severity: 'DISCUSS',
        copy: 'A cycle shorter than 21 days or longer than 35 days can be a reason to discuss with a clinician.',
        sourceIds: ['ACOG_ABNORMAL_BLEEDING', 'FIGO_AUB_SYSTEMS_2023'],
      },
      {
        ruleId: 'W-05',
        severity: 'DISCUSS',
        copy: 'Your cycle lengths vary; you may want to discuss this pattern with a clinician.',
        sourceIds: ['FIGO_AUB_SYSTEMS_2023'],
      },
      {
        ruleId: 'W-06',
        severity: 'INFO',
        copy: 'It has been more than 90 days since your last period. If pregnancy is possible, you may want to take a pregnancy test and discuss this gap with a clinician.',
        sourceIds: [
          'PCOS_INTERNATIONAL_GUIDELINE_2023',
          'ACOG_ABNORMAL_BLEEDING',
          'CANADA_PREGNANCY_TEST',
        ],
      },
      {
        ruleId: 'W-07',
        severity: 'INFO',
        copy: 'Bleeding after sex or between periods can be worth discussing with a clinician.',
        sourceIds: ['ACOG_ABNORMAL_BLEEDING'],
      },
    ] as const;

    for (const testCase of guidanceCases) {
      const root = mount();
      const engineOutput: EngineOutput = {
        ...TODAY_PREVIEW_FIXTURE.engineOutput,
        warnings: [
          {
            ruleId: testCase.ruleId,
            severity: testCase.severity,
            dismissible: testCase.severity !== 'EMERGENCY',
            scopeStart: TODAY_PREVIEW_FIXTURE.today,
            evidenceDates: [TODAY_PREVIEW_FIXTURE.today],
            sourceIds: testCase.sourceIds,
          },
        ],
      };
      render(
        <TodayScreen {...TODAY_PREVIEW_FIXTURE} engineOutput={engineOutput} logRepo={null} />,
        root,
      );

      const notice = root.querySelector(`[data-testid="today-warning-${testCase.ruleId}"]`);
      expect(notice?.textContent).toContain(testCase.copy);
      expect(
        [...(notice?.querySelectorAll<HTMLAnchorElement>('.today-warning__sources a') ?? [])].map(
          (link) => link.href,
        ),
      ).toEqual(testCase.sourceIds.map((sourceId) => contentSourcesById[sourceId]?.url));
      render(null, root);
    }
  });

  it('shows Canada-scoped 9-8-8 and 9-1-1 guidance for an active W-11 warning', () => {
    const root = mount();
    const engineOutput: EngineOutput = {
      ...TODAY_PREVIEW_FIXTURE.engineOutput,
      warnings: [
        {
          ruleId: 'W-11',
          severity: 'EMERGENCY',
          dismissible: false,
          scopeStart: TODAY_PREVIEW_FIXTURE.today,
          evidenceDates: [TODAY_PREVIEW_FIXTURE.today],
          sourceIds: ['CANADA_988', 'CANADA_988_ABOUT', 'CANADA_MENTAL_HEALTH'],
        },
      ],
    };
    render(
      <TodayScreen {...TODAY_PREVIEW_FIXTURE} engineOutput={engineOutput} logRepo={null} />,
      root,
    );

    const support = root.querySelector('.today-warning__crisis-support');
    expect(support?.textContent).toContain(
      'If you are in immediate danger or need urgent medical support, call 9-1-1.',
    );
    expect(support?.textContent).toContain('If you are in Canada, call or text 9-8-8');
    expect(root.querySelector('a[href="tel:988"]')?.textContent).toBe('Call 9-8-8');
    expect(root.querySelector('a[href="sms:988"]')?.textContent).toBe('Text 9-8-8');
    expect(root.querySelector('a[href="https://988.ca/"]')).not.toBeNull();
    expect(
      root.querySelector<HTMLButtonElement>('[data-testid="today-warning-dismiss-W-11"]')?.disabled,
    ).toBe(true);
  });

  it('records a displayed card and reports failures to save its history', async () => {
    const root = mount();
    const onContentShown = vi.fn(async () => undefined);
    render(
      <TodayScreen {...TODAY_PREVIEW_FIXTURE} logRepo={null} onContentShown={onContentShown} />,
      root,
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(onContentShown).toHaveBeenCalledWith(
      TODAY_PREVIEW_FIXTURE.contentSlot.cardId,
      TODAY_PREVIEW_FIXTURE.today,
    );

    render(null, root);
    render(
      <TodayScreen
        {...TODAY_PREVIEW_FIXTURE}
        logRepo={null}
        onContentShown={async () => {
          throw new Error('Synthetic profile write failure.');
        }}
      />,
      root,
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'This card’s recent display could not be saved.',
    );
  });

  it('persists a period-start entry, allows undo, and removes only today’s flow tracker', async () => {
    const root = mount();
    const store = new MemoryRecordStore();
    const logRepo: LogRepo = createLogRepo(store, {
      deviceId: DEVICE_ID,
      nowMs: () => 1_800_000_000_000,
    });
    render(<TodayScreen {...TODAY_PREVIEW_FIXTURE} logRepo={logRepo} />, root);

    await click(root, 'Period started');
    await expect(logRepo.getDay(TODAY_PREVIEW_FIXTURE.today)).resolves.toMatchObject({
      flow: 'medium',
    });
    expect(root.querySelector('.today-screen__cycle-day')?.textContent).toContain('Cycle day 1');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Saved: Period started.');

    await click(root, 'Undo');
    expect((await logRepo.getDay(TODAY_PREVIEW_FIXTURE.today))?.flow).toBeUndefined();
    expect(root.querySelector('.today-screen__cycle-day')?.textContent).toContain('Cycle day 12');

    await click(root, 'Period started');
    const remove = root.querySelector<HTMLButtonElement>(
      `button[aria-label="Remove today's period entry"]`,
    );
    if (!remove) throw new Error('Saved period entry removal control is missing.');
    await act(async () => {
      remove.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    await expect(logRepo.getDay(TODAY_PREVIEW_FIXTURE.today)).resolves.toMatchObject({
      localDate: TODAY_PREVIEW_FIXTURE.today,
    });
    expect((await logRepo.getDay(TODAY_PREVIEW_FIXTURE.today))?.flow).toBeUndefined();
  });

  it('reports a real repository save failure without displaying a successful toast', async () => {
    const root = mount();
    const store = new MemoryRecordStore();
    const logRepo = createLogRepo(store, {
      deviceId: DEVICE_ID,
      nowMs: () => 1_800_000_000_000,
    });
    vi.spyOn(logRepo, 'getDay').mockRejectedValue(new Error('synthetic store read failure'));
    render(<TodayScreen {...TODAY_PREVIEW_FIXTURE} logRepo={logRepo} />, root);

    await click(root, 'Period started');

    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'That entry could not be saved. Please try again.',
    );
    expect(root.querySelector('.ui-toast')).toBeNull();
  });
});
