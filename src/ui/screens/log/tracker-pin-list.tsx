import type { Tracker } from '../../../contracts/enums.ts';
import { Button } from '../../components/base';
import { TRACKER_LABELS } from './types.ts';
import './tracker-pin-list.css';

export interface TrackerPinListProps {
  /** Every tracker that can be pinned, in catalogue order. */
  readonly trackers: readonly Tracker[];
  /** Pinned trackers, in the order the user arranged them. */
  readonly pinnedTrackers: readonly Tracker[];
  readonly onMove: (tracker: Tracker, offset: -1 | 1) => void;
  readonly onToggle: (tracker: Tracker) => void;
}

/**
 * One compact row per tracker. Pinned trackers come first, in the user's own
 * order, so moving one visibly moves its row; the rest follow in catalogue order.
 */
export function TrackerPinList({ trackers, pinnedTrackers, onMove, onToggle }: TrackerPinListProps) {
  const pinned = pinnedTrackers.filter((tracker) => trackers.includes(tracker));
  const ordered = [...pinned, ...trackers.filter((tracker) => !pinned.includes(tracker))];

  return (
    <ul class="tracker-pin-list">
      {ordered.map((tracker) => {
        const index = pinnedTrackers.indexOf(tracker);
        const isPinned = index >= 0;
        const label = TRACKER_LABELS[tracker];
        return (
          <li class="tracker-pin-list__item" data-pinned={isPinned ? 'true' : 'false'} key={tracker}>
            <span class="tracker-pin-list__label">{label}</span>
            <div class="tracker-pin-list__actions">
              {isPinned ? (
                <>
                  <Button
                    class="tracker-pin-list__move"
                    variant="quiet"
                    aria-label={`Move ${label} up`}
                    disabled={index === 0}
                    onClick={() => onMove(tracker, -1)}
                  >
                    <span aria-hidden="true">↑</span>
                  </Button>
                  <Button
                    class="tracker-pin-list__move"
                    variant="quiet"
                    aria-label={`Move ${label} down`}
                    disabled={index === pinnedTrackers.length - 1}
                    onClick={() => onMove(tracker, 1)}
                  >
                    <span aria-hidden="true">↓</span>
                  </Button>
                </>
              ) : null}
              <Button
                class="tracker-pin-list__toggle"
                variant={isPinned ? 'secondary' : 'primary'}
                aria-label={isPinned ? `Hide ${label}` : `Pin ${label}`}
                onClick={() => onToggle(tracker)}
              >
                {isPinned ? 'Hide' : 'Pin'}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
