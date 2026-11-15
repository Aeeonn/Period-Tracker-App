# ADR-0017: Narrowed scope for a two-person private app

- **Status:** Accepted (owner decision, 2026-11-15). Supersedes the phase order and the P2–P7 feature scope in [roadmap.md](../plan/roadmap.md), [plan.md](../plan/plan.md) and [feature-parity-matrix.md](../plan/feature-parity-matrix.md) wherever they conflict. Amends [ADR-0014](0014-intimacy-track.md) and [ADR-0015](0015-normal-agentic-development.md). Marks [ADR-0004](0004-key-hierarchy-and-category-sharing.md) and [ADR-0005](0005-sync-conflict-model.md) for replacement (see "Lean sharing").
- **Context:**
  - The original plan aimed at function parity with a commercial cycle app (74 feature groups plus 20 additions) and at a threat model that treats the partner, the relay operator and an in-person pairing attacker as adversaries. It also kept every deployed copy synthetic until a hardening phase (P6) that sat behind P2–P5.
  - The owner's actual goals are narrower: cycle tracking and logging first; tracking the couple's sex life and helping it (her own desire and comfort patterns, intimacy content); and a partner view on his phone. The app is only for the two of them. Earlier guidance already said a working app comes before maximal hardening ([decisions.md](../decisions.md#product-direction)).
  - P0 and P1 are built. Nothing built is removed by this decision.
  - Facts from the owner (2026-11-15): she uses an IUD (copper or hormonal not yet confirmed); she does not use ovulation test strips; no pregnancy is planned; both are open with each other about what she logs.
- **Decision:**
  - **Launch moves up.** Real day-to-day use starts after P1, not after P6. The pattern features need at least three logged cycles, so waiting only delays them. Production use with real data still needs the owner's explicit go-ahead.
  - **Three steps replace P2–P7** (details in [roadmap.md](../plan/roadmap.md#current-roadmap-narrowed-2026-11-15)):
    1. Close P1 and launch: data-loss and lockout fixes, a passphrase-protected backup file, one stable address.
    2. Lean partner sharing: partner view, shared log and notes, one generic daily reminder push.
    3. Patterns and intimacy: her desire, comfort, satisfaction, mood and energy summaries; cycle history; prediction track record; original intimacy prompts and lessons.
  - **Lean sharing.** The relay still only ever stores ciphertext, and sharing is still off until she turns a category on. The mechanism becomes much smaller:
    - pairing with one in-person QR code (or typed code) that carries a shared secret; no three-code commit-then-reveal exchange, safety code or pairing-file fallback;
    - one couple key; no per-category key epochs or rotation on revoke. Turning a category off stops publishing it and deletes its relay copy;
    - her phone publishes a snapshot per category and the latest snapshot wins; couple entries are edited only by their author. No hybrid logical clocks, tombstone horizons or conflict copies;
    - relay transport only; no manual file-exchange fallback;
    - unpair deletes the relay data and forgets the key on both phones.
    - Kept because they are cheap and are hers: per-category on/off, one-tap pause, and "see what he sees".
    - The detailed design (keys, relay requests, snapshot format) gets its own ADR when step 2 starts. That ADR replaces ADR-0004 and ADR-0005, which stay as written until then.
  - **Pattern summaries are descriptive.** Step 3 shows per-phase summaries of her own past logs with day counts and a "not enough yet" state, using the A12 minimum-evidence thresholds. The rotation-based chance check, its null-calibration target (T-ENG-05) and power reporting are not required. Satisfaction is included, which A12 v1 left out. The summaries stay separate from fertility output and never imply consent.
  - **Dropped** (not planned; any of them can return later by owner decision):
    - pregnancy, postpartum, perimenopause and trying-to-conceive modes, IVF dating, pregnancy-loss flow, partner pregnancy progress (F-036, F-038–F-047, F-064, F-074) and the deferred engine pause for pregnancy or postpartum;
    - pill and medication tracking and reminders, late-period check-in flow, emergency-contraception/test organizer (F-016, F-048, F-109–F-111);
    - temperature, ovulation-test and mucus markers and their fusion, test tutorials (F-027–F-030, F-073, A6–A9);
    - doctor report, heavy-bleeding chart, remaining warning rules W-08–W-10, irregular-cycle refinements unless the track record shows a need (F-034, F-112, F-033 full, F-003 refinements);
    - symptom checker, local assistant, content library and courses, lifestyle correlations, log Q&A (F-049–F-052, F-054, F-107, F-116);
    - quick-hide, consent history, sharing-start date, per-entry opt-in, relay-stored backup, partner and event push (F-113, parts of F-101, F-114, F-119);
    - Shortcuts, calendar export, Apple Health and other-app imports, an on-device model (F-108, F-120, F-067, P7).
  - **Wish list, unplanned:** couple quizzes, date ideas, relationship check-in (F-062, F-063, F-103).
  - **Process.** Phase verification reports, demo packages and formal gates are dropped. The owner still decides when to launch and when to start each step. Independent review stays for changes to crypto and keys, sharing, migrations, backup/import and medical content; `npm run build && npm run check` and the affected Playwright specs stay for every change.
- **Unchanged rules:** synthetic data only in the repository; health data that leaves a phone is encrypted with keys only the two of them hold; no analytics or third-party assets; fertility is shown qualitatively, never as a "safe" day or as contraception; desire and patterns are never consent; medical content is cited and reviewed.
- **Consequences:**
  - Much less to build, and she can start using the tracker now.
  - Lean sharing gives up revocation by key rotation and the tamper-evident consent history. After she turns a category off, his phone keeps what it already received and still holds the couple key; protection for later data rests on her phone no longer publishing it. This matches the couple's stated openness, and these protections exist for her, so she should have the chance to object.
  - Pairing no longer defends against someone swapping the code during the in-person exchange.
  - Descriptive summaries can show a pattern that arose by chance. The day counts, the minimum-evidence thresholds and plain wording are the remaining guard.
  - Her IUD type decides what the engine shows: a hormonal IUD suppresses the fertility estimate and delays period prediction until three bleeding episodes are logged on the method; a copper IUD keeps normal predictions. She should pick the right one in the app.
