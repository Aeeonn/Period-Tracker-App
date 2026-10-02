> **Provenance:** verbatim copy of the Stage A scout report `flo-r6/report.md` (Firstmate task `flo-r6`), copied into the plan on 2026-10-02 for Stage C. Content below this note is unchanged; all access dates and labels are the scout's. Downstream readers: read the summary first and open details only when a decision needs them.

# R6 — Beyond Flo: couple communication and sexual wellbeing

**Stage A / Step 1 / R6 only. Research date: 2026-10-02 UTC.** Two adult iPhone users; cycle-owner control; sharing initially off; offline PWA; $0 recurring cost. No application code, feature selection, medical-safety audit, algorithm audit or security certification.

## Decision-relevant summary

- **Documented; high:** Other trackers offer useful sharing patterns, but not one uniform model. Clue Connect and Cycles keep personal symptom/sex logs private; Natural Cycles exposes optional tracker categories and a sharing-start date, alongside a mandatory baseline once sharing is enabled. Stardust documents invitations and removal/blocking but not precise category visibility.[1–4]
- **Documented; high:** Paired supplies mutual-answer conversation prompts; Coral separates private accounts from partner chat and supplies intimacy exercises and reflection. **Inferred; high:** These are ideas to adapt with original content, not evidence of improved relationship outcomes here.[8–9]
- **Documented; high:** Roney & Simmons (2013) found within-cycle hormone–desire associations; Wilcox et al. (2004) found intercourse 24% more frequent during their estimated six fertile days. **Inferred; high:** Neither supplies a personal libido forecast or proves hormonal causation.[10a–b]
- **Documented; high:** Mood evidence is heterogeneous. A prospective-study review did not support a universal specifically premenstrual negative-mood pattern. A small 2025 daily study found no significant phase-only effect on energy, mood or desire despite some hormone associations.[10c–d] **Inferred; high:** Start with her reports, not “she should feel X today.”
- **Documented; high:** Euki documents accountless, local/offline tracking, PIN protection and on-demand/scheduled deletion; drip documents local storage, transparent calculations and CSV migration. **Inferred; high:** Local-only storage does not itself provide recovery or couple sync.[6–7]
- **Inferred; medium — recommendation, not selection:** Most promising candidates are support-request cards, optional relationship check-ins, personal pattern summaries, contraception/test organization and quick-hide. Shortcuts should initially open an unlocked-in-app quick-log flow, not transmit health values in URLs. Correlations need missing-data/context warnings; PBAC requires chart/product-specific validation and permissions.[11–12]

All additions await Stage C planning and the existing Stage F approval gate. No new blocking user decision arose. This report does not establish that every candidate is absent from Flo: R1 already documents quizzes, sexual-wellness content, reminders and pattern insights. Some candidates improve consent, specificity or workflow rather than add a genuinely novel feature.

## Evidence conventions and access limits

**Documented (D):** inspected primary documentation/publication; **Reported (R):** secondary observation or a publisher’s unverified outcome/assurance; **Inferred (I):** interpretation/proposal. **H/M/L:** high/medium/low confidence in support for the stated claim, not medical accuracy. Labels cover associated paragraphs/cells; gaps are I/M. **Access** statements are D/H for the publisher’s assertion, not its independently verified entitlement.

**Tier-U:** publisher-stated entitlement, **not independently verified**. Two same-publisher pages, including its Apple-hosted description, are not independent sources. No feature-tier claim below passes the prompt’s two-independent-source gate; Stage B must corroborate before the plan treats it as established. Regional offers, paywalls, installed UI and exact device compatibility were not tested. These are native-app sources, not proof of Safari/PWA capability. No commercial app’s “private,” “encrypted” or “anonymous” wording establishes project-equivalent end-to-end encryption.

## 1. Current documented feature leads

### Clue — calendar sharing and interpretable personal trends

**D/H:** Connect uses an explicit consent checkbox and invitation code; the receiver sees period, estimated fertile/ovulation and PMS information in a calendar, **not mood, energy, pain or other tracked experiences**. Sharing can be removed; one connection at a time is specified by the current sharing article; Pregnancy mode is excluded. Both need accounts.[1a]

**D/H:** Analysis includes calendar filters, cycle overviews, cramps/flow analysis, BBT charts and custom tags. Wearable documentation discusses sleep–energy and sleep–mood comparisons; Apple Watch integration is iOS-specific. Reminders include period-late, tracking and minipill reminders. App lock uses device-supported identification; privacy-processing preferences have toggles.[1b–e]

**Access:** publisher places Connect sharing, wearable integration and advanced analysis in Plus; receiving a shared cycle is described as free (**all Tier-U**). **D/H:** “Chat With Your Data” is an LLM feature with a staged US/English/Period Tracking/Plus beta, not assured general availability.[1f] **I/H:** Borrow approachable questions about logs, not its AI deployment.

### Natural Cycles — granular optional sharing and contraception organization

**D/H:** Partner View uses an emailed, single-use invitation. Enabling it automatically shares fertility status, predictions, ovulation status, temperatures/exclusion reasons and period/spotting entries. Optional sharing covers emotions, pain, skin, notes, sex, sex drive and LH/pregnancy tests; the owner can set a sharing-start date. Disabling removes partners; re-enabling requires invitations. Daily status can remain “Unknown” until the owner opens her app.[2a]

**D/H:** Logging distinguishes temperature/period/LH/EC/test inputs from optional wellness trackers, including sex drive/intimacy, mood, mucus and sleep/lifestyle. Sex logging includes protection categories and other activities, such as touching and masturbation. Sleep Insights have device/mode restrictions: NC° Band/Oura and particular modes for personalized check-ins.[2b–c]

**D/H:** Go Anonymous separates identifying and fertility data and requires a recovery key; it disables Partner View. These are published product descriptions, not independently validated anonymity guarantees.[2d] **Access:** publisher describes a subscription (**Tier-U**); precise partner entitlement/platform rollout not verified. This is a contraception-oriented product, **not a template for project contraceptive outputs**: do not import its day-status labels, clearance or effectiveness claims.[2e]

### Stardust — actionable connection, with evidential boundaries

**D/H:** Partner Mode invitations are sent by text; partners can be removed or blocked. Friend Sync uses codes. Symptom logging, cervical mucus, BBT, Apple Health/Oura connection and sleep/energy/activity pattern features are documented.[3a–b]

**D/H:** Its policy describes separate contact authentication and health-data identifiers, encryption, health-data collection, and analytics/advertising technologies. **I/H:** This is not evidence of local-only storage. Exact partner-visible fields, opt-in defaults, pause and cache revocation were not established. Lunar/astrological explanations and stereotyped hormone narratives are **not** evidence for personal insights.[3b–d]

**Access:** FAQ says iOS/Android, usually iOS-first; labels “Signal Sync” as Super while describing basic tracking/insights as free (**Tier-U**). Do not assume simultaneous platform delivery.[3a]

### Cycles — restricted partner calendar, private observations

**D/H:** Partner Connect is link-based; the partner needs an Apple device and account. Help says the partner sees the same Cycle tab updated from period-date edits, **not logs, observations, sexual activity, insights or owner reminders**. The App Store description documents passcode/Face ID, contraception reminders and doctor-facing Insights Overview.[4a–b]

**D/H:** Privacy help allows use without an account, or an account for cross-device storage; it states no data sale/third-party-advertiser sharing. **I/M:** No independently established E2EE or offline sharing/revocation mechanism. **Access:** sharing, customized reminders and advanced insights are publisher-labelled Premium (**Tier-U**); US lookup returned version 6.5.2, minimum iOS 16.0, released 2026-09-28.[4b–c]

### Apple Health Cycle Tracking — contextual logs, preview and portability

**D/H:** Documents periods, symptoms, spotting, BBT, pregnancy/lactation/contraceptive factors, notifications and cycle-history PDF export. Certain retrospective ovulation features require compatible Apple Watch models and regions. Apple explicitly says Cycle Tracking is not birth control.[5a]

**D/H:** Health’s general sharing flow lets users choose topics, review “View Shared Data,” change permissions and stop sharing; XML export is also documented. **I/M:** These pages do not establish exactly which cycle fields are available to a partner or a couples communication workspace. Do not equate generic Health sharing with a verified cycle-sharing inventory.[5b]

**D/H:** Health’s iCloud E2EE description depends on device/software, passcode and two-factor authentication. Native Siri period logging is documented on supported models/languages/regions; it does not prove equivalent PWA/Shortcuts integration.[5a,c] **Access:** built-in Health documentation, no researched subscription tier; actual users’ iOS/Watch models remain unknown.

### drip — transparent local tracking and import/export

**D/H:** Documents on-device tracking, transparent/open-source calculations, temperature plus mucus or cervix observations, mood/energy fields in migration guidance and CSV import/export. Privacy policy covers iOS/Android, no ads/usage tracking, deletion, and a warning that OS settings may still cause cloud backups.[6a–b]

**I/M:** No built-in partner sharing, communication, pill-management or advanced sex/libido insight was established in the inspected pages; absence from documentation is not proof of absence. Store availability/feature equality were not tested. **D/H, inherited from R3:** drip’s GPL and `sympto`’s AGPL licenses require separate consideration before reuse; no code reuse is proposed.[12]

### Euki — private sexual-health organization, with recovery trade-offs

**D/H:** Accountless local storage, offline use, optional PIN, customizable/renamable information sections, on-demand/scheduled deletion, period summaries, appointment/medication reminders and contraception/consent/STI education are documented. Its contraception quiz elicits preferences; it is not a project method-selection algorithm.[7a–c]

**D/H:** FAQ says BBT/mucus tracking is not currently available, suggests notes for ovulation, and says transfer currently requires manual re-entry. PIN loss cannot be recovered by the service. **I/M:** No partner-sharing workspace or libido-pattern computation was verified. A current quick-hide/decoy feature was **not verified** in these sources; the candidate below is first-principles, not an asserted current Euki feature.[7b–c]

**Access:** Euki advertises no paywalls/free use (**Tier-U**); US lookup documents iOS 13.4+, version 1.9.5, released 2025-09-04. Website and store metadata may lag one another.[7d]

### Relevant couples apps: Paired and Coral

- **D/H — Paired:** paired accounts, daily questions revealed after answering, sex/preference quizzes, topic packs, moods/notes/photos, date reminders and a relationship timeline. FAQ distinguishes a daily free question from Premium activities/insights (**Tier-U**). **D/H:** privacy policy says Paired may access responses in anonymized form for personalization/improvement; encrypted/private marketing is not proof the provider cannot read them. **I/H:** Adapt optional prompts without streak pressure, quotas or outcome promises.[8]
- **D/H — Coral:** intimacy lessons, guided exercises, conversational prompts in publisher-described encrypted partner chat and a weekly “Pulse” reflection/sex tracker. FAQ says only subscription settings and chat sync between linked accounts, not the private account’s other contents; unlinking is supported. Full content/Pulse are publisher-labelled subscription features (**Tier-U**). **I/M:** Exact current iPhone entitlement and chat cryptography are unverified; FAQ/privacy pages carry older material. Borrow the separation of personal reflection from shared conversation, not copyrighted exercises.[9]

## 2. Evidence on desire, mood and energy

**D/H, original abstract inspected:** Roney & Simmons, *Hormonal predictors of sexual motivation in natural menstrual cycles*, **Hormones and Behavior 63 (2013), 636–645**, DOI 10.1016/j.yhbeh.2013.02.013. Daily saliva and diaries over 1–2 natural cycles associated within-cycle subjective desire positively with estradiol and negatively with progesterone, with a mid-cycle average peak. Behavior associations generally reached only trend significance; between-woman and between-cycle associations were mostly absent; testosterone had no significant association after adjustment for the other hormones. Full text/sample details were not inspected.[10a]

**D/H, original abstract inspected:** Wilcox et al., *On the frequency of intercourse around ovulation: evidence for biological influences*, **Human Reproduction 19 (2004), 1539–1543**, DOI 10.1093/humrep/deh305. **68 North Carolina women using IUDs or tubal ligation; 171 ovulatory cycles; daily urine/diaries.** Intercourse was **24% more frequent** during six estimated fertile days than other **non-bleeding** days (P<0.001). **I/H:** This is relative frequency—not percentage points, a libido score, personal probability or contraception finding.[10b]

**D/H, review abstract:** Romans et al. (2012) reviewed 47 prospective non-help-seeking-sample studies: 18 found no phase association, 18 premenstrual plus other phases, seven specifically premenstrual and four other-phase associations. Heterogeneity precluded meta-analysis. **I/H:** This challenges a universal stereotype, not genuine individual PMS/PMDD experiences.[10c]

**D/H, full text:** Doornweerd & Gerritsen (2025) followed 22 naturally cycling participants and 18 oral-contraceptive users for 28 days. Naturally cycling phase-only models found no significant energy (P=.51), happiness/depression (P=.36) or desire (P=.36) differences. Some hormone associations depended on phase; authors flag small samples, multiple testing, timing uncertainty, and the need for multiple cycles. **I/H:** It does not establish contraceptive causation.[10d]

**I/H — implications:** Population averages—even pooled within-person associations—cannot predict this woman’s preferences today. Subjective desire, arousal, intercourse and consent are different. Opportunity, sleep, stress, pain, medication and relationship context may confound observations. Correlation/statistical mediation does not establish causation. Use prospectively logged personal observations; retain variation, missingness and uncertain phase estimates. “No clear pattern” is a valid result. Desire logs never imply permission, obligation or a recommended sex schedule.

## 3. Scored candidates — proposals only

All entries are **Inferred; medium confidence** in value/privacy-risk screening, **low–medium** in effort before architecture/real-iPhone tests. Scores are ordinal, not arithmetic evidence or final priorities:

- **Value (V):** 1 marginal; 2 occasional; 3 useful; 4 strongly aligned; 5 directly serves both users’ core goals.
- **Effort (E):** 1 small UI/content; 2 bounded logging/flow; 3 cross-feature/sync work; 4 substantial analysis/integration; 5 research/licensing/platform uncertainty. Assumes an approved encrypted offline foundation; excludes building that foundation.
- **Privacy risk (P):** 1 no new sensitive collection/sharing; 2 limited private data or screen exposure; 3 intimate shared records/inferences; 4 sensitive automated disclosure/OS handoff; 5 broad/provider-accessible collection. These are feature-screening judgments, not an audit.

| ID / candidate | V / reason | E / reason | P / reason |
|---|---|---|---|
| B01 Sharing-start date, recipient preview, per-entry opt-in | 5: makes owner control tangible | 3: history/permissions UI | 3: intimate history can be exposed |
| B02 “How can I support you?” cards: company, practical help, space | 5: communicates actual needs, not phase stereotypes | 2: small shared workflow | 2: chosen message only, no health disclosure required |
| B03 Optional check-in: private draft → deliberate share; skip allowed | 5: regular low-pressure communication | 3: draft/reveal/sync states | 3: emotional/relationship answers |
| B04 Intimacy preference conversation; no automatic matching or consent inference | 4: helps discuss comfort/desire | 3: original prompts/reveal flow | 3: sensitive preferences |
| B05 Private libido, comfort/pain and satisfaction trends; sharing separate | 5: centers wellbeing rather than sex counts | 4: contextual summaries | 3: highly intimate inferences |
| B06 Personal mood/energy/libido patterns with coverage and uncertainty | 4: replaces population scripts with her observations | 4: statistics/phase uncertainty | 3: inferred health patterns |
| B07 Sleep/stress/alcohol versus symptoms, descriptive comparisons | 4: explores modifiable context without causal claims | 4: confounding/missingness controls | 3: lifestyle inferences |
| B08 Shortcuts opens generic Quick Log; unlock and save inside app | 4: less logging friction | 2: entry route; real-iPhone test needed | 2: shortcut name/use may expose purpose |
| B09 Late-period/pregnancy-scare check-in: dates, test plan, feelings, optional support request | 5: practical organization plus reassurance without certainty | 3: original cited content/flow | 3: possible pregnancy; sharing strictly off |
| B10 Method/pill reminder and taken/missed record; source-linked help, no efficacy estimator | 5: daily practical need | 3: schedules, edits, offline reminder constraints | 2: private medication data |
| B11 EC/pregnancy/STI test organizer with locally available educational cards | 4: reduces fragmented records | 3: content lifecycle and reminders | 3: sensitive events; no auto partner notification |
| B12 PBAC option only after chart/product validation and permissions | 3: conditional value if heavy bleeding relevant | 5: licensing, scoring and usability uncertainty | 2: private bleeding detail |
| B13 Quick-hide: neutral screen **and lock**, easy return | 4: shoulder-surfing protection | 2: focus/background/lock flow | 1: no new data; not concealment guarantee |
| B14 Discreet, generic notifications; per-category partner opt-in | 4: privacy-preserving organization | 3: locked/offline delivery limits | 2: timing still reveals app use |
| B15 Shared dates/affection notes; explicitly choose what may feed owner insights | 3: supportive couple space | 3: authorship/conflict handling | 3: shared relationship history |
| B16 Explainable local “questions about my logs,” using fixed queries | 3: accessible alternative to charts | 3: query templates, coverage explanations | 2: no cloud AI; derived private summaries |

**I/M — recommendation:** Compare B02/B03/B05/B09/B10/B13 first; B01 is an enhancement to already mandatory consent controls, not optional privacy protection. Defer choices to planning/approval, rather than declaring Add/Backlog/Reject here. Content must be original; neither trackers nor couples apps supply reusable licensed lessons by default.

**I/H — boundaries:** Never rank either partner’s performance, predict willingness to have sex, infer consent from history, or notify the partner of a pregnancy/test result without express permission. No day receives a contraceptive assurance or effectiveness claim.

For **B07**, prefer “you logged more discomfort alongside short sleep on these recorded days” over “short sleep caused cramps”; show denominators, missing days, alternative context and tentative language. Minimum-history and statistical methods await the algorithm specification/audit.

For **B08**, **D/H:** Apple documents Shortcuts’ Open URL action.[11] **I/M:** An ordinary quick-log route is a feasibility candidate, not verified direct background PWA writing. Keep health values, secrets and credentials out of query strings, clipboard, Shortcut definitions and spoken commands; do not make Shortcuts an unencrypted sync bypass.

For **B12**, **D/H, inherited:** reuse R3’s evidence: PBAC = pictorial blood-loss assessment chart; validated thresholds are chart/product-specific, not universal millilitres. Reproduced images can have separate permissions. A generic product-change diary must not be called a validated PBAC.[12] No new chart/clinical audit was performed.

For **B13**, **I/H:** A cover screen cannot erase screenshots, previously seen shared data or every OS/browser trace. Do not silently wipe data; no destructive implementation is selected.

## 4. Method, evidence and completion

Read preserved prompt §1a/Step 1/R6 (`planning-prompt.md:190–195`) and R1/R2/R3 summaries first; reused R3’s PBAC/licensing evidence (`report.md:83,133`) rather than repeating clinical sourcing. Startup `env | grep -E '^PI_' | sort` returned **PI_PROVIDER=github-copilot, PI_MODEL=gpt-6.1-sol, PI_REASONING_LEVEL=high**.

Used inline Python 3 standard-library `urllib.request.urlopen(..., timeout=20–25)`, `json`, `re`/`html`, `concurrent.futures` and `xml.etree.ElementTree` for direct public HTTP. Relevant outputs: Clue public index **262 articles**; Perigee index **103** across two pages; inspected canonical article bodies. Apple US lookup returned the Cycles/Euki versions above. Europe PMC original records **23601091 / 15190016 / 23036262** supplied abstracts; **PMC12017372** supplied full-text Methods/Results/Table 2/limitations. Search results were discovery, not substitutes for inspected evidence.

Clue/NC guessed search API routes returned 404; article indexes worked. Cycles’ HTML was an empty JS shell; its public presentation script and help bodies exposed documented features without interactive access. Mozilla’s Euki page returned 403 and was **not** used as independent corroboration. No bypass, credentials, accounts, package installation, participant records, GitHub operations or browser interaction. No project files changed. No screenshots/visual deliverable or ship candidate.

Completion inventory: recommendations remain inputs to the already prescribed approval gate; no newly discovered blocking product choice. Factual gaps are for Stage B: tier corroboration, Stardust’s actual visibility controls, Apple’s cycle-topic sharing inventory, current Euki decoy behavior, and real-iPhone Shortcut/PWA routing. Shared gate passed: `FM_HOME=/home/justi/firstmate /home/justi/firstmate/bin/fm-captain-hold.sh complete flo-r6 --none` → `complete: flo-r6 captain-call inventory reviewed`; `verify flo-r6` → `verified: flo-r6 captain-call inventory`. Final `git status --short` was empty.

## Citations / retrieval anchors

**Source evidence accessed 2026-10-02 UTC.** Canonical HTML/DOI URLs identify sources; where API bodies supplied evidence, those endpoints are specified. Documentation is not an installed-app test. Help articles were retrieved through public JSON `https://<help-host>/api/v2/help_center/en-us/articles/<id>.json` or article-index bodies; canonical URLs identify source titles. Apple developer descriptions are the developer’s evidence, not independent reviews.

**[1] Clue**
- [1a] https://support.helloclue.com/hc/en-us/articles/29049992708509-How-to-share-cycle-data-with-a-partner-friend-or-family-member — visibility, consent, invitation, removal, one connection and tier assertions.
- [1b] https://support.helloclue.com/hc/en-us/articles/15007279508637-What-s-included-in-Clue-Plus — filters, tags, analytics and publisher tier list.
- [1c] https://support.helloclue.com/hc/en-us/articles/31172452293917-What-s-the-benefit-of-connecting-my-wearable-with-Clue ; https://support.helloclue.com/hc/en-us/articles/31172406685725-Which-wearables-can-be-connected-with-Clue — wellness comparisons, device differences.
- [1d] https://support.helloclue.com/hc/en-us/articles/14561714219677-What-reminders-are-available-in-the-Clue-app — reminder inventory.
- [1e] https://support.helloclue.com/hc/en-us/articles/29216089544989-How-can-I-password-protect-the-Clue-app ; https://support.helloclue.com/hc/en-us/articles/25409999573405-How-can-I-set-my-data-privacy-settings — lock and processing toggles.
- [1f] https://support.helloclue.com/hc/en-us/articles/37684596573469-What-is-Chat-With-Your-Data — LLM and staged beta scope.

**[2] Natural Cycles**
- [2a] https://help.naturalcycles.com/hc/en-us/articles/18688808022941-How-to-share-your-fertility-status-using-the-Partner-View — default baseline, optional categories, start date, revocation and unknown status.
- [2b] https://help.naturalcycles.com/hc/en-us/articles/11834096469149-How-to-log-data — inputs, EC/tests, wellness logging, Sleep Insights restrictions.
- [2c] https://help.naturalcycles.com/hc/en-us/articles/12131479968541-Do-I-need-to-add-sex-data — activity and protection categories; its contraception recommendations are not adopted.
- [2d] https://help.naturalcycles.com/hc/en-us/articles/20116990594333-What-is-Go-Anonymous — separation/recovery and sharing incompatibility.
- [2e] https://www.naturalcycles.com/ — published product purpose/subscription statement; effectiveness marketing deliberately not reproduced.

**[3] Stardust**
- [3a] https://www.stardust.app/faq — updated 2025-07-17; platforms, Super assertions, integrations, invitation/removal.
- [3b] https://www.stardust.app/app-features — tracking, patterns, Partner Mode and lunar/astrological framing.
- [3c] https://www.stardust.app/your-data — identity separation/encryption description.
- [3d] https://www.stardust.app/privacy-policy — updated 2026-05-08; Collection/Cookies/Advertising/Data retention.

**[4] Cycles / Perigee**
- [4a] https://perigee.zendesk.com/hc/en-us/articles/360011342999-I-want-to-share-my-cycle-with-my-Partner ; https://perigee.zendesk.com/hc/en-us/articles/360019238293-What-can-my-partner-see-when-I-share-my-cycle — invitation/access and exclusions.
- [4b] https://itunes.apple.com/lookup?id=577187307&country=us ; https://apps.apple.com/us/app/cycles-period-cycle-tracker/id577187307 — accessible lookup `description`, `version`, `minimumOsVersion`, release date. Website evidence: https://cycles.app/scripts/routes/home.js — public presentation strings, not executed.
- [4c] https://perigee.zendesk.com/hc/en-us/articles/5424631779346-What-is-Cycles-privacy-policy — accountless/account options and published privacy assertions.

**[5] Apple**
- [5a] https://support.apple.com/en-us/120356 — published 2026-09-14; tracking, factors, export, compatibility footnotes, privacy conditions and birth-control exclusion.
- [5b] https://support.apple.com/en-us/108323 — resolves to Health sharing user guide; topic selection, review/stop, XML export. Default guide was iOS 27; earlier versions selectable.
- [5c] https://support.apple.com/guide/iphone/log-menstrual-cycle-information-iph51a822b18/ios — logging, conditional Siri support, factors and privacy.

**[6] drip**
- [6a] https://bloodyhealth.gitlab.io/ ; https://bloodyhealth.gitlab.io/faq.html — local/transparency claims, observations and CSV guidance.
- [6b] https://bloodyhealth.gitlab.io/privacy-policy.html — updated 2022-08-30; iOS/Android, no tracking, OS backup caveat. Its age limits confidence in current implementation equivalence.

**[7] Euki**
- [7a] https://eukiapp.org/app-features — PIN/deletion, summaries, reminders and education/quiz.
- [7b] https://eukiapp.org/euki-faqs — BBT/mucus limits, recovery and transfer gaps.
- [7c] https://eukiapp.org/privacy-faqs-resources — accountless/offline/local and customization claims.
- [7d] https://eukiapp.org/ ; https://itunes.apple.com/lookup?id=1469213846&country=us ; https://apps.apple.com/us/app/euki/id1469213846 — website no-paywall assertion; Apple software search/lookup metadata and developer description.

**[8] Paired** https://www.paired.com/faq — mutual-answer reveal, communication features, publisher tier assertions; https://www.paired.com/privacy-policy.html — Activity Information, provider processing. Marketing relationship-effect figures were not evaluated/adopted.

**[9] Coral** https://www.getcoral.app/ ; https://www.getcoral.app/faq — exercises, chat, Pulse, linking/privacy boundary and publisher tiers; https://www.getcoral.app/privacy — displayed update 2019-10-10, collection/Weekly Pulse/interactive features; current cryptography not established.

**[10] Publications** Original abstracts retrieved using https://www.ebi.ac.uk/europepmc/webservices/rest/search with `query=EXT_ID:<PMID>`, `format=json`, `resultType=core` (title/year searches used for discovery).
- [10a] Roney JR, Simmons ZL (2013): https://doi.org/10.1016/j.yhbeh.2013.02.013 ; https://pubmed.ncbi.nlm.nih.gov/23601091/ — abstract; full text subscription-only in located record.
- [10b] Wilcox AJ et al. (2004): https://doi.org/10.1093/humrep/deh305 ; https://pubmed.ncbi.nlm.nih.gov/15190016/ — abstract Methods/Results; full text not inspected.
- [10c] Romans S et al. (2012), *Gender Medicine* 9:361–384: https://doi.org/10.1016/j.genm.2012.07.003 ; https://pubmed.ncbi.nlm.nih.gov/23036262/ — review abstract.
- [10d] Doornweerd AM, Gerritsen L (2025): https://doi.org/10.1017/S003329172400357X ; https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12017372/fullTextXML — full text, particularly Table 2 and limitations; no participant-level files downloaded.

**[11] Shortcuts** https://support.apple.com/guide/shortcuts/use-url-schemes-apd621a1ad7a/ios — Open URL/Open X-Callback URL actions. Does not establish PWA background writes or Home Screen routing.

**[12] Reused R3 evidence**, not independently re-researched: `/home/justi/firstmate/data/flo-r3/report.md`, §6/§8, citations 23–24: https://doi.org/10.1186/s12905-020-0887-y ; https://www.ebi.ac.uk/europepmc/webservices/rest/PMC7011238/fullTextXML — PBAC product/threshold/permissions limitations; https://gitlab.com/bloodyhealth/drip/-/raw/main/LICENSE and https://registry.npmjs.org/sympto/3.0.2 — license evidence. R3 accessed these on 2026-10-02; R6 inspected the report, not those endpoints.
