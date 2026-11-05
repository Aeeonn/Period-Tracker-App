# Owner decisions and preferences

This file lists the project owner's standing decisions in plain language. It replaces the Firstmate-era `captain.md`; that record's dated entries were translated here on 2026-11-04. Add new decisions with their date. If a decision changes architecture, also write an ADR.

“Owner” means the project owner, who decides scope, approvals and phase sign-off.

## How we work (2026-11-04)

- Use ordinary agentic development, not the Firstmate multi-agent workflow ([ADR-0015](adr/0015-normal-agentic-development.md)).
- Use a short-lived branch for each change, then fast-forward `main`.
- **Push `main` to GitHub after each verified merge** (standing approval). Push only `main`.
- For sensitive areas (see [AGENTS.md](../AGENTS.md#sensitive-changes-and-review)), decide per change whether an independent review agent is warranted. The default is yes for anything non-trivial. Other work gets tests and self-review.
- Review findings block merging only for correctness, security, data-loss or spec defects. Nits become follow-ups (from [ADR-0012](adr/0012-lighter-review-and-testing.md)).
- Run targeted tests while working and `npm run check` before merging. Full E2E, the time-zone matrix, coverage, the backtest and benchmarks run at phase end (ADR-0012).
- The owner prefers to keep moving rather than wait on reports. Don't stop for confirmation on routine, in-scope work; ask only for the items listed in [AGENTS.md](../AGENTS.md#ask-the-owner-first).
- Local development defaults to the unlocked development mode (`npm run dev`) because the passphrase and recovery-code screens slowed testing. The lock feature stays in the product (`npm run dev:secured`, production builds).

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
- **Admin help:** an optional administrative-help idea is exploratory only. It grants no hidden decryption, private-log access, forced edits or consent bypass.

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
  - **Disclosure:** the in-app hosting-custody disclosure is not required.
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
