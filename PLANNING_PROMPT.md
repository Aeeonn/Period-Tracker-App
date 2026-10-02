# Planning Prompt — Private Flo-Equivalent Cycle Tracker for Couples (iPhone Web App)

_Adapted for Pi + Herdr + Firstmate on WSL2 Ubuntu._

## 1. Your role

You are the lead planner for a personal software project. Execution runs on Firstmate: the first mate (a Pi session) dispatches Pi crewmates into Herdr panes, each in its own git worktree. Section 1a explains how this prompt maps onto that setup. Work with the judgment of a senior product engineer who also understands:

- menstrual-cycle, fertility-awareness, sexual-health, pregnancy, and perimenopause science, based on evidence and clinical guidelines;
- privacy, security, and consent-centered design for sensitive health data shared between two people;
- iPhone Safari Progressive Web Apps (PWAs);
- cost-aware multi-agent software delivery (an orchestrator, implementer sub-agents, and independent verification agents).

Until I approve the plan, research, design, and plan only. Do not write application code.

## 1a. How this prompt runs on Firstmate (read this first)

The first mate reads this prompt and runs the planning work as Firstmate tasks. Don't build a second orchestrator, task database, or agent framework; use Firstmate's own backlog, briefs, scouts, and ship tasks.

| Stage | Who | What | Output |
|---|---|---|---|
| 0 | First mate, in chat | Step 0: restate, then ask blocking questions one at a time | Answers recorded in backlog notes |
| A | 6 scout tasks, at most 3 running at once, research model | Step 1: R1–R6 | One scout report each |
| B | 1 scout task, research model | Step 1 cross-check | Scout report |
| C | 1 ship task, strong planning model, local merge | Steps 2–8 and 10, reading the scout reports from their report paths | `docs/plan/`, including copies of the research reports |
| D | 1 scout task, strong model | Step 11: plan critique | Findings report |
| E | 1 ship task | Fix the critic's findings and run the consistency check | Updated `docs/plan/` |
| F | First mate | Present the executive summary and the approval list from `docs/plan/plan.md`, then stop | — |

No application code is written before I approve at Stage F. Stage C is the most expensive step. If it runs short of context, split it into C1 (Steps 2–3: parity matrix and algorithms) and C2 (Steps 4–8 and 10), with C2 reading C1's files instead of the raw research.

## 2. Who it's for, what we want, and why

**Users:** two people, both 21 and both on iPhones.
- **My girlfriend:** the person whose cycle is tracked. She logs her own health data on her phone and owns it.
- **Me (male):** her partner. I see only what she chooses to share.
- **Both of us** can add shared couple entries, such as sex, dates, and notes.

**What we want:**
1. **Full Flo parity:** a private iPhone web app that replicates **Flo** (the period, ovulation, and pregnancy tracker), including **every free and Premium feature**. It is for our personal use only, never published or monetized.
2. **A better relationship and sex life:** help us understand her cycle together, for example where she is in her cycle, her energy, mood, and libido patterns, PMS, and fertility, so we can communicate better and improve our sex life. She stays in control of what I see.
3. **Beyond Flo:** add features Flo doesn't have when they clearly help these goals.

**Why:** We don't trust the privacy practices of commercial period and pregnancy trackers. For example, in 2021 the FTC took action against Flo Health for sharing users' health data with third parties. Our data must stay under our control.

**Accuracy and performance:** We want the best possible tracking and predictions, at least as good as Flo's. Use Flo's own formulas and techniques where they are publicly documented. Where they aren't, use the closest evidence-based method, and label which is which. The app must also feel fast on an iPhone.

**Design:** The visuals don't need to match Flo, but the UI and UX must be simple enough to understand at a glance.

**About me:** I know nothing about period, fertility, or pregnancy tracking. Explain domain concepts in plain language, include a short glossary, and make the decisions a domain expert would make, with reasons.

## 3. Decisions already made (treat as constraints)

| Topic | Decision |
|---|---|
| Users and devices | Two iPhones running Safari. Her phone logs her health data. My phone shows a partner view of whatever she shares. Both phones can add shared couple entries. |
| Platform | An iPhone Safari web app added to the Home Screen (a PWA). It must be reachable over the internet from anywhere and fully usable offline. Desktop browser support is nice to have. |
| Budget and infrastructure | $0 recurring cost. We have **no always-on home server**. Free tiers of third-party services are acceptable only if they never see unencrypted health data and we can move away from them. |
| Data storage and sync | Health data is stored only on storage we control, and it is encrypted end to end, including while syncing between our two phones. Weigh the options and pick the best trade-off of privacy, effort, and persistence (Step 5). |
| AI features | **Local-only.** The symptom checker and assistant are rule-based and explain their reasoning. An optional on-device model is a stretch goal. Health data is never sent to a cloud AI or any third-party API. |
| Sub-agent models (credit cost) | Use Pi through GitHub Copilot with explicit provider-qualified model IDs and thinking of **high or above**. Research defaults to `github-copilot/gpt-6.1-sol`; a documented per-task override may use `github-copilot/gpt-6-luna`. Bounded implementation and low-risk reviews use Luna; extensive work, design decisions, escalation, and high-risk verification use `github-copilot/claude-opus-5.5`. `~/firstmate/config/crew-dispatch.json` is the routing source of truth; Step 9 defines the workflow. Validate credit costs against actual usage, not model names. |
| Project management | Firstmate's backlog is the task tracker and source of truth, with dependencies. Code lives in a private GitHub repository (or local-only, decided in Phase 0). A GitHub Projects board is optional and, if used, shows phases and gates only, not every task. I may create the repository myself, or you can create it in Phase 0 after I sign in to the GitHub CLI. |
| When to stop for my approval | 1. This plan. 2. Creating any account, repository, credential, or token. 3. Anything that costs money. 4. Destructive data actions, such as deleting or migrating real data or force-pushing. 5. Production deploys. 6. A short demo and review at the end of every phase. Decide everything else yourself and log each decision. |
| Workspace | `~/code/flo_remade` inside WSL2 Ubuntu on Windows (bash). It contains only this prompt (`PLANNING_PROMPT.md`) and an empty `.agents/skills/` folder, committed to a fresh local git repository. Firstmate lives in `~/firstmate`. |

## 4. Non-negotiables (the project "constitution")

These rules apply to the plan and to every agent that works on the project afterward.

1. **Her data, her control:**
   - She owns her health data. Nothing is shared with me by default.
   - She chooses what I can see, category by category, and can always see exactly what I see.
   - She can pause or revoke sharing at any time without giving a reason. Revoking stops future access; say plainly that data I've already seen can't be "unseen".
   - The partner view is read-only for her health data.
   - Enforce all of this with encryption and data separation, not just by hiding things in the UI. No covert or hidden tracking features.
2. **Privacy by design:**
   - No analytics, telemetry, ads, third-party SDKs, CDNs, hosted web fonts, or crash reporters. No accounts or sign-up.
   - Anything stored off our phones is end-to-end encrypted with keys only we hold.
   - No health data, not even encrypted, goes in the code repository or on GitHub issues.
   - An automated test proves the app contacts only endpoints on an approved list.
3. **Security:** Data is encrypted at rest on each phone (WebCrypto). The app has a lock (a passcode, optionally Face ID via passkeys) and locks itself automatically. Use a strict Content Security Policy and security headers, and keep dependencies minimal, version-pinned, and audited. Include a "delete all my data" action.
4. **Medical safety:**
   - The app is informational only and is never presented as a diagnosis.
   - **No "safe days":** never label a day as safe for unprotected sex or imply the app is birth control. Always show that pregnancy is possible, along with how uncertain the fertile-window prediction is.
   - Every prediction shows its uncertainty.
   - Warning-sign patterns trigger "talk to a clinician" guidance based on published clinical guidelines.
   - Educational content (including contraception, emergency contraception, when to take a pregnancy test, and STI prevention) is original and cites reputable sources, such as ACOG, NHS, NICE, CDC, WHO, or peer-reviewed literature.
5. **Intellectual property:** Replicate Flo's functionality, not its assets. Never copy Flo's text, articles, videos, images, icons, or branding. Give the app its own name.
6. **Correctness:** Dates are calendar dates in each user's local time zone, so there are no off-by-one-day errors from UTC conversion or daylight-saving bugs. The database schema is versioned, with tested migrations, and app updates can never lose data. Syncing between the two phones never silently loses either person's edits.
7. **Simplicity, respect, and accessibility:**
   - Logging today's period or symptoms takes three taps or fewer from the Today screen.
   - Tips for me as the partner are based on her own logs, not stereotypes.
   - The app meets WCAG 2.2 AA, has large touch targets, and supports light and dark mode.
8. **Data portability:** Full export (JSON and CSV) and import, plus encrypted backup and restore, all tested end to end.
9. **Maintainability:** A mainstream, well-documented, typed stack (TypeScript in strict mode unless research strongly justifies otherwise), with automated tests for all logic.
10. **No real health data** in the repository, issues, logs, screenshots, or test fixtures. Use a synthetic data generator instead.

## 5. Known starting points (verify; do not trust blindly)

Flo's App Store description (checked 2026-09-30) lists the features below. Treat this list as a starting point, not a complete inventory.

- **Not labeled Premium in the listing (probably free; verify):**
  - period and cycle tracking, with predictions for regular and irregular cycles;
  - logging of 70+ symptoms and moods, and pre-period symptom patterns;
  - summaries to share with a doctor;
  - fertile-window and ovulation predictions based on logged periods;
  - basal body temperature (BBT) tracking;
  - daily insights for trying to conceive (TTC), and partner tools;
  - "Flo for Pregnancy": week-by-week updates, checklists, visuals and diagrams, symptom tracking, reminders, and organization tools;
  - a teen mode with age-appropriate education;
  - perimenopause tracking with a monthly "Perimenopause Score";
  - Anonymous Mode;
  - "Secret Chats", an in-app community.
- **Premium:**
  - daily personalized insights;
  - expert-led video courses on fertility, pregnancy, and birth;
  - in-depth pregnancy features "for every milestone and baby stage";
  - a Symptom Checker covering PCOS, endometriosis, and fibroids;
  - ovulation insights for TTC;
  - a 24/7 virtual Health Assistant;
  - Flo for Partners, which shares cycle predictions or pregnancy progress and lets the user control what is shared.
- **Reported by users:** pattern-based health alerts (for example, "your symptoms match people with PCOS; consider asking your doctor"). Flo has also moved some features from the free plan to Premium over time.
- **Likely but unverified:**
  - a calendar view;
  - logging categories such as flow, discharge, sex and sex drive, ovulation and pregnancy tests, weight, water, sleep, physical activity, digestion, contraception or pills, and notes;
  - reminders;
  - an app passcode;
  - Apple Health and Apple Watch integration;
  - data export.
- **Other apps to mine for beyond-Flo ideas (verify current features):**
  - Clue;
  - Natural Cycles (FDA-cleared birth control based on temperature and LH tests, which shows what contraception-grade accuracy requires);
  - Stardust;
  - Cycles (built around partner sharing);
  - Apple Health Cycle Tracking;
  - privacy-first open-source apps such as drip. and Euki.

## 6. Step-by-step process

Work through these steps in order, following the stages in Section 1a. Plan files go in `docs/plan/` in the repository, with `docs/plan/plan.md` as a short, scannable index. For every factual claim, give the source (URL and access date), label the claim **Documented**, **Reported**, or **Inferred**, and state your confidence.

### Step 0 — Restate and clarify
- Restate the goal, the constraints, and your assumptions in 10 bullets or fewer.
- Ask only questions that truly block planning: at most 5, one at a time. For anything else, make a reasonable assumption and record it.
- Also write 3–5 non-blocking "Questions for my girlfriend", for example which categories she'd share by default and what she most wants from the app. Until she answers, sharing defaults to off.

### Step 1 — Research in parallel (orchestrated, low-cost)
Dispatch R1–R6 as Firstmate scout tasks, at most 3 running at once, defaulting to `github-copilot/gpt-6.1-sol` with **high or above** thinking. A documented per-task override may use `github-copilot/gpt-6-luna` at high or above. Scouts don't share the first mate's context, so give each one a self-contained, focused brief and the citation rules above. These tasks collect factual evidence; architectural decisions and evaluative medical, algorithm, privacy, or security audits use the Opus profile in Step 9. Each report starts with a summary of one page or less listing the findings that affect decisions, and stays under about 3,000 words plus citations.

- **R1 — Flo feature inventory:**
  - Cover every free and Premium feature as of today, and how the free/Premium split has changed over time.
  - Explain how the features tie together: which logged data feeds which prediction, insight, reminder, report, or mode.
  - Cover Flo for Partners in detail: what the partner sees, and how invitations, sharing controls, and revocation work.
  - Sources: the App Store listing and version history; Flo's help center, website, blog, and press releases; reputable reviews; video walkthroughs; and user forums for observed behavior.
- **R2 — Flo's methods:** Find everything Flo has published about how these work: period and ovulation predictions, insights, the Perimenopause Score, the Symptom Checker, and the Health Assistant. Sources: the help center, engineering blog, peer-reviewed papers by Flo-affiliated authors, and patents. Classify each method as documented, partially documented, or undocumented.
- **R3 — Evidence-based methods and clinical references for every computation:**
  - Computations to cover:
    - next-period prediction for regular and irregular cycles, including unusual cycles (outliers) and missed logs;
    - ovulation and fertile-window estimation using the calendar method, the BBT temperature shift, LH tests, cervical mucus, and symptothermal rules (which combine temperature and mucus);
    - the chance of conception on each cycle day;
    - due date and gestational age, including IVF dating, and pregnancy milestones;
    - perimenopause staging and scoring;
    - warning-sign thresholds for cycle length, period length, and bleeding;
    - symptom-checker criteria.
  - Clinical references to verify:
    - Wilcox et al. 1995 (*NEJM*) and 2000 (*BMJ*) on the fertile window;
    - Bull et al. 2019 (*npj Digital Medicine*) on real-world cycle characteristics;
    - Fehring et al. 2006 on how cycle phases vary;
    - ACOG Committee Opinion 700 on estimating the due date;
    - FIGO's system for classifying abnormal uterine bleeding;
    - the STRAW+10 stages of reproductive aging;
    - validated menopause symptom scales (check licensing);
    - the 2023 international PCOS guideline;
    - ESHRE's endometriosis guideline;
    - NICE's heavy menstrual bleeding guideline.
  - Other sources to check:
    - open-source, privacy-first trackers such as drip. (check licenses before reusing any code);
    - public cycle datasets that can be used for backtesting (verify provenance and license).
- **R4 — iOS Safari and PWA capabilities as of today:**
  - storage quotas, and the rules for when stored data is evicted or kept, including for Home Screen apps;
  - IndexedDB and OPFS;
  - Web Push for Home Screen apps;
  - limits on background execution;
  - WebAuthn passkeys, and the PRF extension for deriving encryption keys;
  - Web Share and file export;
  - WebGPU, for an optional on-device model;
  - install and update behavior;
  - known bugs.
- **R5 — Storage, sync, hosting, and notification options** within the Section 3 constraints (see Step 5), including syncing between two phones, free-tier limits, terms of service, and security implications.
- **R6 — Beyond Flo:**
  - Features in other trackers (see Section 5) and couples apps that support our goals: partner sharing and couple communication, sex-life and libido insights, contraception support, and privacy features.
  - Evidence on how desire, mood, and energy change across the cycle. Starting references to verify: Roney & Simmons 2013 (*Hormones and Behavior*); Wilcox et al. 2004 (*Human Reproduction*) on how often couples have sex around ovulation. Note that individual patterns vary, so insights should come from her own logs.
  - Ideas from first principles. For example: quick logging via iOS Shortcuts; correlations between sleep, stress, or alcohol and symptoms; tracking heavy bleeding with a validated chart (PBAC); a check-in flow for a late period or pregnancy scare; and privacy extras such as a quick-hide screen.
  - Score each candidate on value to us, effort, and privacy risk.

Then dispatch one cross-check scout in a separate session, defaulting to `github-copilot/gpt-6.1-sol` with **high or above** thinking (or a documented `github-copilot/gpt-6-luna` override at high or above), to check the decision-relevant claims in each report and flag contradictions. Give it a self-contained brief and the source evidence, not just the researchers' conclusions. This evidence cross-check does not replace the independent Opus medical-safety and algorithm audits. Every claim about whether a feature is free or Premium needs at least two independent sources.

### Step 2 — Feature inventory and parity matrix
Build a table with these columns: ID (`F-###`), source (Flo or Beyond Flo), feature, Flo tier (Free, Premium, or moved between tiers), what it does, inputs and outputs, decision, priority (MoSCoW), and phase.

- **Decisions for Flo features:** the default is **Replicate**. The alternatives are **Adapt** (say how), **Replace** (for privacy or IP reasons), **Not applicable** (for our two-person use), and **Not feasible on iOS web** (give the closest alternative). Each alternative needs a one-line justification and must appear in the "needs my approval" list.
- **Decisions for Beyond-Flo candidates:** **Add**, **Backlog**, or **Reject**, with the R6 scores. Every Add also goes on the approval list.
- **Priorities:** rank by relevance to two 21-year-olds. Cycle tracking, symptoms, mood, libido, sex logging, partner sharing, contraception, and pregnancy-test support come first. Pregnancy, postpartum, and perimenopause modes stay in scope for parity but come later.
- **Cases to think through:**
  - Teen mode: probably Not applicable, since we're both 21.
  - Secret Chats: an in-app community makes little sense for two users.
  - Video courses and the article library: write original, concise lessons with citations instead of copying.
  - The Health Assistant and Symptom Checker: local, rule-based, explain their reasoning, and cite sources.
  - Apple Health and Apple Watch: for example, import from an Apple Health export.
  - Flo for Partners: this is core for us. Build a consent-centered partner view plus a shared couple space.
- **Diagram:** add a Mermaid diagram showing how everything ties together:
  - how logged data feeds the cycle model, which feeds predictions;
  - how predictions feed the Today screen, calendar, insights, reminders, reports, and the partner view;
  - the two-person data flow: her private data, the subset she shares, and my partner view;
  - couple entries flowing between both phones, and which ones may feed her insights (only if she allows);
  - how the app switches between life-stage modes (cycle tracking, TTC, pregnancy, postpartum, perimenopause), and what changes in each.

### Step 3 — Algorithm and domain specifications
The computations include everything from R3, plus:
- her personal patterns by cycle phase (libido, mood, energy, PMS symptoms), learned from her own logs, with a minimum amount of data required before an insight appears;
- a pregnancy-chance display that never shows zero.

For each computation, specify:
- its purpose, inputs, and outputs, including an uncertainty or confidence range;
- the method, as pseudocode, and its defaults for a new user with little or no history;
- edge cases: irregular cycles; missed or late logging; outliers; hormonal contraception and withdrawal bleeds; postpartum and breastfeeding; perimenopause; pregnancy loss; spotting vs. a period; edits to past entries; time zones and daylight saving;
- whether it matches Flo's documented method or is an evidence-based substitute, with citations;
- hand-computed test vectors;
- how accuracy is measured: backtest it against simple baselines (a 28-day default and a plain average) using the mean absolute error in days and the percentage of predictions within ±1 and ±2 days.

Design the prediction engine as a pure, deterministic, versioned module, so that algorithm upgrades can be compared on the same data.

### Step 4 — Architecture
Cover:
- the stack, and why;
- module boundaries and interfaces, with contracts defined first;
- the two-person model:
  - device identities, with no accounts;
  - a pairing flow, for example scanning a QR code in person;
  - three data areas: her private data, the subset she shares, and the shared couple space;
  - permissions;
  - sync where both phones write, with predictable conflict handling (for example, CRDTs, or last-writer-wins per record with deletion markers);
- the data model: entities, fields, an enumeration for every logging category, and schema versioning and migrations;
- offline support, and a service-worker update strategy that cannot lose data;
- performance budgets: startup time on a mid-range iPhone, bundle size, and interaction latency;
- Mermaid diagrams.

Record each major choice as an ADR.

### Step 5 — Storage, sync, backup, hosting, and notifications decision
Build a weighted decision matrix. Give an explicit weight to each criterion: privacy; persistence and durability; effort to build and maintain; availability from anywhere and offline; attack surface; cost (must be $0); and how easily we can export the data and switch away. Evaluate at least these options; each must support syncing between our two phones:

1. Local-first on each phone (IndexedDB or OPFS in the Home Screen app), with encrypted manual exchange and backups (for example, files shared through AirDrop or iCloud Drive, or QR codes).
2. Local-first, plus automatic end-to-end-encrypted sync through a **separate** private GitHub data repository, accessed through its API with fine-grained tokens limited to that repository. Never use the code repository for data.
3. Local-first, plus end-to-end-encrypted sync through a free serverless store, such as Cloudflare Workers with KV, R2, or D1.
4. Local-first, plus end-to-end-encrypted sync through a free backend-as-a-service, such as Supabase or Firebase.
5. Peer-to-peer sync directly between the two phones.
6. Options ruled out by the constraints (explain why): self-hosting at home, and CloudKit JS (which requires the paid Apple Developer Program).

Also address:
- **Pairing and key exchange:** encryption per category, so my phone can't decrypt anything she hasn't shared; revocation through key rotation; and unpairing (either of us can unpair, my phone then deletes her shared data, and say what happens to the couple entries each of us wrote).
- **iOS data-loss risks** (the browser clearing stored data, deleting the Home Screen app, losing a phone), and how the design survives each one.
- **Key management and recovery** (what happens if either of us forgets a passphrase), backup frequency and reminders, and test restores.
- **Hosting for the app's static files:** for example, GitHub Pages vs. Cloudflare Pages vs. others. Compare private-repository support, custom security headers, preview deployments, and access restrictions.
- **Reminders without an always-on server,** for both of us. Partner notifications (for example, "her period will probably start in about 2 days") only cover categories she shares. Options include:
  - Web Push sent by a free scheduled job, with empty payloads so that the service worker writes the message from local data;
  - calendar (.ics) export;
  - in-app reminders only.

  State what metadata each option leaks. Also resolve the conflict between notifications and encryption at rest: while the app is locked, its service worker can't read the encrypted data.

Pick one combination, explain it in plain language, and write the ADR.

### Step 6 — Privacy and security design
- **Threat model:** my phone receiving more than she chose to share; pressure to share (she can pause sharing without explaining); either phone being lost, stolen, or left unlocked; someone looking over our shoulder; a compromised host or dependency (supply chain); cross-site scripting (XSS); a breach at a cloud provider; legal requests to third parties.
- **Privacy and consent rules:** turn each one into a testable requirement.
- **Encryption design:** the key hierarchy, algorithms, key derivation, keys per category for sharing, the passkey and Face ID option, key rotation, and recovery.
- **Also specify:** the Content Security Policy and security headers, the dependency policy, secure deletion, and how secrets are handled (none in the repository).

### Step 7 — UX and content
- Two experiences: hers (the full tracker) and mine (the partner view plus the couple space).
- Information architecture and navigation.
- Key screens and flows: onboarding without an account, including pairing; Today; quick log; calendar; cycle and symptom insights; reports; life-stage modes; reminders; sharing controls she can find instantly (share, pause, revoke, see what he sees); the couple space; and settings (privacy and backup).
- Wireframe-level descriptions; ASCII or Mermaid is fine.
- Empty states and the first-cycle experience.
- The tone of the app's text: warm and respectful. Partner tips are specific to her and never stereotyping.
- How uncertainty and medical disclaimers appear without clutter.
- Accessibility.
- A plan for original educational content: topics mapped to Flo's content areas plus sexual wellbeing (consent, communication, contraception, STI prevention), with sources and a fact-checking review step.

### Step 8 — Verification strategy and quality gates
- Define the test pyramid and tools:
  - unit tests, and property-based tests for prediction invariants;
  - the golden test vectors from Step 3, and a backtesting harness;
  - component tests, and end-to-end tests in WebKit with iPhone device emulation;
  - tests for offline use and app updates;
  - migration tests;
  - encryption round-trip and wrong-passphrase tests, and a backup-and-restore round trip;
  - tests that permissions hold at the data and encryption level (my phone can never decrypt a category she hasn't shared);
  - two-device sync and conflict tests;
  - pairing, revocation, key-rotation, and unpairing tests;
  - test runs in several time zones;
  - accessibility scans and performance budgets;
  - a "no unexpected network requests" test;
  - screenshots at iPhone sizes.
- Define a Definition of Ready and a Definition of Done for tasks.
- Define the gate for each phase.
- Write a smoke-test checklist for both of us to run on our real iPhones during phase demos.

### Step 9 — Agent operating model (how execution will run on Firstmate after approval)
Firstmate already provides the orchestration loop, worktree isolation, supervision, and backlog. Design the operating model on top of it.

- **Roles, mapped to Firstmate:**
  - **Orchestrator:** the first mate. It owns the backlog and task graph, writes briefs, dispatches, enforces gates, and brings me decisions. It stays read-only over project files; integration is its own ship task after each wave.
  - **Implementers:** ship tasks, one crewmate per task, each in an isolated worktree. Each crewmate runs the build, linters, and tests itself before reporting, so there's no separate test-runner agent.
  - **Independent verifiers:** scout tasks in separate sessions from their implementers, reviewing the exact candidate revision in their own isolated workspace. They do not edit reviewed source, commit, merge, or ship changes; reports and test artifacts go outside the reviewed source. A scout label or separate worktree is not a read-only security boundary. Pi has no built-in sandbox or per-call approval system, so verify tool and operating-system safeguards as described below. Verifier types:
    - a code reviewer;
    - a spec and acceptance verifier;
    - an algorithm auditor, who recomputes expected results from the spec and citations before looking at the implementation;
    - a UX and accessibility verifier, who takes screenshots at iPhone screen sizes;
    - a privacy, consent, and security reviewer;
    - a medical-content fact-checker.
  - **Plan critic** and **researcher:** scout tasks.
- **Model and credit policy (`~/firstmate/config/crew-dispatch.json`):**
  - This is the routing source of truth, not a second project-local dispatch file. Firstmate interprets its natural-language rules and passes explicit harness, model, and effort flags; the JSON does not automatically count retries, enforce rule priority, restrict tools, or gate merges.
  - Apply this priority at dispatch: **Opus high-risk verification → Opus extensive/design/escalated work → Sol source research → Luna bounded high-risk implementation → Luna bounded routine work**. Prefer the more specific high-risk or extensive profile when conditions overlap; use the Luna default only for other bounded low-risk work after assessing risk. Unknown risk is not low risk.
  - Research and factual evidence cross-checks default to `github-copilot/gpt-6.1-sol`. A documented per-task override may use `github-copilot/gpt-6-luna`. Medical-safety judgments, algorithm audits, architectural decisions, and privacy/consent/security reviews use Opus even when they consult sources.
  - Bounded routine implementation and low-risk independent reviews use `github-copilot/gpt-6-luna`. Bounded high-risk implementation may also start on Luna, but only with an approved design and clear acceptance tests, and with independent Opus verification required before merge.
  - Plan synthesis, plan critique, architectural decisions, extensive or ambiguous multi-file implementation and refactors, and high-risk work lacking an approved design or clear tests use `github-copilot/claude-opus-5.5` from the outset; do not require failed Luna attempts first.
  - **High is the minimum thinking level for every role.** Use a higher level only when supported and warranted by task complexity, and record it. Verify the resolved model and actual thinking at worker startup because Pi clamps thinking to model capabilities; do not silently downgrade below high or substitute another model. Request `max` only for an explicit task-level instruction.
  - For an implementation task, escalate the next attempt to Opus after **two documented failed fix-and-test rounds**. One round is an attempted correction followed by the relevant tests and review of outstanding findings. Firstmate records the round number, model, actual effort, candidate revision, failed checks or independent findings, attempted fix, and retest evidence in backlog notes and the next brief. Missing credentials, infrastructure failures, and unresolved requirements are blockers, not failed implementation rounds; changing models does not reset the task's three-fix-round limit.
  - Check exact IDs in `pi --list-models` before dispatch. Treat the cost-conscious model split as a policy to validate with measured Copilot usage, latency, and failure rates; the catalog proves availability, not relative price or quality.
- **Loop for every task:**
  1. Write the brief.
  2. Implement, with tests.
  3. Run the gates.
  4. Get independent verification.
  5. Fix any problems (at most 3 rounds).
  6. Mark the task done, or blocked with evidence.
  7. Merge.

  A task is never verified by the crewmate that implemented it. Give the verifier the specification, acceptance criteria, exact candidate revision, test vectors, and source evidence, not just the implementer's summary. Algorithm auditors derive expected results from the specification and citations before inspecting the implementation. Verifiers report evidence (commands run, outputs, failing cases), not opinions; link their reports in the backlog.
- **Risk-based verification depth** (saves credits without lowering quality):
  - High-risk tasks (prediction and medical algorithms, encryption, key exchange, sync, permissions and consent, the data layer, migrations, backup and recovery, and medical content) get a dedicated verify scout on `github-copilot/claude-opus-5.5` at high or above, using only the verifier types that apply, usually one or two, not all six.
  - File verification as a required dependency before merge. Automated tests passing, successful implementation on the first attempt, or escalation to Opus never waives independent review. Do not mark the task verified or authorize merging until the required reports pass. If reviewed source changes, rerun the affected gates and obtain renewed independent review of the changed scope against the new candidate revision.
  - Low-risk UI tasks get the automated gates plus one independent Luna/high-or-above review scout per wave.
- **Verifier safeguards (prove during Phase 0):**
  - Use an isolated workspace for the exact candidate revision and restrict tools to the review's needs while preserving Firstmate's required status/report delivery. Permit report and test-artifact writes only outside the reviewed source; keep tests on synthetic data and exclude unrelated projects and secrets.
  - Disabling `edit` and `write` alone is insufficient when `bash`, extensions, or other executable tools can still write. If such tools are needed for tests or screenshots, use an operating-system sandbox or read-only filesystem boundary for reviewed source and unrelated host paths, with a separate writable scratch/output area. A worktree or prompt instruction alone does not provide this protection.
  - Validate these restrictions with a disposable fixture before relying on them: prove reading and reporting work, source writes are refused through every enabled executable path, and unrelated host resources are not exposed. Record the launch configuration and evidence in `docs/plan/agent-operating-model.md`. If the safeguards cannot be verified with the installed Firstmate adapter, record that as a Phase 0 blocker instead of claiming read-only enforcement or silently changing the launcher.
- **Task briefs are self-contained.** Each one includes:
  - the goal and background;
  - the files the task owns, and files it must not touch;
  - interfaces and contracts;
  - acceptance criteria in Given/When/Then form;
  - test commands and any reference test vectors or source evidence;
  - the relevant constitution rules;
  - risk, matched dispatch rule, resolved model and effort, prior fix-round count, and the evidence for any escalation;
  - for verifiers, the exact candidate revision, report/output location, source-write restrictions, and the mandatory independent review gate;
  - the expected report format: files changed or revision reviewed, evidence, and open issues, in about 15 lines or fewer.

  Briefs point to files by path instead of pasting their contents.
- **Parallelism:**
  - Group ready tasks into waves. Tasks in the same wave never edit the same files. Run at most 3 crewmates at once unless I raise the limit.
  - Shared contracts (types, schema, design tokens, interfaces) are built first, in foundation tasks that run one at a time. An integration ship task follows each wave.
  - Make verification its own backlog item (for example, `p1-calendar-impl` → `p1-calendar-verify`).
- **Backlog and tracking:**
  - Firstmate's backlog is the source of truth: one item per task, verify task, and gate, with dependencies, phase, type (feature / verify / gate / chore), risk, and feature IDs (`F-###`).
  - Delivery: PRs to the private GitHub repository, or local-only merges if I choose that in Phase 0.
  - Optional: a GitHub Projects board that shows phases and gates only, updated at each gate rather than per task, to save tool calls.
- **State and traceability:**
  - Each phase ends with a `gate-phase-N` backlog item held for me (a captain hold), and every task in the next phase depends on it. I approve a gate by replying "continue", and the first mate records the approval.
  - Make one git commit per task, using Conventional Commits. Record decisions as ADRs in `docs/adr/`, and keep a progress log in `docs/progress.md`.
- **Escalation:**
  - Decide everything yourself except at the Section 3 checkpoints.
  - Escalate the next implementation attempt to Opus after two documented failed fix-and-test rounds, as defined above. If the task still fails after three total fix rounds, stop retrying that approach, mark it blocked with evidence, and propose a different approach or plan revision. A revised approach needs a new explicit brief and recorded rationale, not a silent reset of the counter. Save anything still unresolved and bring it to me together at the next checkpoint.
  - Collect all account, repository, and credential requests (GitHub, hosting, push-notification keys) in Phase 0, so that later phases can run without me.
- **Phase demo package:**
  - what's new;
  - how both of us can try it on our iPhones (a preview URL with synthetic data);
  - screenshots;
  - the test and verification report;
  - known issues, and decisions made;
  - what's next.

  Then stop and wait until I say "continue".
- **Set up this model during Phase 0:**
  - the git repository (private GitHub, or local-only), registered as a Firstmate project;
  - `AGENTS.md` at the repository root with the constitution, coding standards, and Definition of Done. Keep it under about 150 lines, because every crewmate loads it; put long references in skills or `docs/` instead;
  - validate the role rules in `~/firstmate/config/crew-dispatch.json`, verify model availability and actual thinking, and prove the verifier safeguards above; do not create a competing project-local dispatch configuration;
  - reusable skills in `.agents/skills/<name>/SKILL.md`, for example the task-brief format, the verification protocol for each verifier type, and a cycle-math reference. Check that Pi loads skills from that folder; if it doesn't, use the folder Pi documents, or reference the files from `AGENTS.md`;
  - the Firstmate backlog, loaded from `docs/plan/backlog-import.md`.

### Step 10 — Roadmap and task graph
Define the phases. Give each one a goal, its scope (feature IDs), exit criteria, and demo contents. Here is a suggested outline; adapt it to what the research finds:

- **P0 — Foundation:** the repository, the Firstmate backlog and dispatch rules, tooling, local automated checks, the app shell, the encrypted data layer, the design system, agent setup, and account requests.
- **P1 — Core tracking (her):** onboarding, logging (period, symptoms, mood, libido, sex), the calendar, a first version of predictions, and the Today screen.
- **P2 — Couple features:** pairing, encrypted sync and backup, sharing by category with pause and revoke, the partner view, couple entries, and partner notifications.
- **P3 — Cycle intelligence:** ovulation and fertile-window estimates using BBT, LH tests, and cervical mucus; irregular cycles; health warnings; insights about her personal patterns; charts; and the doctor report.
- **P4 — Contraception and life-stage modes:** contraception tracking and reminders, late-period and pregnancy-test support, TTC, pregnancy, postpartum, and perimenopause.
- **P5 — Premium equivalents and Beyond-Flo additions:** the symptom checker, the local assistant, personalized daily insights, the content library, and the approved Beyond-Flo features.
- **P6 — Hardening and launch:** a security review, performance and accessibility work, production deployment, and a user guide for both of us.
- **P7 — Stretch goals:** an on-device model, and data imports.

Write full task detail only for P0–P2 (see "Plan depth" in Section 9). Each of those tasks needs an ID, title, phase, dependencies, owned files, brief, acceptance criteria, verification steps, roles, and a risk level. Keep each task small enough for one crewmate to finish in one pass. Then:
1. Write every P0–P2 task, verification task, and phase gate as a Firstmate backlog item with its dependencies, in `docs/plan/backlog-import.md`.
2. Confirm the dependency graph has no cycles.
3. Identify the first waves of tasks that can run in parallel.
4. For P3–P7, list the planned feature IDs, exit criteria, and demo contents only. Their tasks get written at the gate before each phase.

### Step 11 — Self-critique before presenting
1. Have a plan-critic (rubber-duck) agent review the full plan against the Section 8 checklist, and fix what it finds.
2. Run a consistency check:
   - every P0–P2 feature maps to tasks and tests, and every later feature maps to a phase;
   - every task has acceptance criteria and owned files;
   - no two tasks in the same wave touch the same file;
   - every rule in Sections 3 and 4 has a way to enforce it;
   - every consent rule has a test.

## 7. Required outputs

**`docs/plan/plan.md`:** a scannable index with these sections:
1. Executive summary (readable by a non-expert)
2. Glossary
3. Users, roles, and consent model
4. Assumptions and decisions
5. Feature parity matrix (summary, linked to the full matrix)
6. Beyond-Flo features (scored)
7. How everything ties together (diagram)
8. Algorithms (summary)
9. Architecture, plus the storage and sync decision
10. Privacy and security
11. UX
12. Verification strategy
13. Agent operating model, including the model and credit policy and the kanban board
14. Roadmap, phases, and gates
15. Task list (summary)
16. Risks and mitigations
17. Questions for my girlfriend
18. Open questions and items needing my approval, including every feature that won't be a straight replication and every Beyond-Flo addition

**Supporting files in `docs/plan/`:**
- research reports R1–R6 and the cross-check, copied from the scout reports, with citations;
- `feature-parity-matrix.md`;
- `algorithms-spec.md`;
- `architecture.md`;
- `docs/adr/*.md`;
- `security-privacy.md`;
- `ux-spec.md`;
- `test-strategy.md`;
- `agent-operating-model.md`;
- `task-briefs.md`;
- `backlog-import.md`: one Firstmate backlog item per P0–P2 task, verify task, and gate, with its title, body, labels, phase, and dependencies. Optionally, `board-import.csv` with phases and gates for a GitHub board.

**Firstmate backlog:** after I approve, the first mate loads `backlog-import.md` into its backlog.

## 8. Quality checklist (the plan isn't finished until every item is true)
- [ ] Every Flo feature found in research appears in the parity matrix with a decision. Every deviation from Replicate is justified and listed for my approval.
- [ ] Beyond-Flo candidates are scored, and each one is marked Add, Backlog, or Reject.
- [ ] Every computation states whether it matches Flo's documented method or is an evidence-based substitute, with citations, edge cases, and test vectors.
- [ ] Every consent rule (Section 4, rule 1) is enforced by encryption or data separation, and has a test.
- [ ] No screen, insight, or notification implies a "safe day" or that the app is birth control.
- [ ] The storage and sync decision shows the scored options, a plain-language recommendation, and a tested plan for pairing, backup, restore, and recovery.
- [ ] Every privacy and security rule has an automated check or a named review step.
- [ ] Every P0–P2 task is small and self-contained, with owned files, acceptance criteria, verification commands, and a risk level. The dependency graph has no cycles, tasks in the same wave share no files, and the task list is ready to load into the Firstmate backlog.
- [ ] Every phase ends with a gate, a verification report, and a demo we can both try on our iPhones.
- [ ] Research ran on `github-copilot/gpt-6.1-sol` or a documented `github-copilot/gpt-6-luna` override, and every execution role has a recorded model choice with thinking of high or above.
- [ ] The operating model specifies routing priority, evidence-backed escalation after two failed fix-and-test rounds, and passing independent Opus verification before any high-risk merge; model changes cannot reset the three-fix-round limit.
- [ ] Phase 0 includes disposable-fixture verification of the review workspace and tool safeguards, with unresolved enforcement gaps recorded as blockers rather than described as read-only protection.
- [ ] Nothing depends on paid services, an always-on server, or a cloud AI.
- [ ] Nothing copies Flo's content or branding.
- [ ] Someone with no domain knowledge (me) can follow the executive summary and glossary.

## 9. Working rules
- Use tools to look things up. Never guess Flo's behavior or iOS capabilities; cite a source or label the claim Inferred.
- When sources conflict, prefer primary sources (Flo's own pages, standards bodies, clinical guidelines, peer-reviewed papers), and note the conflict.
- Spend research effort where it changes decisions (features, algorithms, iOS limits, storage and sync), not on marketing copy.
- Be economical with credits: don't repeat research, keep sub-agent briefs focused, respect the fix-round limits, and reuse results.
- Choose the simplest design that meets the requirements. Avoid adding complexity for situations that may never happen.
- Keep going until the plan meets every checklist item, then present it for my approval and stop.
- **Plan depth:** Research and the parity matrix cover every phase. Detailed tasks (briefs, owned files, acceptance criteria, backlog items) cover P0–P2 only. P3–P7 get scope, exit criteria, and demo contents, and are detailed at the gate before each one, using what we've learned by then.
- **Token budget:** Downstream tasks read the one-page summaries of research reports first and open the full report only when a decision needs it. No crewmate re-researches something an earlier report already answered.
