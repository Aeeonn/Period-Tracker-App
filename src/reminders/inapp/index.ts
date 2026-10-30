import type { DueReminder, ReminderContext, ReminderService } from '../../contracts/reminders.ts';
import type { IsoWeekday } from '../../contracts/enums.ts';
import { ISO_WEEKDAYS } from '../../contracts/enums.ts';
import { addDays, compare, epochDay } from '../../lib/localdate/index.ts';

/** The one-time period-start prompt is scheduled two LocalDates before the prediction center. */
export const PERIOD_START_REMINDER_LEAD_DAYS: number = 2;

/** The in-app service deliberately implements evaluation only; push belongs to a separate task. */
export type InAppReminderService = Pick<ReminderService, 'evaluate'>;

function weekdayOf(date: ReminderContext['today']): IsoWeekday {
  // 1970-01-01 was Thursday (ISO weekday 4). LocalDate arithmetic stays in A0.
  const mondayBasedIndex = (((Number(epochDay(date)) + 3) % 7) + 7) % 7;
  const weekday = ISO_WEEKDAYS[mondayBasedIndex];
  if (weekday === undefined) throw new RangeError('LocalDate weekday is outside ISO range');
  return weekday;
}

function isScheduledNow(rule: ReminderContext['rules'][number], context: ReminderContext): boolean {
  return rule.days.includes(weekdayOf(context.today)) && context.now >= rule.localTime;
}

function isEpisodeOpenToday(
  episode: ReminderContext['engineOutput']['episodes'][number],
  context: ReminderContext,
): boolean {
  if (compare(episode.start, context.today) > 0) return false;
  return (
    compare(context.today, episode.end) <= 0 ||
    episode.assumedDays.some((date) => compare(date, context.today) === 0)
  );
}

function hasOpenBleedingEpisode(context: ReminderContext): boolean {
  const todayLog = context.recentDayLogs.find((log) => compare(log.localDate, context.today) === 0);
  return context.engineOutput.episodes.some((episode) => {
    if (!isEpisodeOpenToday(episode, context)) return false;
    if (episode.kind === 'postpartum_lochia') return todayLog?.lochia !== 'none';
    return todayLog?.flow !== 'none';
  });
}

function periodStartWindowIsDue(context: ReminderContext): boolean {
  const prediction = context.engineOutput.prediction;
  if (prediction.kind !== 'prediction') return false;
  if (!context.engineOutput.episodes.some((episode) => episode.kind === 'period')) return false;

  const targetDate = addDays(prediction.center, -PERIOD_START_REMINDER_LEAD_DAYS);
  if (compare(context.today, targetDate) !== 0) return false;

  const startedInOrAfterWindow = context.engineOutput.episodes.some(
    (episode) =>
      compare(episode.start, targetDate) >= 0 && compare(episode.start, context.today) <= 0,
  );
  return !startedInOrAfterWindow && !hasOpenBleedingEpisode(context);
}

function customConditionIsDue(
  condition: ReminderContext['rules'][number]['condition'],
  context: ReminderContext,
): boolean {
  switch (condition) {
    case 'always':
      return true;
    case 'during_bleeding':
      return hasOpenBleedingEpisode(context);
    case 'near_predicted_start':
      return periodStartWindowIsDue(context);
    case 'pill_schedule':
      return false;
  }
}

function isRuleDue(rule: ReminderContext['rules'][number], context: ReminderContext): boolean {
  if (!rule.enabled || !isScheduledNow(rule, context)) return false;

  switch (rule.kind) {
    case 'still_bleeding':
      return rule.condition === 'during_bleeding' && hasOpenBleedingEpisode(context);
    case 'daily_symptom_log':
      return (
        rule.condition === 'always' &&
        !context.recentDayLogs.some(
          (log) => compare(log.localDate, context.today) === 0 && log.symptoms_body !== undefined,
        )
      );
    case 'period_start_window':
      return rule.condition === 'near_predicted_start' && periodStartWindowIsDue(context);
    case 'custom':
      return customConditionIsDue(rule.condition, context);
    case 'pill':
      // Pill reminders are a P4 feature and are intentionally not evaluated here.
      return false;
  }
}

/**
 * Pure unlocked-app evaluation. `today` and `now` in ReminderContext are the caller's
 * injected local-clock snapshot; this function never reads a clock or mutates input.
 */
export function evaluateReminders(context: ReminderContext): readonly DueReminder[] {
  return context.rules
    .filter((rule) => isRuleDue(rule, context))
    .map(({ id, kind }) => ({ ruleId: id, kind }));
}

export const inAppReminderService: InAppReminderService = {
  evaluate: evaluateReminders,
};
