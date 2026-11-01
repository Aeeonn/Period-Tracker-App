// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayBundle } from '../../../../src/contracts/entities.ts';
import { CalendarScreen } from '../../../../src/ui/screens/calendar/calendar-screen.tsx';
import { CALENDAR_PREVIEW_FIXTURE } from '../../../../src/ui/screens/calendar/preview-fixtures.ts';

const roots: HTMLElement[] = [];

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  return root;
}

function dayButton(root: HTMLElement, prefix: string): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>('.calendar-day')].find((candidate) =>
    candidate.getAttribute('aria-label')?.startsWith(prefix),
  );
  if (!button) throw new Error(`Missing calendar date button: ${prefix}`);
  return button;
}

async function click(root: HTMLElement, label: string): Promise<void> {
  const target = [...root.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent?.trim() === label || candidate.getAttribute('aria-label') === label,
  );
  if (!(target instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  await act(async () => {
    target.click();
    await Promise.resolve();
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

describe('Calendar screen accessible behavior', () => {
  it('shows logged-day details, invokes edit and override callbacks, and disables future period overrides', async () => {
    const root = mount();
    const onEditDay = vi.fn();
    const onOverride = vi.fn();
    const today = CALENDAR_PREVIEW_FIXTURE.today;
    const dayLog = {
      localDate: today,
      flow: 'medium',
      notes: 'synthetic calendar note',
      fieldHlc: {},
    } as DayBundle;
    render(
      <CalendarScreen
        {...CALENDAR_PREVIEW_FIXTURE}
        dayLogs={[dayLog]}
        onEditDay={onEditDay}
        onOverride={onOverride}
      />,
      root,
    );

    expect(root.querySelector('h1')?.textContent).toBe('Calendar');
    expect(root.querySelector('[role="grid"][aria-label="October 2026 calendar"]')).not.toBeNull();
    await act(async () => dayButton(root, 'October 22, 2026').click());
    expect(root.querySelector('#calendar-day-detail-title')?.textContent).toBe(
      'October 22, 2026',
    );
    expect(root.querySelector('.calendar-day-detail')?.textContent).toContain(
      'Flow: Medium',
    );
    expect(root.querySelector('.calendar-day-detail')?.textContent).toContain(
      'synthetic calendar note',
    );

    await click(root, 'Edit this day');
    expect(onEditDay).toHaveBeenCalledWith(today);
    await click(root, 'Period started here');
    expect(onOverride).toHaveBeenLastCalledWith({ type: 'period-started', date: today });
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'This change is not saved.',
    );
    await click(root, 'Period did not start here');
    expect(onOverride).toHaveBeenLastCalledWith({ type: 'period-did-not-start', date: today });

    await act(async () => dayButton(root, 'October 23, 2026').click());
    expect(buttonNamed(root, 'Period started here').disabled).toBe(true);
    expect(buttonNamed(root, 'Period did not start here').disabled).toBe(true);
  });

  it('supports legend and year/month navigation and previews cycle exclusion without persistence', async () => {
    const root = mount();
    const onOverride = vi.fn();
    render(
      <CalendarScreen {...CALENDAR_PREVIEW_FIXTURE} onOverride={onOverride} />,
      root,
    );

    await click(root, 'Open calendar legend');
    expect(root.querySelector('#calendar-legend')?.textContent).toContain(
      'Higher fertile day',
    );
    await click(root, 'Close calendar legend');
    expect(root.querySelector('#calendar-legend')).toBeNull();

    await click(root, 'Year');
    expect(root.querySelector('[role="grid"][aria-label="2026 months"]')).not.toBeNull();
    const october = [...root.querySelectorAll<HTMLButtonElement>('.calendar-year-grid__month')].find(
      (candidate) => candidate.getAttribute('aria-label')?.includes('View October 2026'),
    );
    if (!october) throw new Error('October 2026 year-view button is missing.');
    await act(async () => october.click());
    expect(root.querySelector('[role="grid"][aria-label="October 2026 calendar"]')).not.toBeNull();

    await click(root, 'Previous month');
    expect(root.querySelector('[role="grid"][aria-label="September 2026 calendar"]')).not.toBeNull();
    await act(async () => dayButton(root, 'September 15, 2026').click());
    await click(root, 'Exclude this cycle');
    expect(onOverride).toHaveBeenCalledWith({
      type: 'exclude-cycle',
      start: '2026-09-13',
      nextStart: '2026-10-11',
    });
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Cycle exclusion selected in this preview. This change is not saved.',
    );
    expect(buttonNamed(root, 'Cycle excluded').disabled).toBe(true);
  });
});

function buttonNamed(root: HTMLElement, name: string): HTMLButtonElement {
  const result = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!(result instanceof HTMLButtonElement)) throw new Error(`Missing button: ${name}`);
  return result;
}
