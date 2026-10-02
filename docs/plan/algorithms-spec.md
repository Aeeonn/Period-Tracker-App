# Algorithm and domain specification (Step 3)

**Status:** Stage E revision, 2026-10-02 (Stage C draft corrected after the Stage D critique; see [stage-e-resolution.md](stage-e-resolution.md)). This has **not** been independently audited. Every algorithm here needs an Opus algorithm audit and, where it carries medical content, a medical-safety review before the code that implements it is merged ([agent-operating-model.md](agent-operating-model.md)). The audit is a required gate, not optional.

**Sources:**
- Flo-specific rules come from [R2](research/R2-flo-methods.md).
- Clinical evidence comes from [R3](research/R3-clinical-methods.md).
- Desire and mood evidence comes from [R6 §2](research/R6-beyond-flo.md).
- The [cross-check](research/crosscheck-stage-b.md) applies throughout.
- All sources were accessed on 2026-10-02.

Labels used for every claim and choice:

| Label | Meaning |
|---|---|
| **FLO-DOC** | Matches a rule Flo has published. |
| **EVID** | An evidence-based substitute, with its source named. |
| **DESIGN** | An original design choice. It can be tuned by backtesting and has no external validation. |
| D / R / I | Documented / Reported / Inferred evidence, as in the research reports. |

**What this spec does not claim:**
- It does not reproduce Flo's proprietary ML. Flo's formulas are unpublished (R2 summary).
- It has no measured Flo accuracy to compare against. Flo's "90% accurate" figure comes from a user survey, not a day-error benchmark (R2 §1).
- It does not prove clinical safety.
- It does not give a calibrated personal probability of conception.
- It does not claim that any minimum-data threshold below (for example the A2 small-sample margins, the A12 evidence counts or the A14/A15 trigger counts) is clinically validated. They are DESIGN choices, flagged for the Opus audits.
- It does not claim real-world or Flo-equivalent accuracy. Backtests run on synthetic data only (A18).

## Plain-language primer

- A **cycle** runs from the first day of one period to the day before the next period starts. Cycle **day 1** is the first day of real bleeding.
- **Ovulation** is when an egg is released, roughly two weeks before the next period. The gap varies between people and between cycles: in one large study of app users (Bull 2019, a selected group with ovulatory cycles) the phase after ovulation averaged 12.4 days and spanned about 7 to 17 days across cycles. It cannot be seen directly at home. Calendars, temperature, ovulation (LH) tests and cervical mucus each give a different, imperfect clue (R3 §2).
- The **fertile window** is the few days when sex can lead to pregnancy: roughly the five days before ovulation plus the day of ovulation. Its timing varies, even in regular cycles (Wilcox 2000, R3 §3).
- **Pregnancy can happen on days the app labels as lower chance.** The app never labels any day as "safe".

## 0. Engine contract (pure, deterministic, versioned)

```ts
// src/contracts/engine-api.ts (contract; created in task p0-contracts)
type LocalDate = string;            // "YYYY-MM-DD", a calendar date in the user's local zone, never a timestamp
interface EngineInput {
  today: LocalDate;                 // device-local "today", passed in, never read inside the engine
  profile: { birthYear?: number; typicalCycleLength?: number; typicalPeriodLength?: number;
             lifeStage: LifeStage; contraception: ContraceptionState[] };
  dayLogs: DayLog[];                // decrypted, merged, tombstones already removed
  episodesOverride: EpisodeOverride[]; // user "this was/wasn't a period start", manual cycle exclusions
  pregnancies: PregnancyRecord[];
  coupleEntriesAllowedForInsights: CoupleEntry[]; // only entries she has allowed (consent rule CR-13)
}
interface EngineOutput {
  engineVersion: "cycle-engine/1.0.0"; paramsHash: string;
  episodes: Episode[]; cycles: CycleStat[]; prediction: PeriodPrediction | Suppressed;
  fertility: FertilityEstimate | Suppressed; chanceByDay: Record<LocalDate, ChanceCategory>;
  warnings: WarningCard[]; tendencies: TendencyReport[]; pregnancyDating?: PregnancyDating;
  perimenopause?: PeriSignals; explanations: Explanation[];   // human-readable "why", one per output
}
function runEngine(input: EngineInput, params: EngineParams = PARAMS_V1): EngineOutput
```

**Invariants.** Property-based tests check each of these ([test-strategy.md](test-strategy.md)).

| ID | Invariant |
|---|---|
| E1 | Same input and params give byte-identical output. There is no clock, randomness or locale access inside the engine. |
| E2 | The output does not depend on the order of `dayLogs`. |
| E3 | Every prediction carries a window, and `lo ≤ center ≤ hi`. |
| E4 | `chanceByDay` never contains a zero, "none" or "safe" value. |
| E5 | Adding a log dated after `today` never changes any output for dates up to `today`. |
| E6 | `engineVersion` and `paramsHash` appear in every saved prediction, so two versions can be compared on the same data. |
| E7 | All date arithmetic goes through A0. No `Date` object is created from a `LocalDate`. |

**Version upgrades.** A new version must first meet the T-ENG-04 targets on the frozen synthetic suite (A18); the change is recorded in an ADR. On her device it then runs in shadow next to the old version, and its on-device track record (A18) is shown beside the old one. It replaces the old version on her device only after **at least 6 of its shadow predictions have resolved** (about six cycles) and its personal mean absolute error is not worse than the old version's by more than 1 day. Six predictions are a minimum for a sanity check, not statistical proof; until they exist, the old version stays and the "Why?" sheet says the new one has not yet been compared on her data.

## Parameters v1 (`PARAMS_V1`)

| Param | Value | Label and rationale |
|---|---|---|
| `historyMaxCycles` | 12 | FLO-DOC: "last 12 logged cycles" (R2:2) |
| `maxCycleLen` | 90 | FLO-DOC: cycles longer than 90 days are excluded (R2:2) |
| `maxCycleAgeDays` | 365 | FLO-DOC: cycles more than a year old are excluded (R2:2) |
| `minCycleLen` | 15 | DESIGN: shorter intervals are probably logging artefacts. They are shown and flagged, never silently used |
| `recencyDecay` | 0.85 | DESIGN: a recent change moves the predicted day after 3 repeats when up to 9 cycles are in the history, and after 4 repeats with 10–12 cycles (TV-P4, TV-A2) |
| `defaultCycleLen` | 28 | DESIGN, informed by EVID (Bull 2019 mean 29.3; Fehring 2006 mean 28.9; R3 §1) and the ACOG CO700 convention |
| `defaultPeriodLen` | 5 | DESIGN: placeholder until she logs; within ACOG ≤7 and FIGO ≤8 (R3 §6) |
| `halfWidthNoHistory` | 7, or 5 if she gave a typical length | DESIGN, informed by EVID: 95% of cycles fell between 22 and 36 days in Fehring 2006 |
| `smallSamplePenalty` | n=1→3, n=2→2, n=3–5→1, n≥6→0 | DESIGN |
| `halfWidthClamp` | [2, 10] | DESIGN |
| `lutealRange` | 12–16, convention 14 | **DESIGN**, informed by EVID: ASRM's convention is cycle length − 14 (R3 §2); Bull 2019 reports a mean luteal phase of 12.4 days in a selected cohort of app users with ovulatory cycles, with cycles spanning about 7–17 days (the abstract labels this spread "95% CI"; it describes variation across that cohort's cycles, not the uncertainty of one person's next cycle; R3 [3]). **Excluded tail:** cycles whose luteal phase is shorter than 12 or longer than 16 days ovulate outside the calendar band, so the calendar estimate can label a real ovulation day "Lower" (TV-F3). The "Why?" sheet says so. Personal marker evidence can widen the band (A9); the default is not replaced by a new universal bound |
| `lutealPlausible` | 7–17 | DESIGN plausibility filter, taken from the Bull 2019 cohort spread: personal luteal estimates from markers outside it are treated as marker or logging errors (A9). Not a forecast band |
| `coreWindow` | ovulation − 5 … ovulation + 1 (7 days) | FLO-DOC envelope: 4–5 days before to 1–2 after, minimum 7 (R2:7); EVID: Wilcox 1995 six-day window ending on ovulation |
| `missedLogRatio` | interval ≥ 1.6× and ≤ 2.4× the typical length | DESIGN, informed by EVID: Li 2022 models skipped tracking (R3 §1) |

## A0. Calendar-date model

- **Purpose.** Prevent off-by-one-day errors caused by UTC conversion or daylight-saving time (constitution rule 6).
- **Representation.** Every health date is a `LocalDate` string. `epochDay(d)` turns a date into an integer day count with the days-from-civil algorithm (proleptic Gregorian, integer arithmetic only). Day differences and offsets are always `epochDay(b) − epochDay(a)` and `fromEpochDay(epochDay(a) + k)`.
- **"Today".** The UI reads the device's current local calendar date through `Intl.DateTimeFormat().resolvedOptions().timeZone` with `Temporal`/`Intl` field extraction. The engine never reads it itself.
- **Logs are not converted between time zones.** A log made while travelling keeps the date she saw on her phone.
- **Sync** carries `LocalDate` strings unchanged. Hybrid logical clock (HLC) timestamps for conflict ordering are separate metadata and are never used as health dates.

**Test vectors (hand-computed; the arithmetic was double-checked with Python `datetime` while drafting):**

| TV | Input | Expected |
|---|---|---|
| TV-D1 | `epochDay("1970-01-01")` | 0 |
| TV-D2 | `epochDay("2026-01-01")` | 20454 (56×365 + 14 leap days) |
| TV-D3 | `epochDay("2026-10-02")` | 20728 (20454 + 273 + 1) |
| TV-D4 | `diff("2026-03-07","2026-03-09")` with the zone set to America/New_York (DST starts 2026-03-08) | 2 |
| TV-D5 | `diff("2026-10-24","2026-10-26")` with the zone set to Europe/Berlin (DST ends 2026-10-25) | 2 |
| TV-D6 | `today()` at device time 2026-10-02T00:30 in Pacific/Auckland | "2026-10-02", not the UTC date 2026-10-01 |

## A1. Bleeding episodes (period vs spotting)

- **Purpose.** Turn daily flow logs into period episodes and period starts.
- **Inputs.** `DayLog.flow` ∈ {none, spotting, light, medium, heavy, very_heavy}, plus her overrides.
- **Outputs.** `Episode{start, end, bleedingDays, assumedDays[], kind: period|withdrawal|postpartum_lochia|unknown, flags[]}`.
- **Labels.**
  - EVID (I-M): day 1 is the first day of real flow, not spotting. This is the common clinical convention. The *exact* rule below is DESIGN and is flagged for the medical audit.
  - FLO-DOC: Flo auto-logs the period end from the configured duration (R1:CL). We show those days as "assumed" until she confirms them.

```text
PERIOD_FLOW = {light, medium, heavy, very_heavy}
for each day d in ascending order:
  if flow(d) ∈ PERIOD_FLOW and no PERIOD_FLOW on d-1 or d-2:      # needs ≥2 clear days before
      open new episode at d   (unless override says "not a period start")
  else if flow(d) ∈ PERIOD_FLOW and episode open and lastFlow ≥ d-2:  # gap of at most 1 day
      extend episode to d
spotting never opens an episode; spotting adjacent to an episode is attached as spottingDays (not bleedingDays)
override "period started on X" always opens an episode at X
assumed days: if the latest episode has only its start logged and today − start < expectedPeriodLen,
  mark days start+1..min(today, start+expectedPeriodLen−1) as assumed (displayed hatched, excluded from length stats)
interval(e_i, e_{i+1}) < minCycleLen  → flag "two bleeding episodes N days apart — same period?" (excluded from stats)
kind = withdrawal if an active hormonal method with a scheduled break covers the start (A16)
```

**Edge cases:**

| Situation | Handling |
|---|---|
| Spotting vs period | Spotting is never a period start. |
| Edits to past entries | The whole engine reruns, so episodes are recomputed from scratch. |
| Late logging | Backfilling a start date works the same as logging it on the day. |
| Withdrawal bleeds | Labelled separately and excluded from natural-cycle statistics. |
| Postpartum bleeding (lochia) | Labelled separately and never a "period". |
| Time zones | Handled by A0. |

**Test vectors:**

| TV | Daily flow logs | Expected |
|---|---|---|
| TV-E1 | 09-01 medium, 09-02 heavy, 09-03 light, 09-04 none, 09-05 spotting | One episode 09-01..09-03, 3 bleeding days; 09-05 attached as spotting |
| TV-E2 | 09-20 spotting, 09-21 spotting, 09-22 light, 09-23 medium | Period start 09-22, not 09-20 |
| TV-E3 | 10-01 medium, 10-02 none, 10-03 light | One episode 10-01..10-03 (a 1-day gap is allowed) |
| TV-E4 | 10-01 medium, 10-02 none, 10-03 none, 10-04 light | Two episodes 3 days apart; flagged and excluded |
| TV-E5 | Only 2026-09-01 logged "medium", today 2026-09-03, expected length 5 | Days 09-02 and 09-03 are assumed; bleeding days for statistics = 1 |

## A2. Next-period prediction (`cycle-stats-v1`)

- **Purpose.** Predict the next period start as a point and a window. This adapts to repeated changes without treating one unusual cycle as the new normal (Stage C note: "adaptive periods").
- **Matches Flo?** Partly. The history rules are FLO-DOC. The estimator itself is EVID/DESIGN: R3 §1 finds mean, median, adherence-aware and uncertainty-aware models are all evidence-backed candidates, with no single guideline-mandated formula. We chose a recency-weighted median for robustness to outliers, plus a spread-based window.

```text
cycles   = [(s_i, s_{i+1}, len_i)] from consecutive period starts (A1), excluding:
           len < 15 (flagged), len > 90 (FLO-DOC), s_i < today−365 (FLO-DOC), manual exclusions,
           cycles overlapping pregnancy/postpartum-before-first-period, cycles under hormonal methods (A16),
           cycles flagged "possible missed log" until she confirms (below)
missed-log check (for each len_i, with Lref = weighted median of the other valid cycles, needs ≥3 others):
           if 1.6·Lref ≤ len_i ≤ 2.4·Lref → flag; ask "Did you have a period around <s_i+Lref> that wasn't logged?"
           answers: "yes, add it" → user adds start; "no, it was a long cycle" → include (if ≤90)
recent   = last min(12, |valid|) valid cycles, most recent first, k = 0..n−1, weight w_k = 0.85^k
if n == 0: Lc = profile.typicalCycleLength ?? 28; h = (typical given) ? 5 : 7
else:      Lc = lower weighted median of recent (smallest L with Σ_{len≤L} w ≥ Σw/2)
           MAD = median(|len_k − Lc|) (unweighted; even count → mean of the middle two)
           settle = 2 if a "settling" modifier applies (A16: within 90 days of stopping hormonal method, or first 2 cycles after pregnancy end) else 0
           h = clamp(ceil(1.5·MAD) + penalty(n) + settle, 2, 10)
center   = lastStart + Lc
lo, hi   = center − h, center + h
if n ≥ 1:  Llast = len_0; lo = min(lo, lastStart + Llast); hi = max(hi, lastStart + Llast)   # one unusual cycle widens, not moves
state    = today < lo: "upcoming" | lo ≤ today ≤ hi: "expected now" | today > hi and no new start: "late"
late     : daysLate = today − center; show test guidance (A10/F-037); keep window unchanged
variability label = "regular" if (max−min of recent ≤ 6 months) ≤ FIGO limit for age (≤9 at 18–25; ≤7 at 26–41) else "variable"   (EVID FIGO, R3 §6)
```

**Uncertainty shown to her:** "Most likely around Oct 8 (between Oct 4 and Oct 10)." This comes with a short explanation, such as "based on your last 7 cycles; your last one was shorter than usual".

**What the range means.** The range is a rule-of-thumb *planning range* (median plus 1.5 × the typical deviation, plus a small-sample margin). It is **not** a calibrated probability interval, and the app never presents it as one. Its design target is that, on the frozen synthetic stable scenarios with 6 or more prior cycles, at least 70% of actual starts fall inside it (T-ENG-04; DESIGN target, synthetic only). On her phone, once at least 6 predictions have resolved, the "Why?" sheet shows the observed hit rate in plain words, for example "Your last 8 periods: 6 started inside the range". Before that it says: "We'll show how often this range was right once you've logged 6 more periods." 

**Defaults for a new user:** see `n == 0` above. With no last period date at all, nothing is predicted and the screen says "Log your period to start predictions".

**Edge cases:**

| Situation | Handling |
|---|---|
| Irregular cycles | MAD widens h up to 10 days, and the "variable" label shows. |
| Missed or late logging | The missed-log check above. Missing days never count as "no period". |
| Outliers | The weighted median resists them, and the last-cycle rule widens the window. |
| Hormonal contraception / withdrawal bleeds | A16 applies. |
| Postpartum / breastfeeding | Suppressed until the first period, then n restarts. |
| Perimenopause | The window widens through MAD. Signals are handled in A14. |
| Pregnancy loss | The affected cycle is excluded, and the settling +2 applies. |
| Edits to the past | Full recompute. |
| DST and time zones | A0. |

**Test vectors** (all dates 2026; window = [lo, hi]):

| TV | History | Expected |
|---|---|---|
| TV-P1 | No cycles; last start 09-01; typical length unknown | Lc 28, h 7; center 09-29; window 09-22..10-06 |
| TV-P5 | No cycles; last start 09-01; typical length 30 entered | center 10-01; window 09-26..10-06 |
| TV-P6 | Starts 08-01, 08-31 (one cycle of 30) | n=1, MAD 0, penalty 3 → h 3; center 09-30; window 09-27..10-03 |
| TV-P2 | Starts 03-02, 03-30, 04-27, 05-25, 06-22, 07-20, 08-17 (six cycles of 28) | Lc 28, MAD 0, h=clamp(0,2,10)=2; center 09-14; window 09-12..09-16; "regular" |
| TV-P3 | TV-P2 plus a start on 09-10 (latest cycle 24) | Weighted median 28 (24 carries weight 1 < half-total 2.2647); MAD 0 → h 2; center 10-08; Llast rule → lo = min(10-06, 09-10+24 = 10-04) → window **10-04..10-10**. The single short cycle widened the window but did not move the predicted day. |
| TV-P4 | Then starts 10-04 and 10-28 (three latest cycles of 24) | 24s carry weight 1+0.85+0.7225 = 2.5725 ≥ half 2.5613 → Lc **24**; deviations [0,0,0,4,4,4,4,4,4] → MAD 4 → h = ceil(6) = 6; center 11-21; window 11-15..11-27, with the message "your cycles recently changed; the window is wider while they settle". (After only two cycles of 24, Lc stays 28: weight 1.85 < half 2.4250.) |
| TV-P7 | Starts 01-05, 04-20 (105 days), 05-18 (28) | 105 is excluded (>90); n=1 → h 3; center 06-15; window 06-12..06-18; warning W-06 is checked |
| TV-P8 | Starts 01-05, 02-02, 03-02, 03-30, 05-25 (cycles 28, 28, 28, 56) | 56 lies within [44.8, 67.2] → flagged as a possible missed log and excluded; n=3 → h = max(2, 0+1) = 2; center 06-22; window 06-20..06-24; prompt "around 04-27?" |

## A3. Period-length estimate

```text
lengths = bleedingDays of the last ≤6 period episodes (confirmed days only; assumed days excluded)
expectedPeriodLen = lengths empty ? (profile.typicalPeriodLength ?? 5) : median(lengths) rounded half-up
```

- **Labels.** DESIGN. Flo's method is undocumented.
- **Test vectors.**
  - TV-L1: lengths [5, 6, 4, 5] → 5.
  - TV-L2: lengths [4, 7] → 5.5 → 6.
  - TV-L3: no lengths, typical length not given → 5.

## A4. Calendar ovulation, fertile window and suppression

- **Purpose.** Estimate ovulation and the fertile window from the calendar alone. This is used when no markers are logged.
- **Labels.**
  - EVID: ASRM's convention puts ovulation at cycle length − 14 (R3 §2), and the luteal phase varies (Bull 2019 mean 12.4).
  - FLO-DOC envelope: 7-day core window (R2:7).
  - EVID: Wilcox 1995/2000 found the window timing varies widely.

```text
ovCenter     = center(A2) − 14
ovRange      = [lo(A2) − 16, hi(A2) − 12]                       # luteal 12–16
coreWindow   = [ovCenter − 5, ovCenter + 1]                      # "most likely fertile days" (7 days)
possibleBand = [ovRange.lo − 5, ovRange.hi + 1]                  # "pregnancy possible — higher than other days"
suppress fertility outputs when one of these holds; the first matching reason in this order wins:
   1. lifeStage == pregnant                                          → Suppressed{reason = pregnant}
   2. lifeStage == postpartum and no period since the birth          → Suppressed{reason = postpartum_before_first_period}
   3. hormonal method active (pill/patch/ring/implant/injection/hormonal IUD)
                                                                     → Suppressed{reason = hormonal}   (FLO-DOC R2:24 behaviour)
   4. prediction state == "late"                                     → Suppressed{reason = late}       ("unknown — consider a test")
   5. n ≥ 3 and (Lc < 21 or Lc > 45)                                 → Suppressed{reason = cycle_length}
                                                                       (DESIGN; Flo's 20/21/60 boundary is inconsistent, R2:23 — not copied)
   6. no period start logged at all (A2 has no prediction)           → Suppressed{reason = no_data}
copper IUD: show estimate greyed with "your method doesn't change ovulation" (FLO-DOC R2:24)
with personal luteal evidence Lp from A9 (P3): ovRange = [lo(A2) − max(16, Lp), hi(A2) − min(12, Lp)]   # widens only, never narrows
```

The possible band can be wide. For TV-P1 (window 09-22..10-06), ovRange is 09-06..09-24 and the possible band is **09-01..09-25**: it starts on the period day for a brand-new user. This is deliberate: it is the honest result when her cycle length is unknown.

**Test vectors:**
- **TV-F1**, using TV-P2 (center 09-14, window 09-12..09-16):
  - ovCenter 08-31;
  - core 08-26..09-01;
  - ovRange 08-27..09-04;
  - possible band 08-22..09-05.
- **TV-F2**: a pill user. Fertility is Suppressed{reason = hormonal}, and `chanceByDay` = DEPENDS_ON_METHOD for every covered day.
- **TV-F3 (excluded tail, documents a limitation)**: TV-P2 history, and the next period actually starts 09-14 after an 8-day luteal phase, so ovulation was 09-06. The possible band ends 09-05, so A5 labels 09-06 **Lower** with the not-zero text. Expected: Lower (never zero), and the "Why?" sheet contains the fixed sentence "Ovulation can happen outside these dates, especially if the time between ovulation and your period is short. The calendar can't tell." 

## A5. Pregnancy-chance indicator (never zero)

- **Purpose.** Meet the requirement that the display never shows zero without inventing personal percentages.
- **Labels.**
  - Adapt (approval list item AP-04).
  - EVID: per-act probabilities exist only as cohort estimates with different endpoints. Examples:
    - Wilcox 1995: 0.10 five days before ovulation to 0.33 on ovulation day.
    - ASRM: 3.2% on cycle day 8, 9.4% on day 12, <2% on day 21.
  - No source validates a calibrated personal daily curve (R3 §3, cross-check 14).
- **Decision.** Show three qualitative categories, each with fixed explanatory text. No numbers appear on any screen, and no day is ever "safe" or "zero".

**Coverage of `chanceByDay`.** It covers every day from the current cycle's start through the later of `hi(A2)` and today. With no period logged it covers today only.

**Every suppression reason has a fixed, named category** (consistency check X11). None of them is zero, "none" or "safe", so invariant E4 holds in every state:

| Reason | Category | Fixed text |
|---|---|---|
| `pregnant` | PREGNANT_NOT_SHOWN | "You're in pregnancy mode, so conception chance isn't shown." |
| `postpartum_before_first_period` | POSSIBLE_BEFORE_FIRST_PERIOD | "Can't estimate yet after birth. Pregnancy is possible before your first period returns." |
| `hormonal` | DEPENDS_ON_METHOD | "Depends on using your method correctly." |
| `late` | UNKNOWN_TEST | "Unknown — your period is late; consider a test." |
| `cycle_length` | NOT_ESTIMATED_CYCLE_LENGTH | "Can't estimate fertile days for cycles this short or long. Pregnancy is possible on any day you have sex without contraception." |
| `no_data` | NO_DATA_YET | "Log your period to see estimates. Until then, pregnancy is possible on any day you have sex without contraception." |

```text
if fertility Suppressed{reason}: category = the row above for that reason (every covered day)
elif marker-based ovulation estimate O with marker window [wlo, whi] (A9):
      Higher = [O−2, O]; Medium = ([O−5, O+1] ∪ [wlo−5, whi+1]) \ Higher; Lower = all other days (not-zero text)
else: Higher = [ovCenter−2, ovCenter]                             (EVID: ASRM peak in the 2 days before ovulation;
                                                                   Wilcox 1995 peak on ovulation day)
      Medium = (coreWindow ∪ possibleBand) \ Higher
      Lower  = every other day — label "Lower — not zero. Pregnancy is possible on any day you have sex without contraception."
```

**Test vectors** (from TV-F1):
- 08-30 → Higher.
- 08-27 → Medium (core).
- 08-23 → Medium (possible band).
- 09-07 → Lower, with the not-zero text.
- 09-14, the predicted period day → Lower, with the not-zero text.
- The TV-F2 pill user on any day → DEPENDS_ON_METHOD.
- TV-F3: 09-06 → Lower, with the not-zero text and the excluded-tail sentence.
- Property: no output value equals 0, "none" or "safe", in any state (E4).

**Suppression vectors** (all dates 2026):

| TV | Input | Expected `chanceByDay` |
|---|---|---|
| TV-Q1 | Pregnancy mode, any history | PREGNANT_NOT_SHOWN on every covered day |
| TV-Q2 | Postpartum mode, birth 2026-08-01, no period since, today 09-20 | POSSIBLE_BEFORE_FIRST_PERIOD |
| TV-Q3 | Starts 01-01, 01-20, 02-08, 02-28, 03-19 (cycles 19, 19, 20, 19; n = 4; Lc = 19 < 21), no method | NOT_ESTIMATED_CYCLE_LENGTH on every covered day (W-04 also fires) |
| TV-Q4 | No period ever logged, today 10-02 | NO_DATA_YET for 10-02 only |
| TV-Q5 | TV-P2 history, no new start, today 09-17 (after hi 09-16) | UNKNOWN_TEST on every covered day |
| TV-Q6 | TV-Q5 plus an active combined pill | DEPENDS_ON_METHOD (hormonal outranks late) |

## A6. BBT temperature-shift detection (P3)

- **Purpose.** Detect, after the fact, a sustained temperature rise that suggests ovulation has *probably* already happened. It is evidence, not proof, and it never predicts ahead (R3 §2).
- **Labels.** EVID: the WHO/JHU handbook describes a sustained rise of about 0.2–0.5 °C. The "three over six" rule shape matches documented `sympto@3.0.2` behaviour (R3 §2). Our rule text is written independently from the published description.
  - We do **not** copy or port `sympto` code. It is AGPL-3.0-or-later (R3 §8).
  - We do **not** include its exception rules in v1.
  - The audit must confirm that the rule is not a derivative work.

```text
valid readings: same-cycle, not flagged {fever, alcohol, <3h sleep, measured late, illness, travel}, rounded to 0.01 °C
for first day t (cycle day ≥ 6) such that the 6 valid readings before t exist:
   LTL = max(previous 6 valid readings)
   if r_t > LTL and r_{t+1} > LTL and r_{t+2} ≥ LTL + 0.20 (valid consecutive readings): shift confirmed on day t+2
ovulation estimate = t − 1 (EVID-I-M: ovulation usually occurs before the rise; flagged for audit), window [t−2, t]
missing/flagged readings are skipped (not interpolated); if a flagged day breaks consecutiveness → no confirmation
```

**Test vectors:**
- **TV-B1.** Days 8–13 read 36.40, 36.35, 36.45, 36.40, 36.38, 36.42. Days 14–16 read 36.55, 36.60, 36.70. Here LTL is 36.45, and 36.70 ≥ 36.65, so the shift is confirmed on day 16. Ovulation estimate is day 13, window days 12–14.
- **TV-B2.** Same, but day 16 reads 36.60, so there is no confirmation yet.
- **TV-B3.** Same as TV-B1, but day 15 is flagged as fever, so there is no confirmation.

## A7. LH and manual ovulation markers (P3)

```text
LH positive = result ∈ {positive, peak} (FLO-DOC: log only "peak" as positive for high/peak/negative kits, R2:5); negatives ignored (FLO-DOC)
run = latest maximal run of positive days in the cycle (gap ≤1 day)
LH ovulation center = run.first + 1 (FLO-DOC next day); window [run.first, run.last + 2] (EVID ASRM: within 2 days after surge; ~7% false positives)
manual "ovulated today" on day M → center M, window [M, M] (FLO-DOC R2:6)
```

**Test vectors:**
- TV-H1: positives on 08-28 and 08-29 → center 08-29, window 08-28..08-31.
- TV-H2: only negative results → no LH marker.
- TV-H3: manual entry on 08-30 → center 08-30.

## A8. Cervical-mucus peak (P3)

- **Scale** (original labels): 0 dry, 1 sticky, 2 creamy, 3 watery, 4 clear/stretchy/slippery.
- **Peak.** The peak is the last day with the cycle's highest observed type (≥3) that is followed by 3 consecutive logged days of lower type. It can only be confirmed afterwards.
- **Labels.** EVID: the handbook defines "peak" as the last clear, slippery day, recognized retrospectively (R3 §2). Our ovulation estimate is the peak day with window [peak−2, peak+2] (I-M, flagged for audit).
- **Test vectors.**
  - TV-M1: days 11–17 = 2, 3, 4, 4, 2, 1, 1 → peak day 14, confirmed on day 17.
  - TV-M2: day 16 is not logged → not confirmed yet.

## A9. Marker fusion (P3)

```text
priority: manual > LH > BBT > mucus > calendar   (FLO-DOC: markers have priority over calendar, R2:2; order among markers DESIGN)
center/window = highest-priority available marker
if another marker's window does not overlap the chosen window → flag "markers disagree", use union of windows, Higher days from chosen marker only
symptothermal cross-check (EVID: the WHO/JHU handbook combines temperature and mucus and waits for the LATER of the two
   marker endpoints, R3 §2; DESIGN operationalization, no sympto code or exception rules):
   if both a BBT shift (A6) and a mucus peak (A8) are recorded in the current cycle:
      combinedConfirmedOn = max(BBT confirmation day, mucus confirmation day)   # status "both signs seen" only from this day
      window = intersection of the two windows if they overlap, else union with "markers disagree"
   if only one of the two is confirmed: status "one sign so far; waiting for the second", estimate from that marker
   the endpoint is used ONLY to time the ovulation estimate and the status text. It never declares an infertile or "safe"
   phase: days after it remain "Lower — not zero" at best (A5), because this app is not contraception (constitution 4.4)
fertility for the *current* cycle uses markers from the current cycle only
personal luteal length (P3): Lp = median(next start − marker ovulation) over ≥3 completed marker cycles, ignoring values outside
   lutealPlausible 7–17 (treated as marker/logging errors). Lp only WIDENS the A4 calendar band (A4 formula); it never narrows it
   and never replaces the default 12–16 for anyone else
```

**Test vectors:**
- TV-X1: calendar ovCenter 08-31 plus LH run 08-28..08-29 → center 08-29, no disagreement flag (the windows overlap).
- TV-X2: LH center 08-20 (window 08-19..08-22) plus BBT window 09-02..09-04 → disagreement flagged, union window, Higher days 08-18..08-20.
- TV-X3 (personal luteal widening): TV-P2 window 09-12..09-16 and Lp = 10 from three marker cycles → ovRange [09-12 − 16, 09-16 − 10] = 08-27..09-06; possible band 08-22..09-07. The core window (08-26..09-01) and Higher days (08-29..08-31) are unchanged. With Lp = 13 the TV-F1 band is unchanged; with Lp = 5 (outside 7–17) Lp is ignored.
- TV-S1 (symptothermal, both signs): BBT as TV-B1 (shift confirmed on cycle day 16; window days 12–14) plus mucus as TV-M1 (peak day 14, confirmed day 17; window 12–16) → "both signs seen" from day 17; the windows overlap, so the window is days 12–14 and the center is the BBT estimate, day 13.
- TV-S2 (one sign so far): TV-B1 plus TV-M2 (mucus peak not yet confirmed) → status "one sign so far; waiting for the second"; estimate from BBT (day 13); no combined confirmation day.

## A10. Pregnancy dating and milestones (P4)

- **Labels.** EVID: ACOG CO700, reaffirmed 2025 (R3 §4, cross-check 12).
- **Deviation from Flo.** Flo's help text says "LMP + 41 weeks", but its glossary and ACOG both say 280 days. We use ACOG. This is approval item AP-05.

```text
EDD from LMP           = LMP + 280
EDD from IVF transfer  = transfer + (266 − embryoAgeDays)   # day-5 → +261, day-3 → +263 (D: ACOG); general identity I-H
EDD from known conception date = conception + 266 (I-H arithmetic identity, consistent with LMP+280)
clinician EDD          = entered value; always overrides (source label "from your clinician")
GA(d) days             = 280 − (EDD − d); show "W weeks D days"
redating suggestion (scan with clinician-reported GA): discrepancy = |GA_scan − GA_LMP|;
   thresholds by GA at scan (ACOG): <9+0: >5d; 9+0–13+6: >7; 14+0–15+6: >7; 16+0–21+6: >10; 22+0–27+6: >14; ≥28+0: >21
   → show "Your scan differs by N days. ACOG suggests clinicians may update the due date; ask yours and enter the date they give."
   (the app never redates automatically)
trimesters (labels used in CO700 context): 1st ≤13+6, 2nd 14+0–27+6, 3rd ≥28+0  (D-M via R3 §4; confirm in content review)
UK care milestones (NICE NG201, labelled "UK schedule; your care may differ"): booking by 10+0; dating scan 11+2–14+1;
   anomaly scan 18+0–20+6; diabetes testing 24+0–28+0 if risk-indicated
pregnancy end: outcome ∈ {birth, loss, ended}; → lifeStage postpartum (birth) or cycle tracking (others); A2 settling +2 for 2 cycles
```

**Test vectors:**

| TV | Input | Expected |
|---|---|---|
| TV-G1 | LMP 2026-01-10 | EDD 2026-10-17 |
| TV-G2 | GA on 2026-03-01 | 280 − 230 = 50 days = **7w1d** |
| TV-G3 | IVF day-5 transfer 2026-02-01 | EDD 2026-10-20; GA on transfer day = 19 days = 2w5d |
| TV-G4 | IVF day-3 transfer 2026-02-01 | EDD 2026-10-22 |
| TV-G5 | Scan at LMP-GA 8+2; scan GA 7+3 (6 days apart) | Suggestion shown (>5) |
| TV-G6 | Scan 4 days apart | No suggestion |

## A11. Warning signs: "talk to a clinician" rules

- **Labels.**
  - EVID per rule (sources below).
  - The trigger counts ("≥2 of last 6") are DESIGN, chosen to avoid nagging. They are flagged for the medical audit.
  - The thresholds are kept specific to each source, because the sources disagree (cross-check 13).
  - Not a triage system, and not a diagnosis.
- **Severities:** `EMERGENCY`, `SEEK_ADVICE_SOON`, `DISCUSS`, `INFO`.
- **Dismissal and repeats.** A dismissed card stays hidden for the same episode or cycle. `EMERGENCY` cards cannot be dismissed while the condition still holds.

Each rule names its source **and the population that source describes** (ADR-0007). Population descriptors summarise what R3 records; the medical audit confirms them against the source text. A source written for adults or for a selected cohort may not fit everyone, which is one more reason every card says "talk to a clinician" rather than diagnosing.

| ID | Condition | Severity | Source | Source population / context |
|---|---|---|---|---|
| W-01 | On one day, "soaking ≥1 pad/tampon per hour for >2 hours" **and** any of chest pain, breathlessness, lightheadedness/dizziness | EMERGENCY | ACOG FAQ095 (R3 [18]) | US patient education for adults; not age-specific |
| W-02 | Heavy-bleeding items logged on days of the current period episode: product change every 1–2 h, soaking hourly for >2 h (without the W-01 symptoms; Stage E addition, flagged for audit), clots >2.5 cm, flooding, "bleeding stops me doing normal things". Exactly **one** item on exactly **one** day → DISCUSS; any other non-empty case (two or more different items, or one item on two or more days) → SEEK_ADVICE_SOON | DISCUSS / SEEK_ADVICE_SOON | NHS heavy periods; NICE NG88 quality-of-life emphasis (R3 [17],[19]) | UK guidance for people with heavy menstrual bleeding |
| W-03 | Period bleeding days >7: once → INFO; ≥2 of last 6 → DISCUSS (FIGO's ≤8 is shown as context) | INFO/DISCUSS | ACOG FAQ095; FIGO (R3 [16],[18]) | ACOG adult patient education; FIGO System 1 normal limits for non-pregnant people of reproductive age |
| W-04 | Cycle length outside 21–35: once → INFO; ≥2 of last 6 valid cycles → DISCUSS (FIGO 24–38 shown as context) | INFO/DISCUSS | ACOG FAQ095; FIGO | As W-03 |
| W-05 | Shortest-to-longest variation over the last 6 months >9 (age 18–25 or unknown) or >7 (26–41) | INFO ("variable") | FIGO 2023 explanation (R3 [16]) | FIGO age bands 18–25, 26–41, 42–45 |
| W-06 | No period for **more than 90 days** (today − last start ≥ 91), not pregnant, not on a continuous hormonal method, not postpartum or breastfeeding | SEEK_ADVICE_SOON + pregnancy-test card | PCOS 2023 (">90 days"); ACOG (3–6 months) | PCOS guideline: any cycle >90 days more than one year after menarche; adult and adolescent criteria differ |
| W-07 | (a) Bleeding after sex (a sex entry with `bleeding_after = yes`) → DISCUSS. (b) Intermenstrual bleeding: a day with any flow that is neither part of a period episode nor attached to one as spotting (A1); in 1 cycle → INFO, in ≥2 cycles → DISCUSS. During the first 3 months of a new hormonal method, (b) is INFO only | INFO/DISCUSS | ACOG FAQ095 | US adult patient education |
| W-08 | Possible pregnancy (late, positive test, or early pregnancy mode) **and** one-sided pain, shoulder-tip pain or unusual bleeding → SEEK_ADVICE_SOON ("get advice today"); with sudden severe pain plus dizziness or fainting → EMERGENCY | SEEK/EMERGENCY | NHS ectopic pregnancy (R3 [19]; page review overdue — re-verify in content review) | UK general public guidance |
| W-09 | Severe period pain that stops daily activities in ≥2 of last 3 periods, or pain during sex in ≥2 cycles | DISCUSS | ESHRE 2022 (R3 [21]) | Clinical guideline for people with suspected endometriosis |
| W-10 | The same symptom in the 5 days before the period in 3 consecutive cycles, absent in cycle days 4–12 | INFO ("you may want to track for PMS"; no PMDD rule) | ACOG FAQ057 (R3 [22]) | US adult patient education |
| W-11 | Mood option "thoughts of harming myself" logged on today's or yesterday's entry | EMERGENCY-style support card with local crisis contacts; cannot be dismissed on those days | **Source gap:** the crisis resource and wording must be chosen and cited in the P1 content review for her country (AP-27) | Depends on her country |

**Test vectors** (hand-computed; dates 2026):

| TV | Input | Expected |
|---|---|---|
| TV-W1 | One period of 9 bleeding days; previous periods ≤6 | W-03 INFO only |
| TV-W2 | Last 6 cycles [28, 40, 27, 38, 29, 30] | W-04 DISCUSS (40 and 38); W-05 INFO (13 > 9) |
| TV-W3 | Last start 2026-06-01, today 2026-08-31, no pregnancy or method | 91 days > 90 → W-06 |
| TV-W3b | Last start 2026-06-02, today 2026-08-31 | 90 days, not more than 90 → no W-06 |
| TV-W4 | Hourly soaking for 3 h plus dizziness | W-01 EMERGENCY |
| TV-W5 | TV-W3 while in pregnancy mode | No W-06 |
| TV-W6 | One period day logs only "clots >2.5 cm" | W-02 DISCUSS |
| TV-W7 | Period days 2 and 3 each log "change every 1–2 h" | W-02 SEEK_ADVICE_SOON (one item on two days) |
| TV-W8 | One sex entry with `bleeding_after = yes`; no hormonal method | W-07 DISCUSS |
| TV-W9 | Spotting on cycle day 14 of one cycle, not adjacent to any period episode | W-07 INFO |
| TV-W10 | Such intermenstrual spotting in two different cycles | W-07 DISCUSS |
| TV-W11 | TV-W10, with a combined pill started 40 days before the second spotting day | W-07 INFO only (new-method window) |
| TV-W12 | "Thoughts of harming myself" logged on 10-02; today 10-02 | W-11 crisis card shown, not dismissible on 10-02 or 10-03 |

**Vectors owed by later phases** (written in each phase's tasks at the gate before it, from this spec): W-08, W-09 and W-10 (P3/P4); A14 S2 and S3 (P4); A15 endometriosis, fibroids/HMB and PMS checkers (P5); A12 binary metrics and the consistency-failure path (P3).

## A12. Personal tendencies: desire, mood, energy, comfort, symptoms (P3; logging from P1)

**Purpose.** Answer "does it learn my habits?" (Stage C note) by describing her own *past* logs by cycle phase. It needs minimum evidence, shows how many days were logged (coverage), keeps phases that cannot be determined labelled as uncertain, adapts when things change, and can return "no clear pattern".

**Labels.**
- DESIGN throughout.
- EVID motivation: population and pooled findings cannot predict an individual. Romans 2012 (18 of 47 studies found no phase association) and Doornweerd 2025 (no phase-only effect on desire, P=.36) show this. Roney 2013 found within-cycle hormone–desire associations, but mostly not between women (R6 §2).
- Flo's pattern method is undocumented (R2 §2).

**Separation rules** (tested; consent rules CR-14 and CR-15 in [security-privacy.md](security-privacy.md#2-consent-and-privacy-rules-testable)):
1. Tendencies never use or change fertility outputs. Fertility outputs never use tendencies.
2. No copy may say or imply willingness, obligation, permission or consent.
3. Tendencies are private by default. They can be shared only through the separate category `intimacy_tendencies`, which is off by default.

**Metrics (restricted, to limit chance findings).** Every extra metric checked is another chance for a pattern to appear by luck, so A12 analyses a short fixed list:
- Ordinal, 0–3: **desire** (none, low, medium, high), **energy**, **comfort during sex** (pain=0 … comfortable=3).
- Binary mood **groups** (present on a logged mood day): **low mood** (low, sad, tearful, numb, self_critical) and **tense mood** (irritable, angry, anxious, stressed, overwhelmed, mood_swings).
- Up to **3 symptoms she chooses to watch** (default none), each binary.

That is at most 8 metrics (5 by default). Satisfaction, stress and individual mood or symptom options are not analysed in v1.

- A **logged day** for a tracker is a day with an explicit entry, including "none" or "no symptoms". **Missing days are never treated as "none".**
- **Comfort has a selection bias.** It is only recorded on days with sex, so bins where she rarely has sex contribute few or no comfort values, and comfort also depends on things the app does not see (the partner, the setting, health). Comfort is therefore used only as a "not lower" filter for F-118 and is always shown with the sentence "Comfort is only logged when you have sex, so this may not reflect the whole cycle." 

**Phase bins.** Bins are defined for *completed* cycles only, so the next start is known. They are relative to the start S and the next start N:

| Bin | Days | Notes |
|---|---|---|
| B1 period | Bleeding days of the episode | Precedence 1 |
| B4 pre-period | N−5 … N−1 | Precedence 2 (ACOG's 5-day premenstrual window) |
| B3 mid-cycle | N−19 … N−11 | Calendar ovulation ±. If a marker-based ovulation estimate O exists, use O−5 … O+3 instead. Precedence 3 |
| B5 after mid-cycle | N−10 … N−6 | — |
| B2 after period | The remaining days between B1 and B3 | — |

- Overlaps go to the bin with the lower precedence number.
- Cycles longer than 45 days, or flagged irregular, with no marker: B3 and B5 are "uncertain phase" and excluded.
- Days in the current, incomplete cycle are "uncertain phase" except B1. They are counted in coverage as "waiting for this cycle to finish".

**Method.**

```text
window W = last 6 completed eligible cycles (exclude pregnancy/postpartum; hormonal-method cycles analysed only with each other, labelled "while on <method>")
for metric m with ≥3 cycles in W having ≥1 logged day of m:
  overall = mean of all logged values of m in W (binary: share of logged days with the option)
  for bin b: n_b = logged days in b; c_b = distinct cycles contributing; mean_b
     evidence ok  ⇔ n_b ≥ 6 and c_b ≥ 3
     diff_b = mean_b − overall;  threshold = 0.5 (ordinal) | 0.25 (binary)
     consistency_b = share of contributing cycles whose per-cycle bin mean is on the same side of that cycle's own mean
     candidate(b) = higher/lower ⇔ evidence ok and |diff_b| ≥ threshold and consistency_b ≥ 2/3
  chance check (controls false patterns across the 5 bins of one metric):
     S_obs = max over candidate bins of |diff_b| · sqrt(n_b)        (0 if there is no candidate)
     null: rotate each cycle's day-to-value assignment by an offset r_i ∈ [0, L_i) independently (L_i = that cycle's length),
           keeping the bins fixed; recompute the candidates and S for each rotation combination
     p = share of rotation combinations with S ≥ S_obs (exact enumeration when ∏ L_i ≤ 2,000,000; otherwise
         p = (1 + #{S ≥ S_obs}) / (1 + 999) over 999 combinations drawn from a xorshift32 generator seeded with
         FNV-1a-32(paramsHash ‖ metricId ‖ the window's cycle start dates), so the engine stays pure and deterministic, E1)
     tendency(b) = candidate(b) for every candidate bin ⇔ p ≤ 0.05 (DESIGN α, per metric)
  status: no metric data in ≥3 cycles → INSUFFICIENT (show progress "2 of 3 cycles")
          change detection fires (below) → RECENTLY_CHANGED, and no TENDENCY is shown for that metric
          no candidate, or p > 0.05 → NO_CLEAR_PATTERN (a normal, valid result; it is expected for several cycles)
          else TENDENCY(list of candidate bins, with n_b, c_b and p)
  change detection (needs 6 cycles; descriptive only, it never asserts a pattern): split W into older O (cycles 4–6 back) and
          recent R (last 3); evaluate each alone with the candidate rules (no chance check); if some bin is a candidate in both
          with opposite signs → RECENTLY_CHANGED ("your recent cycles look different from earlier ones, so no pattern is shown")
coverage = logged days of m / days in W; if coverage < 40% add "Patterns only reflect days you logged (you logged X of Y days)"
"When you've tended to feel like sex" (F-118): bins where desire = higher and comfort ≠ lower (or comfort INSUFFICIENT) → listed with
          evidence counts + fixed text: "This describes past logs, not a prediction — and it never means yes."
          If any listed bin overlaps B3 → also show "Mid-cycle is also when pregnancy is more likely" (A5 link)
comparisons use exact rationals or a 1e-9 epsilon; thresholds inclusive
every TENDENCY and F-118 card also shows: "Patterns can appear by chance, especially with only a few cycles."
```

**False-pattern control and its honest limits.**
- Stage D's illustrative simulation of the unguarded rules (phase-independent random data) found a spurious TENDENCY for 2–25% of metrics depending on logging rate and cycle count, about 76% of users seeing at least one across five metrics at the 3-cycle minimum. A Stage E planning simulation (scratch only, not committed: independent uniform values, fixed 28-day cycles, 300 null histories per cell, 99 rotations) found 2.5–35% without the chance check and 0.7–6.3% with it, at the cost of power: planted mid-cycle effects were detected in only about 13–53% of histories, lowest with 3 cycles and sparse logging. These numbers are illustrative only.
- **Required target (T-ENG-05, P3):** at most 5% of phase-independent synthetic histories show a TENDENCY for a given metric. The P3 task reports the measured rate and the power at 3, 4 and 6 cycles; if the target fails, α or the statistic is changed through an ADR, never the generator.
- **Several metrics.** With 5 default metrics checked at 5% each, up to about 1 user in 5 with no real patterns could still see one chance pattern somewhere (1 − 0.95⁵ ≈ 23%, worst case). The "Why?" sheet states how many patterns were checked and that about 1 check in 20 can show a pattern by chance.
- **Minimum data is a design choice.** The 3-cycle, 6-day and 3-cycle-per-bin minimums are DESIGN thresholds, not clinically validated ones. In practice the chance check means patterns usually need several cycles of regular logging before they show.

**Test vectors.** Each cycle is 28 days with a 5-day period, so B1 = days 1–5, B2 = 6–9, B3 = 10–18, B5 = 19–23, B4 = 24–28.

- **TV-T1 (tendency).** Three completed cycles. In each one, desire is logged on:
  - days 2 and 4 → 1;
  - days 12 and 14 → 3, day 16 → 2;
  - days 25 and 27 → 1.

  Expected:
  - Overall mean = 12/7 = 1.714.
  - B3: mean 8/3 = 2.667, diff +0.952, n 9, c 3, consistency 3/3 → **higher mid-cycle**.
  - B1: mean 1.0, diff −0.714, n 6 → **lower during period**.
  - B4: mean 1.0 → **lower pre-period**.
  - B2 and B5: n 0 → not enough logs.
  - Coverage 21/84 = 25%, so the coverage note shows.
  - Chance check: S_obs = B3's 20/21 × √9 = 20/7 ≈ 2.857 (B1 and B4 give 5/7 × √6 ≈ 1.750). Exact enumeration over 28³ = 21,952 rotation combinations gives p = 432/21,952 ≈ 0.0197 ≤ 0.05 → **TENDENCY** (B3 higher; B1 and B4 lower). The p value was machine-computed in Stage E (scratch enumeration); the algorithm auditor must recompute it independently.
  - F-118 lists mid-cycle, with the pregnancy note and the chance sentence.
- **TV-T2 (no clear pattern).** As TV-T1, but cycle 3 has B3 values 1, 1, 1 and B1 values 3, 3.
  - B3 mean 19/9 = 2.111.
  - Overall 35/21 = 1.667.
  - diff 0.444 < 0.5 → no tendency.
  - B1 mean (1+1+1+1+3+3)/6 = 1.667, diff 0 → no tendency.
  - B4 mean 1.0, diff −0.667. Every cycle's B4 value (1) is below that cycle's own mean (1.714, 1.714, 11/7 = 1.571), so consistency is 3/3 → **lower pre-period** is still reported.
  - B4 is the only candidate: S_obs = 2/3 × √6 ≈ 1.633; exact p = 7,427/21,952 ≈ 0.338 > 0.05.
  - Expected status: **NO_CLEAR_PATTERN**. This deliberately shows that one changed cycle removes the mid-cycle claim, and that the remaining pre-period difference does not pass the chance check.
- **TV-T3 (insufficient).** Only 2 completed cycles → INSUFFICIENT, "1 more cycle needed".
- **TV-T4 (recently changed).** Cycles 1–3 as in TV-T1. Cycles 4–6 with B1 = 3, 3; B3 = 1, 1, 1; B4 = 1, 1.
  - O: B3 +0.952 → higher.
  - R: overall 11/7 = 1.571; B3 mean 1.0, diff −0.571 → lower, 3/3.
  - Expected: **RECENTLY_CHANGED** for B3, and for B1 as well (O lower −0.714; R mean 3.0, diff +1.429 → higher). No TENDENCY is shown for desire.
- **TV-T5 (missing ≠ none).** As TV-T1 with no other days logged. Expected: the B2 and B5 means are undefined, not 0, and the overall mean stays 1.714 (the chance check is as TV-T1).
- **TV-T6 (uncertain phase).** Current cycle at day 12, with desire 3 logged on day 12. Expected: excluded from bins and counted as "waiting for this cycle to finish".

## A13. Cycle analytics and normal-range labels (P3)

- **Outputs:** the cycle-length series, period-length series, variability, a six-cycle graph and a history table.
- **Range labels name their source:** "Within the 21–35 days ACOG describes as typical" and "FIGO uses 24–38 days". Nothing is labelled "abnormal".
- **Test vector TV-W2** gives the stats: min 27, max 40, median 29.5 (unweighted, for display only), variation 13.

## A14. Perimenopause signals and symptom-impact summary (P4)

**Signals.** These come from STRAW+10 as reproduced in a 2022 review; the original full text was not inspected (R/M, R3 §5, cross-check 15). The operationalization is DESIGN and flagged for audit.
- S1: among the last 10 completed cycles, ≥2 consecutive pairs with |Δlength| ≥ 7 days → "early transition-like signal".
- S2: any gap ≥60 days → "late transition-like signal".
- S3: ≥365 days without bleeding and no hormonal confounder → "may indicate menopause — confirm with a clinician" (retrospective).

**Age gating** (EVID: NICE NG23 identifies perimenopause clinically at ≥45; under 40 needs clinician assessment for possible premature ovarian insufficiency):
- age <40: never show a stage. If S1, S2 or S3 appears together with vasomotor symptoms → SEEK_ADVICE_SOON card.
- 40–44: "changes worth discussing" only.
- ≥45: Timeline estimate (F-046), labelled as an estimate.
- Hormonal contraception or HRT: signals are suppressed and the confounder is explained.

**Symptom-impact summary (F-044).** This is an original, **unvalidated** 10-item checklist:
- Items: hot flushes, night sweats, sleep, mood, anxiety, joint aches, concentration, vaginal dryness, libido change, fatigue. Each is rated 0–3 for "how much this affected you this month".
- Score = round(sum × 100 / 30).
- Shown month over month. Changes of less than 10 points are described as "about the same" (DESIGN).
- It is never called "validated" and never compared with MRS norms.
- The MRS (eleven items, 0–44) could replace it only after the licensing review (R3 §5).

**Test vectors:**
- TV-PM1: ratings [2,1,3,0,0,1,2,0,1,2] → sum 12 → **40**.
- TV-PM2: cycle lengths …, 28, 36, 27, 35 → pairs Δ = 8, 9, 8 → S1.
- TV-PM3: age 21 with S1 → no stage; card only if vasomotor symptoms are logged.

## A15. Symptom-checker pattern rules (P5)

**Output tiers:**
- "Pattern worth discussing with a clinician";
- "Some related things logged";
- "Not seen in your logs — this doesn't rule anything out".

Every output lists the exact logs and the guideline sentence it relates to, has a printable summary, and is never a diagnosis.

| Checker | "Worth discussing" when | Source |
|---|---|---|
| PCOS | Irregular cycles (≥2 cycles <21 or >35, <8 cycles/year, or any >90 days) **and** ≥1 hyperandrogenism sign logged (excess facial/body hair, scalp hair thinning). Acne alone counts as "some related things" | PCOS 2023 (R3 §7) |
| Endometriosis | ≥2 distinct features across ≥2 cycles from: severe period pain, deep pain with sex, painful bowel movements or urination during the period, ongoing pelvic pain, fatigue, difficulty conceiving | ESHRE 2022 |
| Fibroids / heavy menstrual bleeding (HMB) | W-02 signs in ≥2 periods, or pelvic pressure/bloating with heavy bleeding | NICE NG88 |
| PMS pattern | W-10 | ACOG FAQ057 |

Flo's checker uses cumulative symptom totals against unpublished thresholds (R2 §4). Ours are different, explicit and **not validated**, and the UI says so.

**Test vectors:**
- TV-C1: cycles [40, 45, 38, 50] plus excess hair logged → PCOS "worth discussing".
- TV-C2: cycles [40, 45] plus acne only → "some related things".
- TV-C3: regular cycles and no signs → "not seen in your logs — this doesn't rule anything out".

## A16. Modifiers: contraception, post-pill, postpartum, breastfeeding, pregnancy loss

| State | Period prediction | Fertility | Labels | Phase |
|---|---|---|---|---|
| Any hormonal method (pill, patch, ring, hormonal IUD, implant, injection, progestogen-only pill), until pack-aware rules exist | Prediction only with ≥3 bleeding episodes on the method (h ≥ 4); otherwise "bleeding patterns on this method vary" | Suppressed{reason = hormonal} | DESIGN; suppression FLO-DOC (R2:24) | P1 (`p1-cycle-engine`, F-015) |
| Combined pill/patch/ring with a break | Predict the withdrawal bleed at pack start + active days; Lc = pack length | Suppressed | FLO-DOC: pack length sets cycle length (R2:24) | P4 (F-016) |
| Continuous / skipped break | No bleed predicted; "bleeding can still happen" | Suppressed | FLO-DOC: continuing the pack does not count as a delay | P4 (F-016) |
| Copper IUD, condoms, none | Normal | Normal (greyed note for copper IUD) | FLO-DOC copper-IUD exception | P1 |
| Stopped a hormonal method <90 days ago | Only cycles since stopping count; settling +2 | Normal, with a "may take time to settle" note | DESIGN | P1 |
| Postpartum before the first period | Suppressed ("unpredictable after birth") | Suppressed{reason = postpartum_before_first_period}; "pregnancy possible before the first period" | I-H; content review must cite | P4 (mode), category defined in P1 |
| Breastfeeding | Wider windows (settling +2) once periods return | Normal, with a note | DESIGN | P4 |
| Pregnancy loss | The affected cycle is excluded; settling +2 for 2 cycles; gentle copy | Normal | DESIGN | P4 |
| Perimenopause age band | Normal A2 (MAD widens h) | Normal | — | P1 (A2), P4 (A14) |

**Test vectors:**
- TV-K3 (P1): combined pill started 2026-06-01, one bleeding episode since → no period prediction, text "bleeding patterns on this method vary"; fertility Suppressed{reason = hormonal}, chance DEPENDS_ON_METHOD.
- TV-K2 (P1): stopped the pill 2026-07-01, then one natural cycle of 33 days → n=1: h = 3 + 2 = 5.
- TV-K1 (**P4**, F-016; not part of P1): 21 active pills and a 28-pill pack started 2026-09-01 → withdrawal bleed predicted around 09-22 (09-01 + 21). Fertility is Suppressed.

## A17. Insight-card selection (P1 core cards; P3 personalized)

```text
candidates = cards where card.modes ∋ lifeStage and card not shown in the last 14 days and card.sources non-empty
score = 3 if card.symptomTags ∩ symptoms logged in the last 3 days ≠ ∅; +2 if card.phaseTags ∋ current phase; +1 general
pick highest score; ties → lowest hash32(cardId + today) (deterministic daily rotation)
refresh when a new log is saved (FLO-DOC behaviour: stories refresh on log, R2 §2)
```

Cards are original text with citations ([ux-spec.md §8](ux-spec.md#8-original-educational-content-plan)).

**Test vector TV-I1.** Today is a period day with "cramps" logged. Candidates are `cramps-basics` (symptom cramps, phase period), `cycle-phases-intro` (general) and `fertile-window-uncertainty` (phase fertile). Expected pick: `cramps-basics`, with score 5.

## A18. Accuracy measurement and backtesting

**Harness** (`tools/backtest/`, P1):
- Walk-forward evaluation over each synthetic history. For each cycle i ≥ 1, predict start_{i+1} using only the data before it, with today = start_i + 1.

**Metrics:**
- MAE (mean absolute error) in days;
- % of predictions within ±1 and ±2 days;
- window coverage, i.e. the share of actual starts inside [lo, hi];
- mean window width.

Results are stratified by prior-cycle count (0, 1, 2, 3–5, 6+) and by regularity.

**Baselines:**
- `B28`: start + 28.
- `BAVG`: start + round-half-up(mean of all prior cycles of 15–90 days), or 28 when there are none.

**Acceptance targets (T-ENG-04; DESIGN, synthetic suite only).** They are set per scenario because a robust median is not expected to beat a plain average on perfectly stable data; its purpose is to resist outliers and follow repeated changes:

| Scenario | Target |
|---|---|
| Stable | MAE(v1) ≤ min(MAE(B28), MAE(BAVG)) + 0.25 day, in every prior-cycle stratum; window coverage ≥ 70% with 6+ prior cycles for within-person SD ≤ 3 days (wider-spread profiles are reported, not gated) |
| Outliers | MAE(v1) ≤ min(MAE(B28), MAE(BAVG)) + 0.25 day |
| Drift | MAE(v1) < MAE(BAVG) over the predictions after the change (hand vector TV-A2) |
| Skipped logs, irregular, post-pill | Reported only, with no pass/fail: no target was justified in advance |

Stage D's illustrative simulation (stable Gaussian cycles) found v1's MAE 0.05–0.12 day above BAVG's and coverage 0.72–0.98 depending on spread, which these targets accommodate without tuning. If a target fails, the result is recorded and the method or target changes only through an ADR with the evidence. **The generator is never tuned to make an engine pass.**

**Data: frozen synthetic scenarios.** `p0-synthetic-data` commits these parameters in `tools/synthetic/scenarios.json` (generator version 1) **before** any engine code exists; `p1-backtest` checks the file is unchanged. Labels: EVID means the value is taken from a cited population source; DESIGN means it is a planner choice informed by that source (factual gap D-G02). None of the sources gives per-person distributions, so every within-person parameter is DESIGN.

| Scenario | Parameters | Label and source |
|---|---|---|
| Stable | Per-person mean drawn uniformly from 24–35 days; within-person SD drawn from {1, 2, 3, 4} days; Gaussian lengths rounded to whole days; 12 cycles | DESIGN, informed by Fehring 2006 (95% of cycles 22–36 days) and Bull 2019 (mean 29.3), both population summaries (R3 §1) |
| Drift | 8 cycles at one mean, then a step of −4 days (for example 28 → 24) for 6 cycles; SD 1 | DESIGN (models "adaptive periods", Stage C note) |
| Outliers | Stable profile plus a 5% chance per cycle of +8 to +14 days | DESIGN |
| Skipped logs | Stable profile; each true start is unlogged with probability 0.1 or 0.2, merging two cycles | DESIGN, concept from Li 2022 (tracking skips; R3 §1); rates not taken from that paper |
| Irregular | Per-person SD drawn from 5–9 days | DESIGN; FIGO uses >9 days of variation (age 18–25) as "irregular" context (R3 §6) |
| Post-pill | First 2 cycles after stopping: mean +5 days, SD 5; then the stable profile | DESIGN; no retrieved source quantifies this |

**Synthetic results cannot show real-world accuracy, and nothing here shows parity with Flo's accuracy**, which is unpublished and unmeasured (R2 §1, R3 §8, cross-check 16). The on-device track record below is the only real-world evidence the app will have, and only for her.

**Metric test vector TV-A1.** Prediction errors (predicted − actual, in days) [0, +1, −2, +3], with windows containing the actual start in 3 of 4 cases. Expected:
- MAE = (0+1+2+3)/4 = **1.5**;
- within ±1 = 2/4 = **50%**;
- within ±2 = 3/4 = **75%**;
- coverage = **75%**.

**Drift test vector TV-A2** (hand-computed; walk-forward predictions of the six 24-day cycles after 8 cycles of 28, using A2 exactly):

| Prediction for 24-day cycle no. | Prior 24s in history | v1 Lc (24s' weight vs half-total) | v1 error | BAVG prediction | BAVG error | B28 error |
|---|---|---|---|---|---|---|
| 1 | 0 | 28 | +4 | 28 | +4 | +4 |
| 2 | 1 | 28 (1.00 < 2.5613) | +4 | 28 (27.56) | +4 | +4 |
| 3 | 2 | 28 (1.85 < 2.6771) | +4 | 27 (27.20) | +3 | +4 |
| 4 | 3 | 28 (2.5725 < 2.7755) | +4 | 27 (26.91) | +3 | +4 |
| 5 | 4 | **24** (3.1866 ≥ 2.8592) | 0 | 27 (26.67) | +3 | +4 |
| 6 | 5 | 24 | 0 | 26 (26.46) | +2 | +4 |

MAE: v1 16/6 ≈ **2.667**; BAVG 19/6 ≈ **3.167**; B28 **4.0**. The drift target holds (v1 < BAVG). v1's window contains the actual start in 5 of 6 predictions (the first window is 26–30). With 10–12 cycles of history, 4 repeats are needed before the predicted day moves (compare TV-P4, where 9 cycles need 3).

**Public datasets** are not used without explicit approval (AP-21):
- the Marquette dataset has participant reuse consent but no explicit licence;
- the Kaggle mirror's licence is "Unknown";
- the CC0 synthetic dataset is not physiologically validated.

If approved, any such dataset stays **outside the repository** (constitution rule 10) and is only read by the harness.

**On-device personal track record** (DESIGN; a Beyond-Flo transparency feature, part of F-031, P3). For each past prediction, the app stores its center, window and engine version locally. It then shows her: "Your last 6 predicted starts: 4 within ±2 days". This never leaves her device unless she exports it. It is the honest way to answer "at least as good as Flo": we cannot measure Flo, but we can show how this app has done for her.

## Edge-case coverage map

| Edge case | Handled in |
|---|---|
| Irregular cycles | A2 (MAD, variability), A4 (wide band), A11 W-04/W-05, A12 (uncertain bins) |
| Missed or late logging | A1 (backfill), A2 (missed-log check), A12 (missing ≠ none, coverage) |
| Outliers | A2 (weighted median, >90 excluded, <15 flagged, last-cycle widening) |
| Hormonal contraception and withdrawal bleeds | A1 kind, A4 suppression, A16 |
| Postpartum and breastfeeding | A1 lochia, A16 |
| Perimenopause | A2 (spread), A14 |
| Pregnancy loss | A10 end, A16 |
| Spotting vs period | A1 |
| Edits to past entries | Pure full recompute (E1–E2); stored prediction track record keeps its version |
| Time zones and DST | A0 |
