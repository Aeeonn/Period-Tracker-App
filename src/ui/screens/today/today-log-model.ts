import type { Flow } from '../../../contracts/enums.ts';

export const STILL_BLEEDING_ANSWERS = [
  'Yes, light',
  'Yes, medium',
  'Yes, heavy',
  'Stopped',
] as const;

export function flowForBleedingAnswer(answer: (typeof STILL_BLEEDING_ANSWERS)[number]): Flow {
  switch (answer) {
    case 'Yes, light':
      return 'light';
    case 'Yes, medium':
      return 'medium';
    case 'Yes, heavy':
      return 'heavy';
    case 'Stopped':
      return 'none';
  }
}

export function isPeriodStartedFlow(flow: Flow | undefined): boolean {
  return flow !== undefined && flow !== 'none';
}

function displayValue(value: Flow): string {
  return value.replaceAll('_', ' ').replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
}

export function loggedTodayWithFlow(
  loggedToday: readonly string[],
  flow: Flow | undefined,
  replaceFlow = false,
): readonly string[] {
  const unique = [...new Set(loggedToday)];
  const withoutFlow = replaceFlow
    ? unique.filter(
        (entry) =>
          !entry.startsWith('Flow:') &&
          entry !== 'Period started' &&
          !entry.startsWith('Bleeding:'),
      )
    : unique;
  return flow === undefined || !replaceFlow
    ? withoutFlow
    : [...withoutFlow, `Flow: ${displayValue(flow)}`];
}
