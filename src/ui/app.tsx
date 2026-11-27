import { createContext, type JSX } from 'preact';
import { useCallback, useContext, useEffect, useId, useMemo, useState } from 'preact/hooks';
import * as storage from '../data/storage.ts';
import type { DayLog, Settings, ShareState } from '../data/types.ts';
import { runEngine, type EngineOutput } from '../engine/index.ts';
import { todayLocal, type LocalDate } from '../lib/date.ts';
import { onShareUpdated, scheduleUpload, uploadPending } from '../share/sync.ts';
import {
  CalendarIcon,
  CycleIcon,
  HeartIcon,
  Logo,
  PatternsIcon,
  SlidersIcon,
  UsersIcon,
} from './icons.tsx';
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

const THEME_COLOR = { light: '#f9f5ff', dark: '#15111c' } as const;

interface Tab {
  readonly id: string;
  readonly label: string;
  readonly Icon: (props: { class?: string }) => JSX.Element;
}

const OWNER_TABS: readonly Tab[] = [
  { id: 'today', label: 'Today', Icon: CycleIcon },
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'patterns', label: 'Patterns', Icon: PatternsIcon },
  { id: 'share', label: 'Share', Icon: UsersIcon },
  { id: 'settings', label: 'Settings', Icon: SlidersIcon },
];

const PARTNER_TABS: readonly Tab[] = [
  { id: 'partner', label: 'Her cycle', Icon: HeartIcon },
  { id: 'settings', label: 'Settings', Icon: SlidersIcon },
];

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
  const logoId = useId();
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
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      const scheme = meta.media.includes('dark') ? 'dark' : 'light';
      meta.content = THEME_COLOR[theme === 'system' ? scheme : theme];
    }
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

  if (loaded === undefined) {
    return (
      <main class="screen screen--bare splash" aria-busy="true">
        <Logo class="splash__logo" id={logoId} />
      </main>
    );
  }
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

  const tabs: readonly Tab[] = owner ? OWNER_TABS : PARTNER_TABS;
  // A past day is opened from the calendar and returns there, so keep that tab lit.
  const fallback = !owner
    ? 'partner'
    : page === 'log' && param !== undefined && param !== today
      ? 'calendar'
      : 'today';
  const current = tabs.some((tab) => tab.id === page) ? page : fallback;
  const active = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === current),
  );

  return (
    <AppContext.Provider value={state}>
      <main class="screen">
        <div class="screen__body" key={page === 'log' ? 'log' : current}>
          {screen}
        </div>
      </main>
      <nav class="tabs" aria-label="Main" data-count={tabs.length} data-active={active}>
        <span class="tabs__indicator" aria-hidden="true" />
        {tabs.map(({ id, label, Icon }) => (
          <a
            key={id}
            class="tabs__link"
            href={`#/${id}`}
            aria-current={current === id ? 'page' : undefined}
          >
            <Icon class="tabs__icon" />
            <span class="tabs__label">{label}</span>
          </a>
        ))}
      </nav>
    </AppContext.Provider>
  );
}
