export interface PersistenceStatus {
  readonly supported: boolean;
  readonly persisted: boolean;
  readonly requested: boolean;
}

export interface StoragePersistenceApi {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

/** Requests durable storage and always reports the browser's resulting status. */
export async function persistStorage(
  storage: StoragePersistenceApi | undefined = globalThis.navigator?.storage,
): Promise<PersistenceStatus> {
  if (
    !storage ||
    typeof storage.persisted !== 'function' ||
    typeof storage.persist !== 'function'
  ) {
    return { supported: false, persisted: false, requested: false };
  }
  let alreadyPersisted = false;
  try {
    alreadyPersisted = await storage.persisted();
  } catch {
    alreadyPersisted = false;
  }
  if (alreadyPersisted) return { supported: true, persisted: true, requested: false };

  try {
    await storage.persist();
  } catch {
    // The follow-up status probe still determines the resulting state.
  }
  let persisted = false;
  try {
    persisted = await storage.persisted();
  } catch {
    persisted = false;
  }
  return { supported: true, persisted, requested: true };
}
