import { useState } from 'preact/hooks';
import type { DayBundle } from '../../../contracts/entities.ts';
import type { EngineOutput } from '../../../contracts/engine-api.ts';
import type { LocalDate } from '../../../contracts/localdate.ts';
import { compare } from '../../../lib/localdate/index.ts';
import { Button } from '../../components/base';
import { formatDaySummary } from '../log/day-summary.ts';
import {
  CALENDAR_MARKER_LABELS,
  CALENDAR_MONTH_NAMES,
  CALENDAR_WEEKDAYS,
  cycleForDate,
  fullDateLabel,
  markersForDate,
  monthCells,
  monthLabel,
  monthStart,
  shiftMonth,
  type CalendarMarker,
} from './calendar-model.ts';
import './calendar.css';

export type CalendarOverride =
  | { readonly type: 'period-started'; readonly date: LocalDate }
  | { readonly type: 'period-did-not-start'; readonly date: LocalDate }
  | { readonly type: 'exclude-cycle'; readonly start: LocalDate; readonly nextStart: LocalDate };

export interface CalendarScreenProps {
  readonly engineOutput: EngineOutput;
  readonly today: LocalDate;
  /** Additional synthetic or stored log dates not represented by period episodes. */
  readonly logDates?: readonly LocalDate[];
  readonly dayLogs?: readonly DayBundle[];
  readonly onEditDay?: (date: LocalDate) => void;
  readonly onOverride?: (override: CalendarOverride) => void;
}

const LEGEND_MARKERS: readonly CalendarMarker[] = [
  'logged-period',
  'assumed',
  'predicted',
  'core-fertile',
  'higher-fertile',
  'log',
  'spotting',
];

type ViewMode = 'month' | 'year';

export function CalendarScreen({
  engineOutput,
  today,
  logDates = [],
  dayLogs = [],
  onEditDay,
  onOverride,
}: CalendarScreenProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(today));
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<LocalDate | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [selectedOverride, setSelectedOverride] = useState<CalendarOverride | null>(null);
  const [excludedCycleStarts, setExcludedCycleStarts] = useState<readonly LocalDate[]>([]);

  const monthTitle = monthLabel(visibleMonth);
  const selectedMarkers = selectedDate ? markersForDate(engineOutput, selectedDate, logDates) : [];
  const selectedCycle = selectedDate ? cycleForDate(engineOutput, selectedDate) : undefined;
  const selectedDay = selectedDate
    ? dayLogs.find((dayLog) => dayLog.localDate === selectedDate)
    : undefined;
  const selectedSummary = formatDaySummary(selectedDay);
  const previewExcluded = selectedCycle ? excludedCycleStarts.includes(selectedCycle.start) : false;
  const cycleExcluded = selectedCycle?.excludedBecause !== undefined || previewExcluded;
  const dateIsFuture = selectedDate !== null && compare(selectedDate, today) > 0;

  function chooseDate(date: LocalDate): void {
    setSelectedDate(date);
    setVisibleMonth(monthStart(date));
    setSelectedOverride(null);
    setFeedback('');
  }

  function chooseMonth(date: LocalDate): void {
    setVisibleMonth(date);
    setViewMode('month');
    setSelectedDate(null);
    setFeedback('');
  }

  function changeMonth(amount: number): void {
    const next = shiftMonth(visibleMonth, amount);
    if (next === null) return;
    setVisibleMonth(next);
    setSelectedDate(null);
    setFeedback('');
  }

  function applyOverride(override: CalendarOverride): void {
    onOverride?.(override);
    setSelectedOverride(override);
    if (override.type === 'exclude-cycle') {
      setExcludedCycleStarts((current) =>
        current.includes(override.start) ? current : [...current, override.start],
      );
      setFeedback('Cycle exclusion selected in this preview. This change is not saved.');
      return;
    }
    setFeedback('Period override selected in this preview. This change is not saved.');
  }

  const cells = monthCells(visibleMonth);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
  const previousMonth = shiftMonth(visibleMonth, -1);
  const nextMonth = shiftMonth(visibleMonth, 1);
  const year = Number(visibleMonth.slice(0, 4));

  return (
    <section class="calendar-screen" aria-labelledby="calendar-title">
      <header class="calendar-screen__header">
        <p class="calendar-screen__eyebrow">A gentle view of your cycle</p>
        <h1 id="calendar-title">Calendar</h1>
        <p>Explore cycle days and the notes you have logged.</p>
      </header>

      <section class="calendar-card" aria-label="Cycle calendar">
        <div class="calendar-toolbar">
          <Button
            class="calendar-toolbar__arrow"
            variant="quiet"
            aria-label={`Previous ${viewMode === 'month' ? 'month' : 'year'}`}
            disabled={viewMode === 'month' ? previousMonth === null : year === 0}
            onClick={() => {
              if (viewMode === 'month') changeMonth(-1);
              else setVisibleMonth(shiftMonth(visibleMonth, -12) ?? visibleMonth);
              setSelectedDate(null);
            }}
          >
            <span aria-hidden="true">&lsaquo;</span>
          </Button>
          <h2 id="calendar-period" aria-live="polite">
            {viewMode === 'month' ? monthTitle : year}
          </h2>
          <Button
            class="calendar-toolbar__arrow"
            variant="quiet"
            aria-label={`Next ${viewMode === 'month' ? 'month' : 'year'}`}
            disabled={viewMode === 'month' ? nextMonth === null : year === 9999}
            onClick={() => {
              if (viewMode === 'month') changeMonth(1);
              else setVisibleMonth(shiftMonth(visibleMonth, 12) ?? visibleMonth);
              setSelectedDate(null);
            }}
          >
            <span aria-hidden="true">&rsaquo;</span>
          </Button>
          <Button
            class="calendar-toolbar__view"
            variant={viewMode === 'month' ? 'primary' : 'secondary'}
            aria-pressed={viewMode === 'month'}
            onClick={() => setViewMode('month')}
          >
            Month
          </Button>
          <Button
            class="calendar-toolbar__view"
            variant={viewMode === 'year' ? 'primary' : 'secondary'}
            aria-pressed={viewMode === 'year'}
            onClick={() => {
              setViewMode('year');
              setSelectedDate(null);
            }}
          >
            Year
          </Button>
          <Button
            class="calendar-toolbar__info"
            variant="secondary"
            aria-label="Open calendar legend"
            aria-expanded={legendOpen}
            aria-controls={legendOpen ? 'calendar-legend' : undefined}
            onClick={() => setLegendOpen((open) => !open)}
          >
            <span aria-hidden="true">&#9432;</span>
          </Button>
        </div>

        {viewMode === 'month' ? (
          <div class="calendar-month" aria-labelledby="calendar-period">
            <div class="calendar-grid" role="grid" aria-label={`${monthTitle} calendar`}>
              <div class="calendar-grid__weekdays" role="row">
                {CALENDAR_WEEKDAYS.map((weekday) => (
                  <span key={weekday} role="columnheader" aria-label={weekday}>
                    {weekday}
                  </span>
                ))}
              </div>
              <div class="calendar-grid__weeks" role="rowgroup">
                {weeks.map((week, weekIndex) => (
                  <div class="calendar-grid__week" role="row" key={weekIndex}>
                    {week.map((cell, dayIndex) => {
                      if (cell.date === null) {
                        return <span class="calendar-grid__empty" role="gridcell" key={dayIndex} />;
                      }
                      const date = cell.date;
                      const markers = markersForDate(engineOutput, date, logDates);
                      const labels = markers.map((marker) => CALENDAR_MARKER_LABELS[marker]);
                      const selected = selectedDate === date;
                      const classes = [
                        'calendar-day',
                        cell.inCurrentMonth ? '' : 'calendar-day--outside',
                        date === today ? 'calendar-day--today' : '',
                        selected ? 'calendar-day--selected' : '',
                        ...markers.map((marker) => `calendar-day--${marker}`),
                      ]
                        .filter(Boolean)
                        .join(' ');
                      const visibleMarkers = markers.filter(
                        (marker) =>
                          !(marker === 'core-fertile' && markers.includes('higher-fertile')),
                      );
                      return (
                        <div class="calendar-grid__cell" role="gridcell" key={date}>
                          <button
                            type="button"
                            class={classes}
                            aria-label={`${fullDateLabel(date)}${labels.length ? `, ${labels.join(', ')}` : ''}`}
                            aria-pressed={selected}
                            aria-current={date === today ? 'date' : undefined}
                            onClick={() => chooseDate(date)}
                          >
                            <span class="calendar-day__number">{Number(date.slice(8, 10))}</span>
                            <span class="calendar-day__markers" aria-hidden="true">
                              {visibleMarkers.map((marker) =>
                                marker === 'higher-fertile' ? (
                                  <span class="calendar-marker-group" key={marker}>
                                    <span class={`calendar-marker calendar-marker--${marker}`} />
                                    <span class="calendar-marker calendar-marker--higher-fertile calendar-marker--second" />
                                  </span>
                                ) : (
                                  <span
                                    class={`calendar-marker calendar-marker--${marker}`}
                                    key={marker}
                                  />
                                ),
                              )}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div class="calendar-year-grid" role="grid" aria-label={`${year} months`}>
            {CALENDAR_MONTH_NAMES.map((name, index) => {
              const date = shiftMonth(visibleMonth, index + 1 - Number(visibleMonth.slice(5, 7)));
              if (date === null) return null;
              const monthMarkers = [
                ...new Set(
                  monthCells(date).flatMap((cell) =>
                    cell.date && cell.inCurrentMonth
                      ? markersForDate(engineOutput, cell.date, logDates)
                      : [],
                  ),
                ),
              ];
              const markerLabel = monthMarkers
                .map((marker) => CALENDAR_MARKER_LABELS[marker])
                .join(', ');
              return (
                <button
                  class="calendar-year-grid__month"
                  type="button"
                  key={name}
                  aria-label={`View ${name} ${year}${markerLabel ? `, ${markerLabel}` : ''}`}
                  onClick={() => chooseMonth(date)}
                >
                  <span>{name}</span>
                  <span class="calendar-year-grid__markers" aria-hidden="true">
                    {monthMarkers
                      .filter(
                        (marker) =>
                          !(marker === 'core-fertile' && monthMarkers.includes('higher-fertile')),
                      )
                      .map((marker) =>
                        marker === 'higher-fertile' ? (
                          <span class="calendar-marker-group" key={marker}>
                            <span class={`calendar-marker calendar-marker--${marker}`} />
                            <span class="calendar-marker calendar-marker--higher-fertile calendar-marker--second" />
                          </span>
                        ) : (
                          <span class={`calendar-marker calendar-marker--${marker}`} key={marker} />
                        ),
                      )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {legendOpen ? (
        <section
          class="calendar-legend"
          id="calendar-legend"
          aria-labelledby="calendar-legend-title"
        >
          <div class="calendar-legend__heading">
            <h2 id="calendar-legend-title">Calendar legend</h2>
            <Button
              variant="quiet"
              aria-label="Close calendar legend"
              onClick={() => setLegendOpen(false)}
            >
              Close
            </Button>
          </div>
          <ul>
            {LEGEND_MARKERS.map((marker) => (
              <li key={marker}>
                {marker === 'higher-fertile' ? (
                  <span class="calendar-marker-group" aria-hidden="true">
                    <span class={`calendar-marker calendar-marker--${marker}`} />
                    <span class="calendar-marker calendar-marker--higher-fertile calendar-marker--second" />
                  </span>
                ) : (
                  <span class={`calendar-marker calendar-marker--${marker}`} aria-hidden="true" />
                )}
                <span>{CALENDAR_MARKER_LABELS[marker]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {selectedDate ? (
        <section class="calendar-day-detail" aria-labelledby="calendar-day-detail-title">
          <div class="calendar-day-detail__heading">
            <p class="calendar-screen__eyebrow">Day details</p>
            <h2 id="calendar-day-detail-title">{fullDateLabel(selectedDate)}</h2>
          </div>
          <p>
            {selectedMarkers.length
              ? `Markers: ${selectedMarkers.map((marker) => CALENDAR_MARKER_LABELS[marker]).join(', ')}.`
              : 'No cycle markers or logs for this day.'}
          </p>
          <section class="calendar-day-detail__logged" aria-label="Logged entries">
            <h3>What you logged</h3>
            {selectedSummary.length > 0 ? (
              <ul>
                {selectedSummary.map((item) => (
                  <li key={item.tracker}>
                    <span>{item.label}:</span> {item.value}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nothing logged yet</p>
            )}
          </section>
          {selectedCycle ? (
            <p class="calendar-day-detail__cycle">
              Cycle starting {fullDateLabel(selectedCycle.start)}
              {cycleExcluded ? ' - excluded from cycle statistics' : ''}
            </p>
          ) : null}
          <div class="calendar-day-detail__actions">
            <Button onClick={() => onEditDay?.(selectedDate)} disabled={!onEditDay}>
              Edit this day
            </Button>
            <Button
              variant="secondary"
              disabled={dateIsFuture}
              aria-pressed={selectedOverride?.type === 'period-started'}
              onClick={() => applyOverride({ type: 'period-started', date: selectedDate })}
            >
              Period started here
            </Button>
            <Button
              variant="secondary"
              disabled={dateIsFuture}
              aria-pressed={selectedOverride?.type === 'period-did-not-start'}
              onClick={() => applyOverride({ type: 'period-did-not-start', date: selectedDate })}
            >
              Period did not start here
            </Button>
            <Button
              variant="secondary"
              disabled={!selectedCycle || cycleExcluded}
              aria-pressed={previewExcluded}
              onClick={() => {
                if (selectedCycle) {
                  applyOverride({
                    type: 'exclude-cycle',
                    start: selectedCycle.start,
                    nextStart: selectedCycle.nextStart,
                  });
                }
              }}
            >
              {cycleExcluded ? 'Cycle excluded' : 'Exclude this cycle'}
            </Button>
          </div>
          {feedback ? (
            <p class="calendar-day-detail__feedback" role="status">
              {feedback}
            </p>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
