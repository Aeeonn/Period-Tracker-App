# Owner decisions and preferences

This file lists the project owner's standing decisions in plain language. It replaces the Firstmate-era `captain.md`; that record's dated entries were translated here on 2026-11-04. Add new decisions with their date. If a decision changes architecture, also write an ADR.

“Owner” means the project owner, who decides scope, approvals and phase sign-off.

## How we work (2026-11-04)

- Use ordinary agentic development, not the Firstmate multi-agent workflow ([ADR-0015](adr/0015-normal-agentic-development.md)).
- Use a short-lived branch for each change, then fast-forward `main`.
- **Push `main` to GitHub after each verified merge** (standing approval). Push only `main`.
- For sensitive areas (see [AGENTS.md](../AGENTS.md#sensitive-changes-and-review)), decide per change whether an independent review agent is warranted. The default is yes for anything non-trivial. Other work gets tests and self-review.
- Non-sensitive work does not need a reviewer (owner, 2026-11-04). The bar is that it works, meets the task's goal and is implemented properly, shown by tests and the `check` gate.
- Review findings block merging only for correctness, security, data-loss or spec defects. Nits become follow-ups (from [ADR-0012](adr/0012-lighter-review-and-testing.md)).
- Run targeted tests while working and `npm run check` before merging. Full E2E, the time-zone matrix, coverage, the backtest and benchmarks run at phase end (ADR-0012).
- The owner prefers to keep moving rather than wait on reports. Don't stop for confirmation on routine, in-scope work; ask only for the items listed in [AGENTS.md](../AGENTS.md#ask-the-owner-first).
- Local development defaults to the unlocked development mode (`npm run dev`) because the passphrase and recovery-code screens slowed testing. The lock feature stays in the product (`npm run dev:secured`, production builds).

## Flo Lite (2026-11-25)

The app is being rebuilt as Flo Lite on `rewrite/flo-lite` ([NEW-APP.md](../NEW-APP.md)). Work stays on that branch until the owner decides to replace `main`. On that branch, this section and NEW-APP.md win over everything below; the older sections describe the original app and its process (ADRs, plan files, gates, lock) and are kept as history.

- **No lock for now.** No passphrase, recovery code or Face ID. A lock can come back later through `storage.ts`.
- **Partner view in the first version**, with shared data end-to-end encrypted (AES-GCM with a read key only the two phones hold; the relay keeps a hash of her write key).
- **Kept fields:** period (flow, pain, discharge, symptoms), energy, mood, desire, sex, sleep, activity, alcohol, water, private notes. **Dropped:** weight, stress, tests, STI tests and everything listed as dropped in the scope section below.
- **Contraception:** hormonal IUD; the fertile window is not shown with hormonal methods.
- **Agent assumptions, not yet confirmed by the owner:** sex is logged as "had sex" plus optional comfort and satisfaction; water is counted in glasses and activity in minutes; the self-harm crisis prompt (W-11) was not carried over because mood logging no longer includes it; the emergency card tells her to call 9-1-1; the partner sees about six months of shared logs.
- **Real use (2026-11-25):** the owner asked for "a fully working app so she can actually give it a try". The agent read this as approval to create the D1 database `flo-lite`, deploy the relay Worker `flo-lite-relay` and the Pages project `flo-lite`, and put the app at https://flo-lite.pages.dev for real use. It is deployed from `rewrite/flo-lite` with `tools/deploy/app.sh`; `main` is unchanged. Agent's reading, not yet confirmed: redeploying verified commits from this branch to the same project is covered; new Cloudflare resources, domains or tokens still need asking.

## Scope (2026-11-15)

The owner narrowed the plan to what the two of them need ([ADR-0017](adr/0017-narrowed-scope.md)). The current roadmap is at the top of [roadmap.md](plan/roadmap.md#current-roadmap-narrowed-2026-11-15). Nothing already built is removed.

- **Goals, in order:** cycle tracking and logging; tracking and helping their sex life (her own desire, comfort and satisfaction patterns, intimacy content); a partner view on his phone.
- **Real use starts after P1**, not after a later hardening phase. Production use with real data still needs the owner's explicit go-ahead.
- **Partner view is wanted on his own phone.** It shows what she logged and when her period is expected. The owner says they are open about this and it is not private from him. She still gets an on/off switch per category, a one-tap pause and "see what he sees"; sharing starts off.
  - Agent's reading, not yet confirmed by the owner: free-text notes stay private unless she chooses to share them.
- **Lean sharing** replaces the P2 design: one pairing code, one couple key, latest snapshot wins, relay only. No safety-code pairing, key rotation, conflict copies, file exchange, consent history, start date, per-entry opt-in or quick-hide. The relay still stores only ciphertext.
- **Contraception:** she has a **hormonal IUD** (confirmed 2026-11-25). The app hides the fertility estimate on both phones; she can still change the method in the app. Pill and medication reminders are dropped.
- **Flo Lite rebuild** (2026-11-25): the app is being rebuilt on the `rewrite/flo-lite` branch, as described in `NEW-APP.md`. Shared data stays end-to-end encrypted from the first version (confirmed); the passphrase lock is deferred.
- **Reminders (approved 2026-11-27):** Web Push reminders on both phones, each switchable: daily log check-in (default 21:00), period coming soon (1-5 days' notice), "did your period start?", "is your period over?", a monthly backup reminder, an IUD replacement reminder (from an optional insertion date and replacement interval), a heads-up on his phone before her period, and an optional "she logged her period" push to his phone that she turns on in Share. A discreet mode hides the wording. The owner approved the relay changes this needs (push tables in D1, a 5-minute cron, a VAPID key secret).
  - **Accepted privacy trade-off:** reminder text is written on each phone and the relay sees no health data, but it does see when each phone is woken. If she keeps "period coming soon" or "did it start?" on, that timing could hint at her cycle. The app says so on the Reminders card. The partner signal is opaque to the relay; his phone only says "her period started" if her latest shared snapshot shows it.
- **Ovulation markers:** she does not use ovulation test strips. Temperature, test-strip and mucus tracking are dropped.
- **Dropped for now** ("we don't need all that fancy stuff quite yet"): pregnancy, postpartum, perimenopause and trying-to-conceive modes; symptom checker; local assistant; content library; doctor report; Apple Health and other imports. Quizzes, date ideas and check-ins are an unplanned wish list. Any of these can come back if the owner asks.
- **Pattern summaries** are simple per-phase summaries of her own logs with day counts and a "not enough yet" state, and they include satisfaction. The formal statistical calibration study is not required.
- **Process:** no phase reports, demo packages or formal gates. The owner decides when to launch and when each step starts.

Where this section conflicts with older entries below (for example the P6 production timing, backup scope or the deferred pregnancy features), this section wins.

## Product direction

- **Priority:** a working app comes before maximal hardening (2026-10-28). The owner said the app does not need to be “super security-first”, but this is a priority signal, not permission to drop approved encryption, consent rules or reviews. Propose any concrete simplification to the owner first.
- **Intimacy is a main priority** (2026-10-30, [ADR-0014](adr/0014-intimacy-track.md)):
  - sex and desire logging comes first among log forms;
  - desire-pattern insights (F-118, F-105/F-106 trends) come right after P1;
  - the couple space (F-115/F-117) and intimacy guides (F-104, F-053) move earlier;
  - fertility is shown only qualitatively (higher or lower chance days), never as absolute numbers or “safe” days.
- **Visual direction** (2026-10-30): soft, inviting and supportive, not techy. Use purple tones and gradients, plus interactive, easy-to-read and fun data visuals such as a cycle ring with days-until and pastel stat tiles. A pastel Dribbble cycle-app shot was inspiration only; do not copy it.
- **Motion** (2026-10-28): the final version should have satisfying animations and popups or sheets, with accessibility, reduced-motion support and correct focus handling. This does not authorise an animation framework or new dependencies.
- **Clinical guidance:** Canadian guidance is selected. Canadian-localised medical content needs cited Canadian sources and an independent review before it ships.
- **W-11 local crisis support** (2026-11-13): Canada is the target region. Use Canada-specific 9-8-8 (call/text) and 9-1-1 resources; independent medical-content review is required before merge.
- **Admin help:** an optional administrative-help idea is exploratory only. It grants no hidden decryption, private-log access, forced edits or consent bypass.

## Lock and unlock (2026-11-14)

- **Face ID early:** build `p2-passkey-unlock` now, ahead of the P1 gate, to cut passphrase typing ([ADR-0016](adr/0016-passkey-face-id-unlock.md)). The owner chose Face ID rather than a lock-free preview build.
- **Domain:** Face ID may be offered before the final domain is fixed. It must be set up again on each preview alias and on the final domain.
- **Lock after:** the saved "Lock after inactivity" choice is honoured (it was ignored before). New profiles default to 1 minute, as the threat model specifies.

## Prediction engine rulings (2026-10-30)

- **Pregnancy/postpartum pause:** pausing predictions during pregnancy or postpartum is wanted eventually but is **deferred**.
- **Explicit “none”:** logging an explicit “none” (no bleeding) ends any remaining assumed period days.
- **Pregnancy without a last-period date:** deferred; no pregnancy is planned.
- **Short-interval bleed:** it becomes the new anchor, and that interval is excluded from cycle statistics.
- **Seven-day limit:** keep the current limit outside FIGO bands, with a documented note.
- **Missed logs:** the missed-log reference cycle length uses all other valid cycles.
- **Backtest:** gate on a pooled synthetic cohort ([ADR-0013](adr/0013-pooled-backtest-gating.md)). The parity target is gated only from three or more prior cycles; strata 0–2 are reported.
- **W-01 emergency warning:** it shows only for logs dated today or yesterday (the same window as W-11). During that window, it cannot be dismissed.

## Hosting, deployment and data

- **Cloudflare** (AP-10, 2026-10-28):
  - **Account:** one Free-plan account owned by the owner, with no payment method. The owner creates and manages the account and email; agents never create accounts or change account settings.
  - **Token:** a scoped deploy token for this account only, with Workers Scripts, D1 and Pages edit permissions and nothing else. It is stored outside the repository at `~/.config/flo-deploy/cloudflare.env` (mode 600). Never read, print or copy it; the deploy scripts load it.
  - **Disclosure:** the in-app hosting-custody disclosure is not required. On 2026-11-16 the owner had the "Who runs the app's servers?" onboarding step removed. Her setup is now two steps (basics, reminders); the partner sees a short "You're ready" step. This sets aside rule PR-08 and test T-UX-05 in [security-privacy.md](plan/security-privacy.md#2-consent-and-privacy-rules-testable).
- **Previews** (AP-18): synthetic-only preview deployments are allowed without asking each time.
  - Deploy from merged `main` using the existing scripts: Pages project `flo-preview`, with the app alias `app`.
  - Always pass an explicit non-`main` `--branch` alias; `main` is the Pages production branch.
  - Record each deployment in `docs/deploy/`.
  - The preview relay Worker and D1 use preview-only secrets.
- **Production and real data:** both need the owner's explicit approval (planned for P6, AP-29).
- **Backup fallback** (AP-12): use manual encrypted export/import only, with no GitHub data repository.
- **Dependencies:** only the approved, exactly pinned set is installed, including the dev-only coverage provider approved for P1. Any new or upgraded package needs approval.
- **Network:** the work VPN and Cisco Umbrella on the work network can break or intercept `*.workers.dev`. Earlier relay live checks ran on a phone hotspot with the VPN off. If live Cloudflare checks fail oddly, ask the owner about the network before debugging the code.

## Devices and phone testing

- **Test phones:** the cycle owner uses an iPhone 16 Pro (iOS 26), and the partner uses an iPhone 12 (iOS 18).
- **Waived checks:** the owner waived the partner-phone probe run and the iPhone storage-retention recheck (2026-10-30).
- **Phase demos:** they still include a short real-iPhone smoke check ([test-strategy.md §7](plan/test-strategy.md#7-real-iphone-smoke-checklist-both-phones-at-every-phase-demo-synthetic-data-only)), kept brief.

## Machine and account boundaries

- Pi cannot sign in to GitHub Copilot because of the company's Microsoft Entra Conditional Access policy. Never try to work around it, read or modify `~/.pi/agent/auth.json`, or run `pi` login or logout.
- Do not change `~/.bashrc` or its “no-pq-tls” Node TLS block (`~/.config/node/no-pq-tls.cjs`).
