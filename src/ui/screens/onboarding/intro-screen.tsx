import { useState } from 'preact/hooks';
import type { OnboardingRole } from './model.ts';
import { isStandaloneDisplayMode } from './model.ts';
import './onboarding.css';

export interface OnboardingIntroProps {
  readonly onRoleSelected: (role: OnboardingRole) => void;
  readonly unlockedPreview?: boolean;
}

type IntroStep = 'welcome' | 'install';

function standaloneMode(): boolean {
  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (navigator as Navigator & { readonly standalone?: boolean }).standalone === true;
  return isStandaloneDisplayMode(displayMode, iosStandalone);
}

export function OnboardingIntro({
  onRoleSelected,
  unlockedPreview = false,
}: OnboardingIntroProps) {
  const [step, setStep] = useState<IntroStep>('welcome');
  const standalone = standaloneMode();

  // Partner setup is not offered until sharing exists (ADR-0017). `?role=partner`
  // keeps the partner shell reachable for development and tests.
  const role: OnboardingRole =
    new URLSearchParams(window.location.search).get('role') === 'partner' ? 'partner' : 'owner';

  const continueWelcome = () => {
    if (standalone) onRoleSelected(role);
    else setStep('install');
  };

  return (
    <main class="onboarding-root" data-onboarding-step={step}>
      <section class="onboarding-panel" aria-labelledby="onboarding-title">
        {unlockedPreview ? (
          <p class="onboarding-warning" role="note">
            Unlocked development preview: no passphrase protection. Use synthetic data only; do not
            enter real information.
          </p>
        ) : null}
        <p class="onboarding-eyebrow">A little space for your cycle</p>
        {step === 'welcome' ? (
          <>
            <div class="onboarding-orbit" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h1 class="onboarding-title" id="onboarding-title">
              Welcome to your cycle companion
            </h1>
            <p class="onboarding-lead">
              Private cycle tracking for you two. No account. Your data stays on your phones,
              encrypted.
            </p>
            <button class="onboarding-button onboarding-button--primary" onClick={continueWelcome}>
              Continue
            </button>
          </>
        ) : null}

        {step === 'install' ? (
          <>
            <h1 class="onboarding-title" id="onboarding-title">
              Make room for the app
            </h1>
            <p class="onboarding-lead">
              For the most private, app-like experience, add it to your Home Screen.
            </p>
            <ol class="onboarding-install-steps" aria-label="Add this app to your Home Screen">
              <li>
                <span class="onboarding-install-step__number">1</span>
                <span>
                  Tap <strong>Share</strong> in Safari.
                </span>
              </li>
              <li>
                <span class="onboarding-install-step__number">2</span>
                <span>
                  Choose <strong>Add to Home Screen</strong>.
                </span>
              </li>
              <li>
                <span class="onboarding-install-step__number">3</span>
                <span>Open it from your Home Screen as a web app.</span>
              </li>
            </ol>
            <p class="onboarding-warning" role="note">
              Data entered in Safari is not carried into the installed app.
            </p>
            <button
              class="onboarding-button onboarding-button--primary"
              onClick={() => onRoleSelected(role)}
            >
              Continue in browser anyway
            </button>
          </>
        ) : null}

      </section>
    </main>
  );
}
