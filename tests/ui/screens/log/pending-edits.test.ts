import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../../../src/ui/screens/log/types.ts';
import {
  getPendingEdits,
  updatePendingTrackerDrafts,
} from '../../../../src/ui/screens/log/pending-edits.ts';

const flow: LogEntry = { tracker: 'flow', value: 'medium' };
const mood: LogEntry = { tracker: 'mood', value: ['calm'] };

describe('pending log edits', () => {
  it('keeps edits from multiple trackers while switching and saves them together', () => {
    const withFlow = updatePendingTrackerDrafts({}, 'flow', [flow], true);
    const withBoth = updatePendingTrackerDrafts(withFlow, 'mood', [mood], true);

    expect(getPendingEdits(withBoth)).toEqual({
      entries: [flow, mood],
      dirtyTrackers: ['flow', 'mood'],
    });
  });

  it('replaces a tracker draft and removes it when it returns to its saved value', () => {
    const initial = updatePendingTrackerDrafts({}, 'flow', [flow], true);
    const replaced = updatePendingTrackerDrafts(
      initial,
      'flow',
      [{ tracker: 'flow', value: 'light' }],
      true,
    );

    expect(getPendingEdits(replaced).entries).toEqual([{ tracker: 'flow', value: 'light' }]);
    expect(updatePendingTrackerDrafts(replaced, 'flow', [], false)).toEqual({});
  });

  it('keeps an incomplete dirty tracker visible without persisting an invalid value', () => {
    const drafts = updatePendingTrackerDrafts({}, 'weight', [], true);

    expect(getPendingEdits(drafts)).toEqual({ entries: [], dirtyTrackers: ['weight'] });
  });
});
