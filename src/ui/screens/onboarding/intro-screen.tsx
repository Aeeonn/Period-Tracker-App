import { useState } from 'preact/hooks';
import type { OnboardingRole } from './model.ts';
import { isStandaloneDisplayMode } from './model.ts';
import './onboarding.css';

export interface OnboardingIntroProps {
  readonly onRoleSelected: (role: OnboardingRole) => void;
}

type IntroStep = 'welcome' | 'install' | 'role';

function standaloneMode(): boolean {
  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (navigator as Navigator & { readonly standalone?: boolean }).standalone === true;
  return isStandaloneDisplayMode(displayMode, iosStandalone);
}

export function OnboardingIntro({ onRoleSelected }: OnboardingIntroProps) {
  const [step, setStep] = useState<IntroStep>('welcome');
  const standalone = standaloneMode();

  const continueWelcome = () => setStep(standalone ? 'role' : 'install');

  return (
    <main class="onboarding-root" data-onboarding-step={step}>
      <section class="onboarding-panel" aria-labelledby="onboarding-title">
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
              onClick={() => setStep('role')}
            >
              Continue in browser anyway
            </button>
          </>
        ) : null}

        {step === 'role' ? (
          <>
            <h1 class="onboarding-title" id="onboarding-title">
              Which brings you here?
            </h1>
            <p class="onboarding-lead">
              Choose the view that feels right. You can continue on your own.
            </p>
            <div class="onboarding-choice-list">
              <button
                class="onboarding-choice"
                onClick={() => onRoleSelected('owner')}
                type="button"
              >
                <span class="onboarding-choice__icon" aria-hidden="true">
                  ✿
                </span>
                <span>I'm tracking my cycle</span>
                <span class="onboarding-choice__arrow" aria-hidden="true">
                  →
                </span>
              </button>
              <button
                class="onboarding-choice"
                onClick={() => onRoleSelected('partner')}
                type="button"
              >
                <span class="onboarding-choice__icon" aria-hidden="true">
                  ♡
                </span>
                <span>I'm the partner</span>
                <span class="onboarding-choice__arrow" aria-hidden="true">
                  →
                </span>
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
