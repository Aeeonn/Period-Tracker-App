import type { DayBundle } from '../../../contracts/entities.ts';
import type { LogRepo, SettingsRepo } from '../../../contracts/store.ts';
import type { LocalDate, LocalTime } from '../../../contracts/localdate.ts';
import { parse } from '../../../lib/localdate/index.ts';
import { createTodayScreenProps } from '../today/live-data.ts';
import type { CalendarScreenProps } from './calendar-screen.tsx';

export interface CalendarRepositories {
  readonly logRepo: Pick<LogRepo, 'listDays' | 'listOverrides'>;
  readonly settingsRepo: Pick<
    SettingsRepo,
    'getProfile' | 'listContraception' | 'listPregnancies' | 'listReminders'
  >;
}

export interface CalendarClockSnapshot {
  readonly today: LocalDate;
  readonly now: LocalTime;
}

function requiredLocalDate(value: string): LocalDate {
  const date = parse(value);
  if (date === null) throw new RangeError(`Invalid LocalDate bound: ${value}`);
  return date;
}

const FIRST_LOCAL_DATE = requiredLocalDate('0000-01-01');
const LAST_LOCAL_DATE = requiredLocalDate('9999-12-31');

export async function createCalendarScreenProps(
  repositories: CalendarRepositories,
  clock: CalendarClockSnapshot,
): Promise<CalendarScreenProps> {
  const [todayProps, allDays] = await Promise.all([
    createTodayScreenProps(repositories, clock),
    repositories.logRepo.listDays({ start: FIRST_LOCAL_DATE, end: LAST_LOCAL_DATE }),
  ]);
  const dayLogs: readonly DayBundle[] = allDays;
  return {
    engineOutput: todayProps.engineOutput,
    today: todayProps.today,
    logDates: dayLogs.map((dayLog) => dayLog.localDate),
    dayLogs,
  };
}
