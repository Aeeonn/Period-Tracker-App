import type {
  LockService,
  RecoveryConfirmation,
  RecoveryConfirmPositions,
} from '../../src/contracts/lock.ts';
import type { LockConfiguration } from '../../src/lock/core/persistence.ts';
import type { LockPersistence } from '../../src/lock/core/persistence.ts';
import { canonicalizeRecoveryCode, createLockService } from '../../src/lock/core/service.ts';

export const SYNTHETIC_PASSPHRASE = 'synthetic harbor glimmer 74';

export class MemoryLockPersistence implements LockPersistence {
  configuration: LockConfiguration | undefined;
  failNextCommit = false;

  async read(): Promise<LockConfiguration | undefined> {
    return this.configuration;
  }

  async commit(
    configuration: LockConfiguration,
    signal: AbortSignal,
    onCommitted: () => void,
  ): Promise<void> {
    if (signal.aborted) throw new DOMException('Synthetic commit aborted', 'AbortError');
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error('Synthetic atomic commit failure');
    }
    this.configuration = configuration;
    onCommitted();
  }
}

interface DeferredCommit {
  readonly configuration: LockConfiguration;
  readonly signal: AbortSignal;
  readonly onCommitted: () => void;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  readonly abortListener: () => void;
  committing: boolean;
}

export class DeferredLockPersistence extends MemoryLockPersistence {
  private deferCommit = false;
  private inFlight: DeferredCommit | null = null;
  private announceStarted: (() => void) | null = null;
  private announceCommitting: (() => void) | null = null;
  commitCount = 0;

  deferNextCommit(): {
    readonly started: Promise<void>;
    readonly committing: Promise<void>;
    readonly finish: () => void;
  } {
    this.deferCommit = true;
    const started = new Promise<void>((resolve) => {
      this.announceStarted = resolve;
    });
    const committing = new Promise<void>((resolve) => {
      this.announceCommitting = resolve;
    });
    return {
      started,
      committing,
      finish: () => {
        const commit = this.inFlight;
        if (!commit || !commit.committing) return;
        this.configuration = commit.configuration;
        commit.onCommitted();
        commit.signal.removeEventListener('abort', commit.abortListener);
        this.inFlight = null;
        commit.resolve();
      },
    };
  }

  override async commit(
    configuration: LockConfiguration,
    signal: AbortSignal,
    onCommitted: () => void,
  ): Promise<void> {
    this.commitCount += 1;
    if (!this.deferCommit) return super.commit(configuration, signal, onCommitted);
    this.deferCommit = false;
    if (signal.aborted) throw new DOMException('Synthetic commit aborted', 'AbortError');
    await new Promise<void>((resolve, reject) => {
      const commit: DeferredCommit = {
        configuration,
        signal,
        onCommitted,
        resolve,
        reject,
        committing: false,
        abortListener: () => {
          if (commit.committing) return;
          this.inFlight = null;
          signal.removeEventListener('abort', commit.abortListener);
          reject(new DOMException('Synthetic commit aborted', 'AbortError'));
        },
      };
      this.inFlight = commit;
      signal.addEventListener('abort', commit.abortListener, { once: true });
      this.announceStarted?.();
      this.announceStarted = null;
      setTimeout(() => {
        if (this.inFlight !== commit) return;
        commit.committing = true;
        this.announceCommitting?.();
        this.announceCommitting = null;
      }, 0);
    });
  }
}
export async function beginSetup(
  service: LockService,
  passphrase = SYNTHETIC_PASSPHRASE,
): Promise<{
  readonly code: string;
  readonly confirmation: RecoveryConfirmation;
  readonly positions: RecoveryConfirmPositions;
}> {
  const setup = await service.setup(passphrase);
  const code = setup.recoveryCode;
  const normalized = canonicalizeRecoveryCode(code);
  const confirmation = setup.confirmPositions.map(
    (position) => normalized[position - 1]!,
  ) as unknown as RecoveryConfirmation;
  return { code, confirmation, positions: setup.confirmPositions };
}

export async function confirmSetup(
  service: LockService,
  passphrase = SYNTHETIC_PASSPHRASE,
): Promise<{
  readonly code: string;
  readonly confirmation: RecoveryConfirmation;
  readonly positions: RecoveryConfirmPositions;
}> {
  const setup = await beginSetup(service, passphrase);
  const result = await service.confirmSetup(setup.confirmation);
  if (!result.ok) throw new Error(`Synthetic setup failed: ${result.error}`);
  return setup;
}

export function createMemoryService(
  persistence: LockPersistence = new MemoryLockPersistence(),
): LockService {
  return createLockService({ persistence });
}
