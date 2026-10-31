import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { LogRepo, SettingsRepo } from '../../contracts/store.ts';

export interface Repositories {
  readonly logRepo: LogRepo;
  readonly settingsRepo: SettingsRepo;
}

export const RepositoriesContext = createContext<Repositories | null>(null);

export function useRepositories(): Repositories {
  const repositories = useContext(RepositoriesContext);
  if (repositories === null) {
    throw new Error('Repositories are only available in an unlocked app session.');
  }
  return repositories;
}
