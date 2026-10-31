import type { EngineOutput } from '../../../contracts/engine-api.ts';
import type { LocalDate } from '../../../contracts/localdate.ts';
import { parse } from '../../../lib/localdate/index.ts';
import { TODAY_PREVIEW_FIXTURE } from '../today/preview-fixtures.ts';

function localDate(value: string): LocalDate {
  const date = parse(value);
  if (date === null) throw new RangeError(`Invalid synthetic LocalDate: ${value}`);
  return date;
}

const sourceOutput = TODAY_PREVIEW_FIXTURE.engineOutput;
const syntheticAssumedDay = localDate('2026-10-13');
const syntheticSpottingDay = localDate('2026-10-14');

/** Synthetic-only calendar preview with extra marker examples overlaid on EngineOutput. */
const engineOutput: EngineOutput = {
  ...sourceOutput,
  episodes: sourceOutput.episodes.map((episode) =>
    episode.start === localDate('2026-10-11')
      ? {
          ...episode,
          assumedDays: [...episode.assumedDays, syntheticAssumedDay],
          spottingDays: [...episode.spottingDays, syntheticSpottingDay],
        }
      : episode,
  ),
};

export const CALENDAR_PREVIEW_FIXTURE = {
  engineOutput,
  today: TODAY_PREVIEW_FIXTURE.today,
  logDates: [TODAY_PREVIEW_FIXTURE.today],
} as const;
