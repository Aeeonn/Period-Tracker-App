import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import * as storage from '../data/storage.ts';
import type { DayLog, Settings, ShareState } from '../data/types.ts';
import { runEngine, type EngineOutput } from '../engine/index.ts';
import { todayLocal, type LocalDate } from '../lib/date.ts';
import { onShareUpdated, scheduleUpload, uploadPending } from '../share/sync.ts';
import { Calendar } from './screens/calendar.tsx';
import { LogDay } from './screens/log.tsx';
import { Onboarding } from './screens/onboarding.tsx';
import { PartnerHome } from './screens/partner.tsx';
import { Patterns } from './screens/patterns.tsx';
import { SettingsScreen } from './screens/settings.tsx';
import { ShareScreen } from './screens/share.tsx';
import { Today } from './screens/today.tsx';

export interface AppState {
  readonly today: LocalDate;
  readonly settings: Settings;
  readonly days: readonly DayLog[];
  readonly share: ShareState | undefined;
  readonly output: EngineOutput;
  saveDay(day: DayLog): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  saveShare(share: ShareState | undefined): Promise<void>;
  reload(): Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const state = useContext(AppContext);
  if (state === null) throw new Error('useApp outside App');
  return state;
}

export function navigate(path: string): void {
  location.hash = `#/${path}`;
}

function useRoute(): string {
  const read = () => location.hash.replace(/^#\/?/, '');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const update = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}

function useToday(): LocalDate {
  const [today, setToday] = useState(() => todayLocal());
  useEffect(() => {
    const check = () => setToday(todayLocal());
    const interval = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

interface Loaded {
  readonly settings: Settings | undefined;
  readonly days: DayLog[];
  readonly share: ShareState | undefined;
}

export function App() {
  const today = useToday();
  const route = useRoute();
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);

  const reload = useCallback(async () => {
    const [settings, days, share] = await Promise.all([
      storage.getSettings(),
      storage.getAllDays(),
      storage.getShare(),
    ]);
    setLoaded({ settings, days, share });
  }, []);

  useEffect(() => {
    void reload();
    void uploadPending();
    const retry = () => void uploadPending();
    window.addEventListener('online', retry);
    const unsubscribe = onShareUpdated(() => void reload());
    return () => {
      window.removeEventListener('online', retry);
      unsubscribe();
    };
  }, [reload]);

  const theme = loaded?.settings?.theme ?? 'system';
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const settings = loaded?.settings;
  const output = useMemo(
    () =>
      runEngine({
        today,
        days: loaded?.days ?? [],
        contraception: settings?.contraception ?? 'none',
        ...(settings?.cycleLength ? { cycleLength: settings.cycleLength } : {}),
        ...(settings?.periodLength ? { periodLength: settings.periodLength } : {}),
      }),
    [today, loaded?.days, settings],
  );

  if (loaded === undefined) return <main class="screen" aria-busy="true" />;
  if (settings === undefined) return <Onboarding onDone={reload} />;

  const state: AppState = {
    today,
    settings,
    days: loaded.days,
    share: loaded.share,
    output,
    async saveDay(day) {
      await storage.putDay(day);
      await reload();
      await scheduleUpload();
    },
    async saveSettings(next) {
      await storage.saveSettings(next);
      await reload();
      await scheduleUpload();
    },
    async saveShare(share) {
      await storage.saveShare(share);
      await reload();
    },
    reload,
  };

  const owner = settings.role === 'owner';
  const [page = '', param] = route.split('/');
  let screen;
  if (!owner) {
    screen = page === 'settings' ? <SettingsScreen /> : <PartnerHome />;
  } else if (page === 'calendar') {
    screen = <Calendar />;
  } else if (page === 'log') {
    screen = <LogDay key={param ?? today} date={param} />;
  } else if (page === 'patterns') {
    screen = <Patterns />;
  } else if (page === 'share') {
    screen = <ShareScreen />;
  } else if (page === 'settings') {
    screen = <SettingsScreen />;
  } else {
    screen = <Today />;
  }

  const tabs = owner
    ? [
        ['today', 'Today'],
        ['calendar', 'Calendar'],
        ['patterns', 'Patterns'],
        ['share', 'Share'],
        ['settings', 'Settings'],
      ]
    : [
        ['partner', 'Her cycle'],
        ['settings', 'Settings'],
      ];
  const current = page === '' || page === 'log' ? (owner ? 'today' : 'partner') : page;

  return (
    <AppContext.Provider value={state}>
      <main class="screen">{screen}</main>
      <nav class="tabs" aria-label="Main">
        {tabs.map(([id, label]) => (
          <a key={id} href={`#/${id}`} aria-current={current === id ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>
    </AppContext.Provider>
  );
}
