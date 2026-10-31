import { useEffect, useState } from 'preact/hooks';
import { contentSourcesById } from '../../../../content/index.ts';
import { ENGINE_VERSION } from '../../../../contracts/engine-api.ts';
import type { Profile } from '../../../../contracts/entities.ts';
import {
  ISO_WEEKDAYS,
  THEMES,
  TRACKERS,
  type IsoWeekday,
  type TemperatureUnit,
  type Theme,
  type Tracker,
  type WeightUnit,
} from '../../../../contracts/enums.ts';
import { useRepositories } from '../../../layout/repositories.tsx';
import { Button, Card } from '../../../components/base';
import { TRACKER_LABELS } from '../../log/types.ts';
import {
  formatTemperatureFromCelsius,
  movePinnedTracker,
  togglePinnedTracker,
} from './preferences.ts';
import './settings.css';

export const DEFAULT_SETTINGS_PROFILE: Profile = {
  goal: 'track',
  lifeStage: 'cycle',
  units: { temp: 'celsius', weight: 'kg' },
  weekStart: 1,
  theme: 'system',
  lockTimeoutSec: 300,
  quickHideEnabled: false,
};

const temperatureOptions: readonly { readonly value: TemperatureUnit; readonly label: string }[] = [
  { value: 'celsius', label: 'Celsius' },
  { value: 'fahrenheit', label: 'Fahrenheit' },
];

const weightOptions: readonly { readonly value: WeightUnit; readonly label: string }[] = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'lb', label: 'Pounds (lb)' },
];

const themeLabels: Readonly<Record<Theme, string>> = {
  system: 'Use device setting',
  light: 'Light',
  dark: 'Dark',
};

const lockTimeoutOptions = [
  { seconds: 0, label: 'Immediately' },
  { seconds: 60, label: '1 minute' },
  { seconds: 300, label: '5 minutes' },
  { seconds: 900, label: '15 minutes' },
] as const;

const sourceEntries = Object.entries(contentSourcesById).sort(([left], [right]) =>
  left < right ? -1 : left > right ? 1 : 0,
);

export interface SettingsScreenProps {
  readonly pinnedTrackers: readonly Tracker[];
  readonly onPinnedTrackersChange: (trackers: readonly Tracker[]) => void;
  readonly onThemeChange: (theme: Theme) => void;
}

export function SettingsScreen({
  pinnedTrackers,
  onPinnedTrackersChange,
  onThemeChange,
}: SettingsScreenProps) {
  const { settingsRepo } = useRepositories();
  const [profile, setProfile] = useState<Profile>(DEFAULT_SETTINGS_PROFILE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let mounted = true;
    void settingsRepo
      .getProfile()
      .then((storedProfile) => {
        if (!mounted) return;
        setProfile(storedProfile ?? DEFAULT_SETTINGS_PROFILE);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoadError('Settings could not be loaded. Please try again.');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [settingsRepo]);

  const updateProfile = async (patch: Partial<Profile>): Promise<void> => {
    if (loading || loadError !== null || saving) return;
    const previous = profile;
    const next: Profile = { ...previous, ...patch };
    setProfile(next);
    setSaving(true);
    setSaveMessage('');
    setSaveError('');
    try {
      await settingsRepo.putProfile(next);
      if (patch.theme !== undefined) onThemeChange(patch.theme);
      setSaveMessage('Settings saved on this device.');
    } catch {
      setProfile(previous);
      setSaveError('This setting could not be saved. Your previous choice is unchanged.');
    } finally {
      setSaving(false);
    }
  };

  const customizableTrackers = TRACKERS.filter((tracker) => tracker !== 'heavy_detail');
  const profileControlsDisabled = loading || loadError !== null || saving;

  return (
    <section class="settings-screen shell-screen" aria-labelledby="settings-title">
      <p class="shell-eyebrow">A few choices, just for you</p>
      <h1 class="shell-screen__title" id="settings-title">
        Settings
      </h1>
      <p class="settings-screen__intro">
        Make this space feel comfortable. Your profile choices are saved on this device.
      </p>

      {loading ? <p role="status">Loading your settings...</p> : null}
      {loadError ? (
        <p class="settings-screen__error" role="alert">
          {loadError}
        </p>
      ) : null}
      {saving ? <p role="status">Saving your settings...</p> : null}
      {saveMessage ? (
        <p class="settings-screen__saved" role="status">
          {saveMessage}
        </p>
      ) : null}
      {saveError ? (
        <p class="settings-screen__error" role="alert">
          {saveError}
        </p>
      ) : null}

      <div class="settings-screen__cards">
        <Card class="settings-card" heading="Units">
          <fieldset class="settings-choice-group" disabled={profileControlsDisabled}>
            <legend>Temperature</legend>
            <div class="settings-choice-group__options">
              {temperatureOptions.map((option) => (
                <label class="settings-choice" key={option.value}>
                  <input
                    type="radio"
                    name="settings-temperature"
                    value={option.value}
                    checked={profile.units.temp === option.value}
                    onChange={() =>
                      void updateProfile({
                        units: { ...profile.units, temp: option.value },
                      })
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <p class="settings-screen__help">
              Temperature readings stay stored in Celsius; this choice changes display only. Example
              display:{' '}
              <span class="settings-temperature-preview" data-testid="temperature-preview">
                {formatTemperatureFromCelsius(20, profile.units.temp)}
              </span>{' '}
              <span class="settings-screen__hint">(illustrative, not a reading)</span>
            </p>
          </fieldset>
          <fieldset class="settings-choice-group" disabled={profileControlsDisabled}>
            <legend>Weight</legend>
            <div class="settings-choice-group__options">
              {weightOptions.map((option) => (
                <label class="settings-choice" key={option.value}>
                  <input
                    type="radio"
                    name="settings-weight"
                    value={option.value}
                    checked={profile.units.weight === option.value}
                    onChange={() =>
                      void updateProfile({
                        units: { ...profile.units, weight: option.value },
                      })
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card class="settings-card" heading="Week start">
          <label class="settings-select-label" htmlFor="settings-week-start">
            Start the week on
          </label>
          <select
            id="settings-week-start"
            value={profile.weekStart}
            disabled={profileControlsDisabled}
            onChange={(event) => {
              const selected = ISO_WEEKDAYS.find(
                (weekday) => String(weekday) === event.currentTarget.value,
              );
              if (selected !== undefined) void updateProfile({ weekStart: selected as IsoWeekday });
            }}
          >
            {ISO_WEEKDAYS.map((weekday, index) => (
              <option key={weekday} value={weekday}>
                {
                  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][
                    index
                  ]
                }
              </option>
            ))}
          </select>
        </Card>

        <Card class="settings-card" heading="Theme">
          <label class="settings-select-label" htmlFor="settings-theme">
            Choose a color theme
          </label>
          <select
            id="settings-theme"
            value={profile.theme}
            disabled={profileControlsDisabled}
            onChange={(event) => {
              const selected = THEMES.find((theme) => theme === event.currentTarget.value);
              if (selected !== undefined) void updateProfile({ theme: selected });
            }}
          >
            {THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {themeLabels[theme]}
              </option>
            ))}
          </select>
        </Card>

        <Card class="settings-card" heading="Lock timeout">
          <label class="settings-select-label" htmlFor="settings-lock-timeout">
            Lock after inactivity
          </label>
          <select
            id="settings-lock-timeout"
            value={profile.lockTimeoutSec}
            disabled={profileControlsDisabled}
            onChange={(event) => {
              const selected = lockTimeoutOptions.find(
                (option) => String(option.seconds) === event.currentTarget.value,
              );
              if (selected !== undefined) void updateProfile({ lockTimeoutSec: selected.seconds });
            }}
          >
            {lockTimeoutOptions.map((option) => (
              <option key={option.seconds} value={option.seconds}>
                {option.label}
              </option>
            ))}
          </select>
        </Card>

        <Card class="settings-card" heading="Your trackers">
          <p class="settings-screen__help">
            Pin the things you want close by, hide the rest, or arrange your own order. This list
            lasts for this app session.
          </p>
          <ul class="settings-tracker-list">
            {customizableTrackers.map((tracker) => {
              const index = pinnedTrackers.indexOf(tracker);
              const isPinned = index >= 0;
              return (
                <li class="settings-tracker-list__item" key={tracker}>
                  <span class="settings-tracker-list__label">
                    {TRACKER_LABELS[tracker]}
                    {isPinned ? <span class="settings-tracker-list__status">Pinned</span> : null}
                  </span>
                  <div class="settings-tracker-list__actions">
                    {isPinned ? (
                      <>
                        <Button
                          variant="quiet"
                          aria-label={`Move ${TRACKER_LABELS[tracker]} up`}
                          disabled={index === 0}
                          onClick={() =>
                            onPinnedTrackersChange(movePinnedTracker(pinnedTrackers, tracker, -1))
                          }
                        >
                          Move up
                        </Button>
                        <Button
                          variant="quiet"
                          aria-label={`Move ${TRACKER_LABELS[tracker]} down`}
                          disabled={index === pinnedTrackers.length - 1}
                          onClick={() =>
                            onPinnedTrackersChange(movePinnedTracker(pinnedTrackers, tracker, 1))
                          }
                        >
                          Move down
                        </Button>
                      </>
                    ) : null}
                    <Button
                      variant="secondary"
                      onClick={() =>
                        onPinnedTrackersChange(togglePinnedTracker(pinnedTrackers, tracker))
                      }
                    >
                      {isPinned
                        ? `Hide ${TRACKER_LABELS[tracker]}`
                        : `Pin ${TRACKER_LABELS[tracker]}`}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {pinnedTrackers.length === 0 ? (
            <p class="settings-screen__hint">No trackers are pinned. Add one whenever you like.</p>
          ) : null}
        </Card>

        <Card class="settings-card" heading="About this app">
          <dl class="settings-about-list">
            <div>
              <dt>Engine version</dt>
              <dd>{ENGINE_VERSION}</dd>
            </div>
          </dl>
          <details class="settings-sources">
            <summary>Sources for educational content</summary>
            <ul>
              {sourceEntries.map(([id, source]) => (
                <li key={id}>
                  <a href={source.url}>{source.title}</a>
                  <span>
                    {source.publisher}; accessed {source.accessed}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <p class="settings-screen__disclaimer">
            This app is informational only. It is not medical advice, a diagnosis, or birth control.
          </p>
        </Card>

        <Card class="settings-card settings-delete-placeholder" heading="Delete all my data">
          <p>This action is not available yet. This placeholder does not delete anything.</p>
        </Card>
      </div>
    </section>
  );
}
