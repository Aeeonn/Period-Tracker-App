# Feature inventory and parity matrix (Step 2)

**Status:** Stage E revision, 2026-10-02. Critiqued in Stage D and corrected in Stage E ([stage-e-resolution.md](stage-e-resolution.md)); not yet approved (Stage F). No feature decision changed in Stage E.
**Inputs:** [R1](research/R1-flo-feature-inventory.md), [R2](research/R2-flo-methods.md), [R6](research/R6-beyond-flo.md), corrected by the [Stage B cross-check](research/crosscheck-stage-b.md). All sources accessed 2026-10-02.

## How to read this matrix

- **Scope claim.** This lists every Flo *functional group* found by public research (R1 §1, R2, cross-check §1). R1 and the cross-check both say no installed-app walkthrough happened. The list is therefore **not** proof of full observed Flo parity (Documented limitation, high confidence).
- **Tier labels.** The prompt requires two independent publishers for any free/Premium claim. Two Flo pages, or Flo's own App Store text, count as one source (cross-check "independence gate").
  - **Free ✓2** / **Premium ✓2**: two independent publishers agree. The only such pairs are Flo plus Medical News Today (2022) for broad logging and predictions, and for personalized insights and courses. Even these are **not fresh 2026 confirmation**.
  - **Free-U / Premium-U**: the publisher says so, but it is not independently verified.
  - **Conflicting-U**: Flo's own sources disagree.
  - **Unknown-U**: no tier statement was found.
  - **n/a**: a Beyond-Flo feature.
- **Evidence labels.** D = Documented, R = Reported, I = Inferred. H/M/L = confidence in the evidence. Unless marked otherwise, Flo existence claims are D-H from R1 §1. Short source keys such as `R1:PT` point to the citation ledgers in the research copies.
- **Decisions.**
  - Flo features use **Replicate** (the default), **Adapt**, **Replace**, **Not applicable** or **Not feasible on iOS web**.
  - Beyond-Flo features use **Add**, **Backlog** or **Reject**.
  - Every decision other than Replicate, and every Add, is listed in the approval list in [plan.md §18](plan.md#18-open-questions-and-items-needing-approval).
- **MoSCoW** ranks relevance to two 21-year-olds, using the prompt's priority order and the cycle owner's answers in Stage C notes. Her stated priorities are:
  - period and cycle tracking;
  - knowing when she has tended to feel like sex;
  - optional sharing;
  - reminders to log periods and symptoms;
  - cited "did you know" education.
- **Phase** follows the [roadmap](roadmap.md). Features marked P1/P2 with a later note get a basic version in that phase and an expanded version later.

## Matrix — Flo functional groups

| ID | Src | Feature | Flo tier (evidence) | What it does | Inputs → outputs | Decision | Justification (one line) | MoSCoW | Phase |
|---|---|---|---|---|---|---|---|---|---|
| F-001 | Flo | Period logging | Free ✓2 (R1:F + R1:I1; I5 user corroboration) | Log/edit period start, end and history; Flo auto-logs the end from settings | Daily flow, start/end edits → period episodes | Replicate | Core; auto-filled days are shown as "assumed" until confirmed (same function, more transparent) | Must | P1 |
| F-002 | Flo | Cycle day and phase display | Free ✓2 | Shows cycle day N and estimated phase | Episodes, predictions → cycle day, phase label with uncertainty | Replicate | Core display | Must | P1 |
| F-003 | Flo | Next-period prediction (regular and irregular) | Free ✓2 | Predicts the next period with a countdown | Period history and settings → point date plus window | Adapt | Flo uses an undisclosed ML model (R2 §1); we use a transparent, versioned, evidence-based estimator that keeps Flo's documented rules (12 cycles, >90 days excluded, older than one year excluded) | Must | P1 (v1), P3 (irregular refinements) |
| F-004 | Flo | Late/delayed period state and arrival window | Free-U (R2:4) | Arrival window; a late notice when no period is logged | Window, today → "late by N days", test guidance | Adapt | Flo moves the predicted date day by day (R2:4); we keep the window fixed and state lateness plainly, so the uncertainty stays honest | Must | P1 |
| F-005 | Flo | Calendar (month/year, colour-coded history and predictions) | Free-U (R1:CP) | Browse logs and predictions | Logs, predictions → calendar cells | Replicate | Core | Must | P1 |
| F-006 | Flo | Today screen with countdowns | Free-U (R1:CP) | Daily summary and quick actions | Predictions, logs → Today card | Replicate | Core; three-tap logging rule | Must | P1 |
| F-007 | Flo | Ovulation and fertile-window estimate (calendar-based) | Free ✓2 | Estimated ovulation and fertile days | Predictions → core window (Flo's documented 7-day envelope) plus wider "possible" band | Adapt | Flo's documented 7–14-day rule (R2:7) is kept as "most likely days", with an extra evidence-based uncertainty band (Wilcox 2000: only ~30% have the whole window inside days 10–17); never "safe days" | Must | P1 |
| F-008 | Flo | Daily pregnancy-chance indicator | Free-U (R1:CP) | Low/medium/high-style daily category | Fertility estimate → category | Adapt | Qualitative Lower/Medium/Higher, **never zero**, no percentages; no calibrated personal curve exists (R3 §3, cross-check 14) | Must | P1 |
| F-009 | Flo | Symptom and mood logging with customizable trackers | Free ✓2 (counts 70+/80+/50+ are lower bounds, cross-check 5) | Many symptom/mood options; choose visible trackers | Taps → dated entries | Replicate | Original enumeration of ~90 options ([architecture.md §5](architecture.md#5-data-model)); exact Flo labels unverified and never copied | Must | P1 |
| F-010 | Flo | Flow logging (light/medium/heavy/clots; one per day) | Free-U (R1:LG) | Bleeding intensity per day | Taps → flow entries | Replicate | Plus heavy-bleeding detail fields (product-change frequency, clot size, flooding) that feed guideline-based warnings | Must | P1 |
| F-011 | Flo | Discharge and spotting logging | Free-U (R1:LG) | Spotting separate from period | Taps → entries | Replicate | Spotting never starts a period (algorithms A1) | Must | P1 |
| F-012 | Flo | Sex and sex-drive logging | Free-U (R1:LG; I1 reports sex drive) | Sex events and libido | Taps → entries | Replicate | Plus protection used, comfort/pain and satisfaction (F-105) | Must | P1 |
| F-013 | Flo | Other trackers: weight, water, sleep, activity, digestion, stress/energy, notes | Free-U | Lifestyle logs; notes are private | Entries → history, patterns | Replicate | Manual entry; notes are never shareable | Should | P1 |
| F-014 | Flo | Pregnancy-test and ovulation-test result logging | Free-U (pregnancy-test UI not directly verified, R1:LG) | Record test results | Results → logs; LH positives feed ovulation (P3) | Replicate | Prompt priority: pregnancy-test support | Must | P1 |
| F-015 | Flo | Contraception method setting (affects predictions) | Free-U (R1:BC) | Hormonal methods suppress fertile predictions; copper IUD keeps them | Method → suppression flags | Replicate | Flo's documented behaviour (R2:24) | Must | P1 |
| F-016 | Flo | Pill/contraception intake log and schedule-aware predictions | Free-U (R1:BC) | Pack length sets cycle length; continuous use; intake log | Schedule, intake → withdrawal-bleed prediction, reminders | Replicate | Also allows emergency-contraception logging, which Flo explicitly does not support (R1:BC) | Must | P4 |
| F-017 | Flo | Reminders shown inside the app (period, "still bleeding?", symptom log, pill, custom) | Free-U (R1:NT) | Prompts to log | Schedule, state → in-app prompts | Adapt | Checked while the app is unlocked; her stated ask (period and symptom logging reminders) | Must | P1 |
| F-018 | Flo | Reminder notifications while the app is closed | Free-U | Push reminders | Fixed daily time → generic push; details after unlock | Adapt (partly Not feasible on iOS web) | iOS web has no local alarm scheduler and no silent push (R4 §3); we use a generic daily Web Push from a free scheduled job, and the text stays generic because the locked app cannot decrypt | Should | P2 |
| F-019 | Flo | Manual cycle exclusion / remove big gap | Free-U (R1:GP) | Exclude a cycle from predictions | Flag → engine exclusion | Replicate | Flo's documented rule | Should | P1 |
| F-020 | Flo | Onboarding (goal, typical lengths, last period, birth year) | Free-U (R1:ON) | Set up a profile | Answers → defaults | Adapt | No account or registration; everything stays local | Must | P1 |
| F-021 | Flo | Settings: units, calendar, language | Free-U (R1:ON) | °C/°F, kg/lb, week start, theme | Settings → display | Adapt | English only at first; adding a language is a later content task | Should | P1 |
| F-022 | Flo | Reset / delete all data | Unknown-U (R1:AC) | Erase account data | Action → wipe | Replicate | Constitution rule 3; the local wipe comes first, then relay deletion and a deletion request to the partner's phone (P2) | Must | P1 (local), P2 (relay) |
| F-023 | Flo | Data export (Flo: TXT/JSON by support request) | Unknown-U (R1:EX) | Get a copy of the data | Data → files | Replicate | Better than Flo: self-serve JSON and CSV export and import (constitution rule 8) | Must | P1 |
| F-024 | Flo | Passcode / Face ID lock | Unknown-U (R1:AC) | App lock | Passphrase/biometric → unlock | Replicate | Passphrase first (P0); optional Face ID through passkey PRF once tested on real phones (P2) | Must | P0, P2 |
| F-025 | Flo | Registration, login, restore and cross-device sync | Unknown-U (R1:ON, PP) | Account-backed sync and restore | Account → server copy | Replace | Accounts are forbidden; we use device keys, an encrypted relay that only sees ciphertext, and an encrypted backup file | Must | P2 |
| F-026 | Flo | Anonymous Mode | Free-U (R1:AM) | Use without identity (still server-stored) | — | Not applicable | The app has no account or server identity at all, which already exceeds the feature | — | — |
| F-027 | Flo | Basal body temperature (BBT) logging and chart | Conflicting-U (Premium-addressed TTC page vs ungated help; cross-check 5) | Temperature log and chart | Readings → chart, shift detection | Replicate | Shift rule written independently (A6) | Should | P3 |
| F-028 | Flo | LH test interpretation (positive → next-day ovulation) | Free-U | Fertile-window update | Peak/positive results → ovulation estimate | Replicate | Flo documented rule (R2:5) | Should | P3 |
| F-029 | Flo | Manual "ovulation: my method" entry | Unknown-U | User-confirmed ovulation day | Date → ovulation estimate | Replicate | Flo documented (R2:6) | Should | P3 |
| F-030 | Flo | Combining markers to recalculate ovulation (BBT, LH, manual) | Unknown-U | Marker priority | Markers → fused estimate | Adapt | Flo's fusion logic is undisclosed (R2); explicit priority rules; cervical mucus added | Should | P3 |
| F-031 | Flo | Cycle history and analytics (lengths, variation, six-cycle graph, "normal range" flags) | Premium-U for patterns; graph tier unknown | Charts and history | Cycles → stats and graphs | Replicate | Ranges labelled by source (ACOG vs FIGO; cross-check 13) | Should | P3 |
| F-032 | Flo | Patterns of your body / symptom forecasting | Premium-U (R1:P) | Recurring patterns | Logs → pattern statements | Adapt | Flo's calculation is undisclosed (R2 §2); transparent, rule-based tendencies with minimum evidence, coverage and a "no clear pattern" result (A12) | Must | P3 |
| F-033 | Flo | Pattern-based health alerts ("consider asking your doctor") | Reported (Section 5 user reports; R1 Assistant/Checker) | Flags concerning patterns | Logs → clinician-guidance cards | Adapt | Thresholds each tied to a cited guideline (A11) | Must | P1 (urgent and basic), P3 (full) |
| F-034 | Flo | Doctor health report (PDF) | Premium-U, iOS (R1:DR) | Printable summary | Six cycles incl. current, patterns, top five symptoms → PDF | Adapt | Flo sources conflict (six cycles vs six months; cross-check 4); default six cycles incl. current with an option for six months; local print-to-PDF; also available in pregnancy | Should | P3 |
| F-035 | Flo | Daily personalized insights ("stories") | Premium ✓2 (R1:IN + I1) | Daily cards tailored to age, goal, cycle day, symptoms | Mode, phase, recent logs → card | Adapt | Original cited cards chosen by explicit rules; her "did you know…" request | Must | P3 (P1 core cards) |
| F-036 | Flo | Trying-to-conceive (TTC) goal mode | Basic Free ✓2 / deeper Premium-U | Fertility education, timing info, prenatal vitamin reminder | Goal → content, reminders | Replicate | Original content; not a current goal, so lower priority | Could | P4 |
| F-037 | Flo | Late-period and pregnancy-test timing support | Free-U (R1:OT) | When to test | Late state, sex logs → guidance | Replicate | Extended by the F-109 check-in | Must | P4 |
| F-038 | Flo | Pregnancy mode (gestational age, due date, weekly content, symptoms, checklists, FAQs) | Split Unknown-U; advanced Premium-U | Pregnancy companion | Last menstrual period (LMP), clinician or IVF dates → gestational age, milestones | Adapt | ACOG CO700 dating (LMP+280) instead of Flo's conflicting "LMP + 41 weeks" text (cross-check 12); original content | Could | P4 |
| F-039 | Flo | Multiple-fetus count | Unknown-U (R1:PG) | Twins and more | Count → content | Replicate | Simple setting | Could | P4 |
| F-040 | Flo | Pregnancy visuals / fetus size | Premium-U | Imagery | Gestational age → visual | Replace | Intellectual property: no Flo assets; original text size comparisons or simple original illustrations | Could | P4 |
| F-041 | Flo | Pregnancy loss and return to cycle tracking | Not verified in Flo | Ends pregnancy, resumes cycles | Event → mode change, prediction reset | Adapt | The prompt names this edge case; sensitive copy; the affected cycle is excluded | Should | P4 |
| F-042 | Flo | Postpartum / breastfeeding tracking | Separate Flo mode not verified (R1 summary) | Postpartum period | Delivery date, feeding → predictions paused | Adapt | Kept because the prompt lists it; Flo's postpartum mode is unverified | Could | P4 |
| F-043 | Flo | Perimenopause tracking mode (symptoms, period-arrival window, trends, reports) | Unknown-U (2025 "all users" ≠ entitlement; cross-check 6) | Perimenopause support | Symptoms, cycles → window, trends | Adapt | Suggested only from age ≥40 (NICE NG23 identification starts at ≥45, under-40 needs a clinician); both users are 21 | Could | P4 |
| F-044 | Flo | Perimenopause Score (monthly symptom impact) | Premium-U (May 2026 suite; F4) | Severity/impact over time | Symptom answers → score | Adapt | Flo's formula is undisclosed and not the MRS (R2 §3); an original **unvalidated** impact summary; the MRS is used only after licensing review | Could | P4 |
| F-045 | Flo | Perimenopause Symptom Checker (2026) | Premium-U (F4) | Possible symptom match | Symptoms → match | Adapt | NICE NG23-sourced "talk to a clinician" rules; under-40 → clinician | Could | P4 |
| F-046 | Flo | Menopause Timeline (2026) | Premium-U (F4) | Estimated stage of the journey | Cycles, age → phase estimate | Adapt | STRAW+10 cycle signals as reproduced in a 2022 review (original full text unverified), labelled as an estimate | Could | P4 |
| F-047 | Flo | Relief Options (2026) | Premium-U (F4) | Symptom-matched information | Symptoms → cards | Adapt | Original cited cards; never a treatment recommendation | Could | P5 |
| F-048 | Flo | Medication logging and reminders | Free-U (R1:NT) | Medication reminders | Schedule → reminders, log | Replicate | — | Should | P4 |
| F-049 | Flo | Content library (articles, search, bookmarks) | Premium ✓2 for courses; every library item Unknown-U | Health education | Query → lessons | Replace | Intellectual property: original concise cited lessons; no copying | Should | P5 |
| F-050 | Flo | Expert video/audio courses | Premium ✓2 | Courses | — | Replace | Short original text lesson series; no video production | Could | P5 |
| F-051 | Flo | Health Assistant (triggered educational dialogues, history, deletion) | Premium-U | Interactive education | Triggers, questions → answers | Replace | Constitution: local rule-based, explains its reasoning, cites sources, no cloud AI; Flo's LLM experiment (R2 §5) is out of scope | Should | P5 |
| F-052 | Flo | Symptom Checker (PCOS, endometriosis, fibroids) | Premium-U; unavailable in UK/EU (R1:SY) | Possible condition match | Answers, logs → match | Adapt | Local explainable "pattern worth discussing" using 2023 PCOS, ESHRE 2022 and NICE NG88; never a diagnosis; Flo's thresholds are unpublished | Should | P5 |
| F-053 | Flo | Guided sexual-wellness program | Premium-U, 18+, iOS (R1:G) | Five-step program | Progress → lessons | Replace | Intellectual property: original cited sexual-wellbeing lessons (communication, consent, pleasure, contraception, STI prevention) | Could | P5 |
| F-054 | Flo | Pregnancy courses, yoga, birth preparation | Premium-U | Rich media | — | Replace | Brief original text only; no exercise videos | Won't (now) | P5 backlog |
| F-055 | Flo | Partner linking via invite code | Conflicting-U (help: basic free; App Store: Premium; cross-check 1) | Link a partner | Owner code → link | Adapt | In-person two-way QR plus safety code; no accounts; end-to-end encrypted | Must | P2 |
| F-056 | Flo | Partner view of cycle day/phase and predictions | Conflicting-U | Read-only partner view | Shared data → partner screens | Adapt | Category by category, off by default, "see what he sees" preview, sharing-start date, enforced by encryption | Must | P2 |
| F-057 | Flo | Partner calendar | Conflicting scope (view-only calendar vs no past/future; privacy policy excludes pre-sharing data; cross-check 2) | Shared calendar | Shared projection → calendar | Adapt | Shows only categories she shares, from her chosen start date onward; no invented full history | Should | P2 |
| F-058 | Flo | Partner notifications (significant phases) | Unknown-U | Phase alerts | Shared predictions → notifications | Adapt | Generic push text; detail visible only in his unlocked app; shared categories only | Should | P2 |
| F-059 | Flo | Mode-change disclosure to partner | Documented automatic in Flo (R1 §2.6) | Partner told of mode changes | Mode → partner notice | Adapt | Mode becomes its own share category, off by default; never disclosed automatically | Must | P2 |
| F-060 | Flo | Stop sharing / revocation | Documented (R1:PF) | Disconnect | Action → access removed | Replicate | Extended with pause, per-category revoke with key rotation, and unpair from either side | Must | P2 |
| F-061 | Flo | Partner education and tips | Premium-U extras (R1:PT) | Tips for partner | Phase → education | Adapt | Tips from her shared logs and her own support cards, never stereotypes (constitution rule 7) | Should | P5 (support cards in P2) |
| F-062 | Flo | Couple quizzes/polls | Premium-U; partial-answer visibility ambiguous (cross-check 3) | Answer separately, compare | Answers → reveal | Adapt | Private drafts; reveal only when **both** submit; can withdraw before reveal; resolves Flo's disclosure ambiguity in her favour | Could | P5 |
| F-063 | Flo | Partner games / date ideas | Premium-U (R1:ST) | Date ideas | — | Adapt | Original date-idea prompts in the couple space | Could | P5 |
| F-064 | Flo | Partner pregnancy progress | Documented (R1:PC) | Pregnancy updates for partner | Shared pregnancy → partner view | Adapt | Only if she shares the pregnancy category | Could | P4 |
| F-065 | Flo | Teen experience | Unknown-U | Age-tailored content | — | Not applicable | Both users are 21 | Won't | — |
| F-066 | Flo | Secret Chats community | Conflicting-U (help free; MNT older paid) | Anonymous community | — | Not applicable | Two users only; the closest replacement is the couple space (F-115) | Won't | — |
| F-067 | Flo | Apple Health import/sync | Unknown-U (R1:HI) | Import health data | Health permissions → logs | Not feasible on iOS web | HealthKit is a native framework with no web API (I-H; not tested); closest: import an Apple Health `export.xml` file | Could | P7 |
| F-068 | Flo | Apple Watch / fitness-device integration | Unknown-U | Watch features, steps | — | Not feasible on iOS web | No web Watch API (I-H); closest: Web Push notifications also appear on a paired Watch (R4 S6) | Won't | — |
| F-069 | Flo | Commercial administration (subscriptions, gifts, FSA, family plans) | — | Payments | — | Not applicable | Never published or monetized | Won't | — |
| F-070 | Flo | Notification preferences for community/content/offers | Free-U (R1:NT) | Marketing and community notices | — | Not applicable | No community or offers; reminder preferences live in F-017/F-018 | Won't | — |
| F-071 | Flo | Symptoms can change predictions | Documented (R2:4) | Symptoms affect the ML forecast | Symptoms → prediction | Adapt | Mechanism undisclosed; in v1 only period history and fertility markers move predictions, which is explainable and testable | Should | P1 |
| F-072 | Flo | Prediction suppression rules | Documented, but inconsistent at 20 days (R2:23) | Hide fertile predictions sometimes | Contraception, delay, extreme lengths → suppression | Adapt | Explicit rules (A2/A4); the inconsistent Flo boundary is not copied | Must | P1 |
| F-073 | Flo | Ovulation-test tutorials (strip/digital) | Unknown-U (R1:OT) | How-to | — | Replace | Original how-to text | Could | P3 |
| F-074 | Flo | IVF dating (Flo web calculator; app has no IVF logging) | Website only (R1:IV) | IVF due date | Transfer date, embryo age → due date | Adapt | ACOG transfer + embryo-age dating inside pregnancy mode | Could | P4 |

## Matrix — Beyond-Flo candidates

R6 scores (B01–B16) are **R6's ordinal, inferred scores** (V = value 1–5, E = effort 1–5, P = privacy risk 1–5; R6 §3). F-117, F-118, F-119 and F-120 are scored by this plan with the same rubric (Inferred, medium confidence). F-119 also implements a constitution requirement and is listed for traceability.

| ID | R6 | Feature | V/E/P | What it does | Decision | Justification | MoSCoW | Phase |
|---|---|---|---|---|---|---|---|---|
| F-101 | B01 | Sharing-start date, recipient preview ("see what he sees"), per-entry opt-in | 5/3/3 | Makes her control concrete | **Add** | The preview is required by constitution rule 1; start date and per-entry opt-in protect her history | Must | P2 |
| F-102 | B02 | "How can I support you?" cards (company, practical help, space) | 5/2/2 | She sends a chosen need; no health detail required | **Add** | Directly serves communication without stereotypes | Must | P2 |
| F-103 | B03 | Optional relationship check-in (private draft → deliberate share; skip allowed) | 5/3/3 | Low-pressure communication | **Add** | Strong fit; scheduled after core sharing | Could | P5 |
| F-104 | B04 | Intimacy preference conversation (no matching, no consent inference) | 4/3/3 | Discussion prompts | **Backlog** | Needs careful original content review; revisit at the P5 gate | — | P5 gate |
| F-105 | B05 | Private libido, comfort/pain and satisfaction trends; sharing separate | 5/4/3 | Wellbeing-centred trends | **Add** | Her stated ask; logging in P1, trends in P3 | Must | P3 |
| F-106 | B06 | Personal mood/energy/libido patterns with coverage and uncertainty | 4/4/3 | Her patterns, not population scripts | **Add** | Same engine as F-032 (A12) | Must | P3 |
| F-107 | B07 | Sleep/stress/alcohol vs symptoms, descriptive comparisons | 4/4/3 | Context exploration | **Backlog** | Confounding and missing data need care; revisit after F-032 is validated | — | P5 gate |
| F-108 | B08 | iOS Shortcut opens a generic Quick Log | 4/2/2 | Faster logging | **Backlog** | Routing a Shortcut into a Home Screen app is unverified (R6 §3); test on a real device first | — | P6 gate |
| F-109 | B09 | Late-period / pregnancy-scare check-in (dates, test plan, feelings, optional support request) | 5/3/3 | Calm, organized next steps | **Add** | Prompt priority (pregnancy-test support) | Must | P4 |
| F-110 | B10 | Method/pill reminder and taken/missed record (no efficacy estimator) | 5/3/2 | Daily practical need | **Add** (merged into F-016) | Prompt priority (contraception) | Must | P4 |
| F-111 | B11 | Emergency-contraception (EC), pregnancy and STI test organizer with cited cards | 4/3/3 | Organizes sensitive events; never auto-shared | **Add** | Prompt priority; Flo lacks EC logging | Should | P4 |
| F-112 | B12 | PBAC heavy-bleeding chart | 3/5/2 | Validated chart scoring | **Backlog** | Licensing and chart/product validation gaps (R3 §6); a generic diary must not be called PBAC | — | P3 gate |
| F-113 | B13 | Quick-hide: neutral screen **and** lock, easy return | 4/2/1 | Protection from onlookers | **Add** | Low cost; does not hide that the app exists and does not wipe data | Should | P2 |
| F-114 | B14 | Discreet generic notifications; per-category partner opt-in | 4/3/2 | Privacy-preserving reminders | **Add** | Required by the encryption-at-rest conflict anyway | Must | P2 |
| F-115 | B15 | Couple space: shared dates, sex entries, notes; she chooses which entries may feed her insights | 3/3/3 | Shared couple records | **Add** | Required by Section 3 ("both phones can add shared couple entries") | Must | P2 |
| F-116 | B16 | Explainable local "questions about my logs" | 3/3/2 | Fixed-query explanations | **Backlog** (merge into F-051) | Overlaps the local assistant | — | P5 |
| F-117 | Stage C note | Affectionate notes from partner (Today note, or a collection she opens) | 4/2/2 (plan score, I-M) | Personal touch | **Add** (narrow) | She asked; kept inside the couple space and not a messaging framework; she controls display; never triggered by health data; notifications generic | Should | P2 |
| F-118 | Stage C note | "When you've tended to feel like sex": her desire and comfort tendency summary | 5/3/3 (plan score, I-M) | Answers her "good time for sex" ask from her own past logs | **Add** | Uses A12; separate from fertility and consent; shared only through its own category | Should | P3 |
| F-119 | Constitution 8 | Encrypted backup file and restore, plus a recovery code | 5/3/2 (plan score, I-M) | Survives phone loss and storage clearing | **Add** (retained by default) | Constitution rule 8; **whether to keep it is an open approval question** (Stage C note) | Must | P2 |
| F-120 | Step 5 | Calendar (.ics) export of generic, non-health reminder times | 2/1/2 (plan score) | Closed-app alarm fallback | **Backlog** | iCloud Calendar is not end-to-end encrypted (R5 M2); only content-free events would be allowed | — | P6 gate |

No candidate was **Rejected** outright. Rejected *behaviours* (not features) are:

- contraceptive day labels;
- "safe days";
- efficacy estimators;
- automatic consent or willingness inference;
- automatic disclosure to the partner of a pregnancy or test result;
- streaks or pressure mechanics;
- cloud AI.

## Coverage notes and unresolved Flo contradictions (carried, not reconciled)

| Topic | Conflict (source) | Plan handling |
|---|---|---|
| Partners tier | Help says basic is free; App Store lists it under Premium (cross-check 1) | Not relevant to a private app; parity target is the function |
| Partner calendar scope | View-only calendar vs "no past or future calendar information" vs pre-sharing data excluded (cross-check 2) | F-057: forward-only from her chosen start date; she may opt in to sharing history |
| Quiz partial-answer disclosure | Shown side by side after both answer, but "visible even if only one responds"; threshold unknown (cross-check 3) | F-062: reveal only after both submit (stricter) |
| Doctor report horizon | Six cycles (dedicated article) vs six months (Premium article) (cross-check 4) | F-034: default six cycles incl. current, with a six-month option |
| Due date | Flo help "LMP + 41 weeks" vs Flo glossary 280 days vs ACOG 280 days (cross-check 12) | F-038: ACOG CO700 (Adapt; on approval list) |
| Tracker counts | 70+ / 80+ / 16 trackers with 50+ are lower bounds in different units (cross-check 5) | F-009: original enumeration, ~90 options; no claim of an equal count |
| BBT tier | Premium-addressed TTC page vs ungated help (cross-check 5) | Tier irrelevant; Replicate |
| Perimenopause entitlement | "All users" in 2025 vs a Premium four-tool suite in 2026 (cross-check 6) | F-043–F-047 as separate functions |
| Fertile-window suppression bounds | "Below 20 or above 60" vs "trend between 21 and 60" (R2:23) | F-072: our own explicit rule (A4) |

Counts: **74 Flo functional groups** (F-001–F-074) and **20 Beyond-Flo entries** (F-101–F-120). Of these, 14 are Add and 6 are Backlog. [consistency-check.md](consistency-check.md) checks every row mechanically.
