import type { LogicalRecord, Migration } from '../../contracts/store.ts';
import { SCHEMA_VERSION } from '../store/schema.ts';

export const MIGRATIONS: readonly Migration[] = [
  {
    from: 0,
    to: 1,
    migrate(records: readonly LogicalRecord[]): readonly LogicalRecord[] {
      return records;
    },
  },
];

export { SCHEMA_VERSION };
