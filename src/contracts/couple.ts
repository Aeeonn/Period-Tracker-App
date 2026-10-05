/**
 * `CoupleRepo` (architecture.md §3 `couple`, §4.4; ux-spec.md §3.9).
 * Couple entries are sealed with the couple key CPK and written only by their
 * author. Her "use in my insights" flag is a separate record she writes.
 */
import type { CoupleEntryId } from './brand.ts';
import type { CoupleEntryKind, LoveNoteDisplayMode } from './enums.ts';
import type { CoupleEntry, CoupleEntryFieldsByKind, CoupleFlag } from './entities.ts';
import type { LocalDate } from './localdate.ts';
import type { Unsubscribe } from './store.ts';

export interface NewCoupleEntry<K extends CoupleEntryKind = CoupleEntryKind> {
  readonly kind: K;
  readonly localDate: LocalDate;
  readonly fields: CoupleEntryFieldsByKind[K];
}

export type CoupleEditResult =
  { readonly ok: true } | { readonly ok: false; readonly error: 'not_author' | 'not_found' };

export interface CoupleRepo {
  /** Entries visible on this device (entries hidden for me are omitted). */
  list(): Promise<readonly CoupleEntry[]>;
  add<K extends CoupleEntryKind>(entry: NewCoupleEntry<K>): Promise<CoupleEntry>;
  /** Author only (architecture.md §4.4). */
  edit(
    id: CoupleEntryId,
    fields: CoupleEntryFieldsByKind[CoupleEntryKind],
  ): Promise<CoupleEditResult>;
  /** Author only; writes a tombstone. */
  remove(id: CoupleEntryId): Promise<CoupleEditResult>;
  /** Local "hide for me"; never synced to the other person. */
  hideForMe(id: CoupleEntryId, hidden: boolean): Promise<void>;
  /** Owner device only: her separate flag record (CR-13). */
  setAllowInHerInsights(id: CoupleEntryId, allow: boolean): Promise<CoupleFlag>;
  /** Owner device only: entries she allowed, for `EngineInput` (CR-13). */
  listAllowedForInsights(): Promise<readonly CoupleEntry[]>;
  /** Owner device only: her love-note display choice (CR-18). */
  getLoveNoteDisplayMode(): Promise<LoveNoteDisplayMode>;
  setLoveNoteDisplayMode(mode: LoveNoteDisplayMode): Promise<void>;
  onChange(listener: () => void): Unsubscribe;
}
