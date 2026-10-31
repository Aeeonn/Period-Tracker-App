import { useEffect, useRef, useState } from 'preact/hooks';
import type { LocalTime } from '../../contracts/localdate.ts';
import { todayLocal } from '../../lib/localdate/index.ts';
import { Button, Card } from '../components/base';
import { TODAY_PREVIEW_FIXTURE, TodayScreen } from '../screens/today';
import { CALENDAR_PREVIEW_FIXTURE, CalendarScreen } from '../screens/calendar';
import type { TodayScreenProps } from '../screens/today';
import { createTodayScreenProps } from '../screens/today/live-data.ts';
import { RepositoriesContext, type Repositories, useRepositories } from './repositories.tsx';
import { LogScreen } from '../screens/log';
import { applyThemePreference, SettingsScreen } from '../screens/settings/main/index.ts';
import { DEFAULT_PINNED_TRACKERS } from '../screens/log/types.ts';
import type { Theme, Tracker } from '../../contracts/enums.ts';
import type { UpdateReadyNotice } from '../../sw/client.ts';
import {
  OnboardingIntro,
  OnboardingScreen,
  type OnboardingRole,
} from '../screens/onboarding/index.ts';

type Role = OnboardingRole;
type TabId = 'today' | 'calendar' | 'log' | 'insights' | 'us' | 'settings';
type IconName = 'today' | 'calendar' | 'log' | 'insights' | 'us';

interface Tab {
  id: TabId;
  label: string;
  icon: IconName;
}

export interface AppShellProps {
  readonly repositories: Repositories;
  readonly updateNotice: UpdateReadyNotice | null;
  readonly restartStatus: 'ready' | 'saving' | 'restarting';
  readonly cancelRestart: () => void | Promise<void>;
  readonly initialOnboardingRole?: OnboardingRole;
  readonly sessionOnboardingComplete?: boolean;
  readonly onOnboardingComplete?: () => void;
}

const OWNER_TABS: readonly Tab[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'log', label: 'Log', icon: 'log' },
  { id: 'insights', label: 'Insights', icon: 'insights' },
  { id: 'us', label: 'Us', icon: 'us' },
];

const PARTNER_TABS: readonly Tab[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'us', label: 'Us', icon: 'us' },
];

const SETTINGS_TAB = { id: 'settings', label: 'Settings' } as const;

const SCREEN_COPY: Record<TabId, string> = {
  today:
    'This is a static placeholder. Cycle tracking, predictions, and health features are not connected.',
  calendar: 'This calendar placeholder contains no dates or health records.',
  log: 'Logging is not implemented in this shell.',
  insights: 'Insights and personal patterns are not implemented in this shell.',
  us: 'The shared space is not available in this shell. No accounts, pairing, or sharing are connected.',
  settings: 'Settings are not available in this shell.',
};

function selectedRole(): Role {
  return new URLSearchParams(window.location.search).get('role') === 'partner'
    ? 'partner'
    : 'owner';
}

function localClockSnapshot() {
  const nowMs = Date.now();
  const fields = new Intl.DateTimeFormat('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));
  const hour = fields.find((part) => part.type === 'hour')?.value;
  const minute = fields.find((part) => part.type === 'minute')?.value;
  const localTime = `${hour}:${minute}`;
  if (!/^\d{2}:\d{2}$/u.test(localTime)) throw new RangeError('The local clock time is invalid.');
  return { today: todayLocal({ nowMs }), now: localTime as LocalTime };
}

function tabFromLocation(tabs: readonly Tab[]): TabId {
  const target = window.location.hash.slice(1);
  if (target === 'settings') return 'settings';
  return tabs.find((tab) => tab.id === target)?.id ?? 'today';
}

function TabIcon({ name }: { name: IconName }) {
  switch (name) {
    case 'today':
      return (
        <svg
          aria-hidden="true"
          class="shell-tab__icon"
          viewBox="0 0 24 24"
          fill="none"
          focusable="false"
        >
          <circle cx="12" cy="12" r="7.25" />
          <path d="M12 2.75v2M12 19.25v2M2.75 12h2M19.25 12h2" />
          <circle cx="12" cy="12" r="1.5" class="shell-tab__icon-fill" />
        </svg>
      );
    case 'calendar':
      return (
        <svg
          aria-hidden="true"
          class="shell-tab__icon"
          viewBox="0 0 24 24"
          fill="none"
          focusable="false"
        >
          <rect x="4" y="5.5" width="16" height="15" rx="3" />
          <path d="M8 3.5v4M16 3.5v4M4 9.5h16M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
        </svg>
      );
    case 'log':
      return (
        <svg
          aria-hidden="true"
          class="shell-tab__icon"
          viewBox="0 0 24 24"
          fill="none"
          focusable="false"
        >
          <circle cx="12" cy="12" r="8.25" />
          <path d="M12 7.5v9M7.5 12h9" />
        </svg>
      );
    case 'insights':
      return (
        <svg
          aria-hidden="true"
          class="shell-tab__icon"
          viewBox="0 0 24 24"
          fill="none"
          focusable="false"
        >
          <path d="M3.5 17.5 8 13l3.25 2.5L18 8.75" />
          <path d="M14.5 8.75H18v3.5" />
          <path d="M4 20h16" />
        </svg>
      );
    case 'us':
      return (
        <svg
          aria-hidden="true"
          class="shell-tab__icon"
          viewBox="0 0 24 24"
          fill="none"
          focusable="false"
        >
          <circle cx="9" cy="10" r="4" />
          <circle cx="16.5" cy="14.5" r="3.25" />
          <path d="M2.75 20c.75-2.7 2.85-4.25 6.25-4.25M14 5.25c2 .35 3.25 1.65 3.7 3.5" />
        </svg>
      );
  }
}

function PlaceholderScreen({ role, tab }: { role: Role; tab: Tab }) {
  const copy =
    tab.id === 'today' && role === 'partner'
      ? 'This partner-view placeholder contains no shared data. Sharing and health details are not connected.'
      : SCREEN_COPY[tab.id];

  return (
    <section key={tab.id} class="shell-screen" aria-labelledby="shell-screen-title">
      <p class="shell-eyebrow">{role === 'owner' ? 'Cycle owner preview' : 'Partner preview'}</p>
      <h1 class="shell-screen__title" id="shell-screen-title">
        {tab.label}
      </h1>
      <Card class="shell-placeholder" heading="Placeholder screen">
        <span class="shell-placeholder__mark" aria-hidden="true">
          <span />
        </span>
        <p>{copy}</p>
        <p class="shell-placeholder__note">No health data is shown or stored in this shell.</p>
      </Card>
    </section>
  );
}

function RepositoryLogScreen({
  pinnedTrackers,
  onPinnedTrackersChange,
}: {
  readonly pinnedTrackers: readonly Tracker[];
  readonly onPinnedTrackersChange: (trackers: readonly Tracker[]) => void;
}) {
  const { logRepo } = useRepositories();
  return (
    <LogScreen
      logRepo={logRepo ?? undefined}
      pinnedTrackers={pinnedTrackers}
      onPinnedTrackersChange={onPinnedTrackersChange}
    />
  );
}

export function AppShell({
  repositories,
  updateNotice,
  restartStatus,
  cancelRestart,
  initialOnboardingRole,
  sessionOnboardingComplete = false,
  onOnboardingComplete,
}: AppShellProps) {
  const [sessionOnboardingRole, setSessionOnboardingRole] = useState<OnboardingRole | null>(
    () => initialOnboardingRole ?? null,
  );
  const role = sessionOnboardingRole ?? selectedRole();
  const tabs = role === 'owner' ? OWNER_TABS : PARTNER_TABS;
  const [activeTab, setActiveTab] = useState<TabId>(() => tabFromLocation(tabs));
  const [pinnedTrackers, setPinnedTrackers] = useState<readonly Tracker[]>(() => [
    ...DEFAULT_PINNED_TRACKERS,
  ]);
  const selectedTab =
    activeTab === 'settings' ? SETTINGS_TAB : (tabs.find((tab) => tab.id === activeTab) ?? tabs[0]);
  const syntheticPreview = new URLSearchParams(window.location.search).get('today') === 'synthetic';
  const [onboardingStatus, setOnboardingStatus] = useState<
    'checking' | 'required' | 'complete' | 'error'
  >(() => (syntheticPreview || sessionOnboardingComplete ? 'complete' : 'checking'));
  const [todayProps, setTodayProps] = useState<TodayScreenProps | null>(null);
  const [todayLoadFailed, setTodayLoadFailed] = useState(false);
  const themeRevision = useRef(0);

  useEffect(() => {
    let mounted = true;
    const revision = themeRevision.current;
    void repositories.settingsRepo
      .getProfile()
      .then((profile) => {
        if (mounted && themeRevision.current === revision) {
          applyThemePreference(profile?.theme ?? 'system');
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [repositories]);

  const handleThemeChange = (theme: Theme) => {
    themeRevision.current += 1;
    applyThemePreference(theme);
  };

  useEffect(() => {
    const onLocationChange = () => setActiveTab(tabFromLocation(tabs));
    window.addEventListener('hashchange', onLocationChange);
    return () => window.removeEventListener('hashchange', onLocationChange);
  }, [tabs]);

  useEffect(() => {
    if (syntheticPreview || sessionOnboardingComplete) {
      setOnboardingStatus('complete');
      return;
    }
    if (initialOnboardingRole === 'partner') {
      setOnboardingStatus('required');
      return;
    }

    let mounted = true;
    setOnboardingStatus('checking');
    void repositories.settingsRepo
      .getProfile()
      .then((profile) => {
        if (mounted) setOnboardingStatus(profile === undefined ? 'required' : 'complete');
      })
      .catch(() => {
        if (mounted) setOnboardingStatus('error');
      });
    return () => {
      mounted = false;
    };
  }, [initialOnboardingRole, repositories, role, sessionOnboardingComplete, syntheticPreview]);

  useEffect(() => {
    if (onboardingStatus !== 'complete' || role !== 'owner' || selectedTab?.id !== 'today') return;
    let mounted = true;
    const refreshToday = async () => {
      try {
        const props = syntheticPreview
          ? TODAY_PREVIEW_FIXTURE
          : await createTodayScreenProps(repositories, localClockSnapshot());
        if (mounted) {
          setTodayProps(props);
          setTodayLoadFailed(false);
        }
      } catch {
        if (mounted) {
          setTodayProps(null);
          setTodayLoadFailed(true);
        }
      }
    };
    const unsubscribe = repositories.logRepo.onChange(() => void refreshToday());
    window.addEventListener('focus', refreshToday);
    void refreshToday();
    return () => {
      mounted = false;
      unsubscribe();
      window.removeEventListener('focus', refreshToday);
    };
  }, [repositories, role, selectedTab?.id, syntheticPreview, onboardingStatus]);

  const openLogTab = () => {
    setActiveTab('log');
    window.location.hash = 'log';
  };

  const restartNow = () => {
    if (!updateNotice || restartStatus !== 'ready') return;
    void updateNotice.restartNow().then((restarted) => {
      if (!restarted) void cancelRestart();
    });
  };

  if (!selectedTab) return null;

  if (onboardingStatus === 'checking') {
    return (
      <main class="onboarding-root">
        <p role="status">Checking this device’s profile…</p>
      </main>
    );
  }
  if (onboardingStatus === 'error') {
    return (
      <main class="onboarding-root">
        <p role="alert">This device’s profile could not be opened safely. Try reopening the app.</p>
      </main>
    );
  }
  if (onboardingStatus === 'required') {
    const hasRoleInRoute = new URLSearchParams(window.location.search).has('role');
    return (
      <RepositoriesContext.Provider value={repositories}>
        {sessionOnboardingRole === null && !hasRoleInRoute ? (
          <OnboardingIntro onRoleSelected={setSessionOnboardingRole} />
        ) : (
          <OnboardingScreen
            role={role}
            onComplete={() => {
              setOnboardingStatus('complete');
              onOnboardingComplete?.();
            }}
          />
        )}
      </RepositoriesContext.Provider>
    );
  }

  const roleLabel = role === 'owner' ? 'Cycle owner' : 'Partner';

  return (
    <div class="shell-root" data-role={role}>
      <header class="shell-header shell-container">
        <div class="shell-brand">
          <svg
            class="shell-brand__mark"
            aria-hidden="true"
            viewBox="0 0 40 40"
            fill="none"
            focusable="false"
          >
            <circle cx="20" cy="20" r="12.5" />
            <circle cx="29.2" cy="9.8" r="2.4" class="shell-brand__dot" />
          </svg>
          <div>
            <p class="shell-brand__name">Cycle companion</p>
            <p class="shell-brand__caption">Static preview</p>
          </div>
        </div>
        <span class="shell-role">{roleLabel}</span>
        <a
          class="ui-button ui-button--quiet shell-settings-link"
          href="#settings"
          aria-label="Settings"
          aria-current={activeTab === 'settings' ? 'page' : undefined}
          onClick={() => setActiveTab('settings')}
        >
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            focusable="false"
          >
            <path
              d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z"
              stroke="currentColor"
              stroke-width="1.8"
            />
            <path
              d="m19.4 13.5 1.1.85-1.6 2.77-1.31-.53a7.6 7.6 0 0 1-1.52.88l-.22 1.39h-3.2l-.22-1.39a7.6 7.6 0 0 1-1.52-.88l-1.31.53-1.6-2.77 1.1-.85a7.4 7.4 0 0 1 0-1.76l-1.1-.85 1.6-2.77 1.31.53a7.6 7.6 0 0 1 1.52-.88l.22-1.39h3.2l.22 1.39a7.6 7.6 0 0 1 1.52.88l1.31-.53 1.6 2.77-1.1.85a7.4 7.4 0 0 1 0 1.76Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
        </a>
      </header>

      <RepositoriesContext.Provider value={repositories}>
        <main class="shell-main shell-container" tabIndex={0}>
          <div class="shell-preview-banner" role="note">
            <span class="shell-preview-banner__dot" aria-hidden="true" />
            Preview — synthetic data only
          </div>
          {updateNotice ? (
            <div role="status" aria-live="polite">
              <Card class="shell-update" heading="Update ready">
                <p>
                  {restartStatus === 'saving'
                    ? 'Saving your changes before restarting.'
                    : restartStatus === 'restarting'
                      ? 'Restarting the app.'
                      : updateNotice.message}
                </p>
                <Button onClick={restartNow} disabled={restartStatus !== 'ready'}>
                  Restart now
                </Button>
              </Card>
            </div>
          ) : null}
          {selectedTab.id === 'settings' ? (
            <SettingsScreen
              pinnedTrackers={pinnedTrackers}
              onPinnedTrackersChange={setPinnedTrackers}
              onThemeChange={handleThemeChange}
            />
          ) : role === 'owner' && selectedTab.id === 'log' ? (
            <RepositoryLogScreen
              pinnedTrackers={pinnedTrackers}
              onPinnedTrackersChange={setPinnedTrackers}
            />
          ) : role === 'owner' && selectedTab.id === 'today' ? (
            todayProps ? (
              <TodayScreen {...todayProps} pinnedTrackers={pinnedTrackers} onOpenLog={openLogTab} />
            ) : todayLoadFailed ? (
              <p role="alert">Today's data could not be loaded. Try reopening the app.</p>
            ) : (
              <p role="status">Loading today's cycle data...</p>
            )
          ) : role === 'owner' && selectedTab.id === 'calendar' ? (
            <CalendarScreen {...CALENDAR_PREVIEW_FIXTURE} />
          ) : (
            <PlaceholderScreen role={role} tab={selectedTab} />
          )}
        </main>
      </RepositoriesContext.Provider>

      <nav class="shell-tabbar" aria-label={`${roleLabel} navigation`}>
        <div class="shell-tabbar__inner shell-container">
          {tabs.map((tab) => (
            <a
              key={tab.id}
              class="shell-tab"
              href={`#${tab.id}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon name={tab.icon} />
              <span class="shell-tab__label">{tab.label}</span>
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
