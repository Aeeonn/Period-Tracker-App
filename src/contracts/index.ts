/**
 * Shared contracts (architecture.md §3: "All interfaces live in
 * `src/contracts/`"). Modules depend only on these contracts, never on each
 * other's internals. A change needs an ADR and a foundation task, and bumps
 * `CONTRACTS_VERSION` when it is not backward compatible.
 */
export const CONTRACTS_VERSION = 1 as const;

export * from './brand.ts';
export * from './localdate.ts';
export * from './enums.ts';
export * from './entities.ts';
export * from './engine-api.ts';
export * from './crypto.ts';
export * from './store.ts';
export * from './lock.ts';
export * from './share.ts';
export * from './sync.ts';
export * from './pairing.ts';
export * from './couple.ts';
export * from './backup.ts';
export * from './reminders.ts';
export * from './content.ts';
