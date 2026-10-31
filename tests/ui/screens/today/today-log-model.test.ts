import { describe, expect, it } from 'vitest';
import {
  flowForBleedingAnswer,
  isPeriodStartedFlow,
  loggedTodayWithFlow,
} from '../../../../src/ui/screens/today/today-log-model.ts';

describe('Today flow selection', () => {
  it('maps each bleeding answer to one saved flow value', () => {
    expect(flowForBleedingAnswer('Yes, light')).toBe('light');
    expect(flowForBleedingAnswer('Yes, medium')).toBe('medium');
    expect(flowForBleedingAnswer('Yes, heavy')).toBe('heavy');
    expect(flowForBleedingAnswer('Stopped')).toBe('none');
  });

  it('selects period started for any saved non-none flow, but not none or absent', () => {
    expect(isPeriodStartedFlow(undefined)).toBe(false);
    expect(isPeriodStartedFlow('none')).toBe(false);
    expect(isPeriodStartedFlow('spotting')).toBe(true);
    expect(isPeriodStartedFlow('medium')).toBe(true);
  });

  it('deduplicates fixture summaries and replaces or clears one flow entry', () => {
    const fixture = ['Flow: Medium', 'Cramps', 'Cramps'];
    expect(loggedTodayWithFlow(fixture, 'heavy', true)).toEqual(['Cramps', 'Flow: Heavy']);
    expect(loggedTodayWithFlow(fixture, undefined, true)).toEqual(['Cramps']);
    expect(loggedTodayWithFlow(['Cramps', 'Cramps'], undefined)).toEqual(['Cramps']);
  });
});
