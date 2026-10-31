import type { DayBundle } from '../../../contracts/entities.ts';
import { TRACKERS, type Tracker } from '../../../contracts/enums.ts';
import { optionLabel, TRACKER_LABELS } from './types.ts';

export interface DaySummaryItem {
  readonly tracker: Tracker;
  readonly label: string;
  readonly value: string;
}

function formatValue(value: unknown, preserveText: boolean): string {
  if (typeof value === 'string') return preserveText ? value : optionLabel(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.length === 0
      ? 'None recorded'
      : value.map((item) => formatValue(item, false)).join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    const fields = Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined);
    if (fields.length === 0) return 'None recorded';
    return fields
      .map(([key, fieldValue]) => {
        const readableKey = optionLabel(key.replace(/([a-z0-9])([A-Z])/gu, '$1_$2'));
        return `${readableKey}: ${formatValue(fieldValue, false)}`;
      })
      .join('; ');
  }
  return 'None recorded';
}

export function formatDaySummary(day: DayBundle | undefined): readonly DaySummaryItem[] {
  if (day === undefined) return [];
  return TRACKERS.flatMap((tracker) => {
    const value = day[tracker];
    if (value === undefined) return [];
    return [
      {
        tracker,
        label: TRACKER_LABELS[tracker],
        value: formatValue(value, tracker === 'notes'),
      },
    ];
  });
}
