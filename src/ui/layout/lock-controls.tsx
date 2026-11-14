import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { LockService } from '../../contracts/lock.ts';
import type { PasskeyAuthenticator } from '../../lock/passkey/index.ts';

/** Lock controls for unlocked screens. `null` in the unlocked development preview and tests. */
export interface LockControls {
  readonly service: LockService;
  readonly passkeys: PasskeyAuthenticator;
  /** Applies a saved "Lock after inactivity" choice to the running auto-lock. */
  readonly onLockTimeoutChange: (seconds: number) => void;
}

export const LockControlsContext = createContext<LockControls | null>(null);

export function useLockControls(): LockControls | null {
  return useContext(LockControlsContext);
}
