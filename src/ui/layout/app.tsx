import { useEffect, useState } from 'preact/hooks';
import { Card } from '../components/base';

type Role = 'owner' | 'partner';
type TabId = 'today' | 'calendar' | 'log' | 'insights' | 'us';
type IconName = 'today' | 'calendar' | 'log' | 'insights' | 'us';

interface Tab {
  id: TabId;
  label: string;
  icon: IconName;
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

const SCREEN_COPY: Record<TabId, string> = {
  today:
    'This is a static placeholder. Cycle tracking, predictions, and health features are not connected.',
  calendar: 'This calendar placeholder contains no dates or health records.',
  log: 'Logging is not implemented in this shell.',
  insights: 'Insights and personal patterns are not implemented in this shell.',
  us: 'The shared space is not available in this shell. No accounts, pairing, or sharing are connected.',
};

function selectedRole(): Role {
  return new URLSearchParams(window.location.search).get('role') === 'partner'
    ? 'partner'
    : 'owner';
}

function tabFromLocation(tabs: readonly Tab[]): TabId {
  const target = window.location.hash.slice(1);
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

export function App() {
  const role = selectedRole();
  const tabs = role === 'owner' ? OWNER_TABS : PARTNER_TABS;
  const [activeTab, setActiveTab] = useState<TabId>(() => tabFromLocation(tabs));
  const selectedTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  useEffect(() => {
    const onLocationChange = () => setActiveTab(tabFromLocation(tabs));
    window.addEventListener('hashchange', onLocationChange);
    return () => window.removeEventListener('hashchange', onLocationChange);
  }, [tabs]);

  if (!selectedTab) return null;

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
      </header>

      <main class="shell-main shell-container" tabIndex={0}>
        <div class="shell-preview-banner" role="note">
          <span class="shell-preview-banner__dot" aria-hidden="true" />
          Static preview · synthetic placeholder content
        </div>
        <PlaceholderScreen role={role} tab={selectedTab} />
      </main>

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
