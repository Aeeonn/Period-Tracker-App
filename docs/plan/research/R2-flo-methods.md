> **Provenance:** verbatim copy of the Stage A scout report `flo-r2/report.md` (Firstmate task `flo-r2`), copied into the plan on 2026-10-02 for Stage C. Content below this note is unchanged; all access dates and labels are the scout's. Downstream readers: read the summary first and open details only when a decision needs them.

# R2 — Flo’s publicly disclosed methods

**Scope:** Stage A, Step 1, R2 only. **Access date for every public source below: 2026-10-02 (UTC).** Research used no account, paid service, application code, or personal health records. This is a factual methods inventory, not an algorithm or medical-safety audit.

## Decision-relevant summary

- **Exact Flo prediction parity is not publicly reproducible from the sources located.** Flo discloses inputs, several concrete rules and uncertainty-related behaviors, but not its trained models, coefficients, training procedure, or full prediction formulas. Its method is not documented as simply averaging recent cycles. **Inferred; high confidence within the reviewed corpus.** [1–8]
- **Useful documented prediction rules exist:** last 12 logged cycles affect predictions; cycles over 90 days and cycles more than a year old are excluded; positive LH test → predicted ovulation the next day; manually confirmed ovulation → that day; fertile windows have a stated minimum of seven days and can widen to 14. Those disclosures must not be extrapolated into undisclosed conflict-resolution or probability formulas. **Documented; high.** [2,5–7]
- **Insights are partly documented:** age, goal, cycle day/phase and logged symptoms select or refresh educational content. Personal pattern detection, symptom forecasting, content ranking and minimum-history criteria remain undisclosed. **Documented for inputs/behavior; Inferred for disclosure gap; high/moderate respectively.** [9–11]
- **Perimenopause Score measures symptom impact/severity, not a disclosed probability of being perimenopausal.** Its item list, weights, numerical range and cutoffs were not located. Flo’s research uses the Menopause Rating Scale (MRS), but no reviewed source identifies MRS as the deployed Score’s formula. **Documented for stated purpose; Inferred for unestablished equivalence/disclosure gap; high/moderate.** [12–15]
- **Symptom Checker has the clearest published method:** separate condition checkers, medically authored question sequences, historical logs plus answers, and cumulative present-symptom totals compared with thresholds. Exact thresholds and complete decision paths remain unavailable. The papers’ LASSO analysis identifies predictive symptoms; it is not described as the production classifier. **Documented; high.** [16–18]
- **Do not equate all Flo chat experiences.** Help describes triggered educational Health Assistant dialogues. A 2026 Flo-affiliated paper separately documents an API-based LLM sexual-well-being chatbot with an Expert–Critic design and limited experimental release; it does not establish that the general Health Assistant has been replaced by that system. **Documented; high for the distinction, moderate for present deployment coverage.** [19–20]
- No attributable Flo Health methods patent was located in bounded public searches. A relevant-looking **FLO Living** patent belongs to a different named assignee and is not evidence of Flo Health behavior. **Documented search observations; high; completeness confidence low.** [21]

## Labels and method classifications

**Documented** means directly stated in first-party documentation or a paper’s methods; it does not independently verify deployed execution. **Reported** means a source’s assertion/result, not independently reproduced here. **Inferred** means a bounded conclusion from the evidence, especially a disclosure gap. Confidence concerns support for the claim, not clinical validity.

A **documented method** supplies an operational rule; **partially documented** supplies meaningful inputs/process but omits implementation-defining details; **undocumented** means the calculation was not disclosed in the reviewed accessible corpus, not that no disclosure exists anywhere.

| Feature/method | Classification | Available versus missing |
|---|---|---|
| Period/cycle prediction | **Partially documented** | ML, inputs, history exclusions and delay-window behavior; no model/formula/calibration. |
| Ovulation prediction | **Partially documented** | LH/manual rules **documented**; calendar/BBT estimator and evidence-fusion logic missing. |
| Fertile-window construction | **Partially documented** | Day offsets and 7–14-day envelope disclosed; precise widening/asymmetry thresholds missing. |
| Daily/content insights | **Partially documented** | Selection inputs, refresh triggers and expert authorship disclosed; ranking rules missing. |
| Individual patterns/symptom forecasting | **Undocumented calculation** | Patterns and historical forecasting MVP disclosed; calculation missing and current MVP deployment unconfirmed. |
| Perimenopause Score | **Undocumented calculation** | Purpose and longitudinal tracking disclosed; instrument/scoring formula missing. |
| PCOS/endometriosis/fibroid Symptom Checkers | **Partially documented** | Cumulative threshold mechanism and development/testing disclosed; complete rules/thresholds missing. |
| Health Assistant | **Partially documented** | Educational dialogue triggers, lifecycle and medical review disclosed; complete conversation/reasoning specification missing. |
| Experimental sexual-well-being LLM chatbot | **Partially documented research system** | Expert–Critic architecture disclosed; full prompts/model identities and general rollout unestablished. |

**Classification judgments: Inferred; moderate confidence**, bounded by accessibility and absence of interactive inspection.

## 1. Period, ovulation and fertile-window predictions

### Inputs, history and new-user behavior

Flo’s accuracy page describes prior cycle dates plus a specialized AI algorithm. The 2021 AWS engineering/customer account and Flo’s corresponding publication specify age, period dates, symptoms and other metadata, with models trained on its large user population using SageMaker. That account explicitly distinguishes ML from merely combining recent cycles. **Documented; high for published description, moderate for applicability of 2021 infrastructure to 2026.** [1,8]

The current privacy policy explicitly names ML models for cycle predictions and lists personalization inputs including chosen modes, feature interactions, connected health services and onboarding responses. It does not supply the models. **Documented; high.** [26]

Help says one logged period permits initial predictions; adding at least three completed cycles allows more complicated algorithms. It recommends historical period logging for the last year or at least three cycles. Cycle settings are a component, not a direct command fixing predicted duration; previous periods and monthly symptoms also contribute, and symptoms can recalculate predictions when cycle lengths vary. **Documented; high.** [3–4]

The gap-between-cycles article states that the **last 12 logged cycles** affect predictions, excluding cycles **longer than 90 days** or **more than a year old**. BBT, ovulation tests and manually logged ovulation receive priority for ovulation prediction. This does not disclose whether all retained cycles receive equal weight, how gaps under 90 days are interpreted, or how conflicting markers are reconciled. **Documented for inclusion/priority statements; Inferred for missing details; high/moderate.** [2]

For a late period, Flo says it builds a cycle-history probability model and an arrival window. It can move the displayed date before that window closes, then show a delay notice if no period is logged. The window’s probability mass, distribution and endpoints are not supplied. **Documented; high / Inferred gap; moderate.** [4]

### Explicit marker rules and window construction

- Positive ovulation test: predict ovulation **the following day**; negative tests are not relied on because they do not distinguish ovulation already occurring from not yet occurring. If a kit reports high/peak/negative, help recommends logging only **peak** as positive. **Documented; high.** [5]
- “Ovulation: My method” tells Flo the user is ovulating **today**; examples include ultrasound and non-BBT/non-test methods. **Documented; high.** [6]
- After an ovulation estimate, help constructs the fertile window from **four to five days before**, the ovulation day, and **one to two days after**, stating a **minimum seven-day window**. Fewer than three logged cycles or substantial recent length variation can widen it **up to 14 days**. Enough information or lower variability returns it to seven days. **Documented; high.** [7]
- BBT affects prediction, but a temperature-shift rule, coverline, required measurement count and handling of fever/missing temperatures were not disclosed in located sources. Likewise no numerical daily conception-probability formula was found. **Inferred disclosure gaps; moderate.** [1–2,5,7]

The 2020 Flo-data paper assigns estimated ovulation to the day after a positive LH test; for multiple tests its research analysis uses the last result. **Documented research convention; high.** It does **not** establish the current app’s multiple-test conflict rule. [22]

### Suppression and contraception

Help states fertile/ovulation predictions can disappear during hormonal-contraception tracking, a displayed period delay, or an estimated cycle outside supported lengths. Its length wording is inconsistent at **20 days**: it says predictions disappear below 20 or above 60, but resume with a trend between 21 and 60. Do not silently resolve that boundary. **Documented; high.** [23]

The contraception article gives additional operational behavior: pill reminders make predicted cycle length equal the pills in one pack; skipping the break continues the current cycle without a delay. Contraception reminders suppress fertility/ovulation displays; a copper-IUD exception retains an ovulation day as a gray circle. Exact regimen handling is unspecified. **Documented; high.** [24]

### Accuracy claims are not formulas

Flo reports that 90% of surveyed users say it accurately predicts period starts; its product-tour page identifies a 2021 survey of 2,000 people. This is user-reported accuracy, not a disclosed day-error benchmark against which “at least as good as Flo” can be established. **Reported; moderate for the marketing statistic; Documented, high for its survey framing.** [1,25]

## 2. Insights, reports, patterns and symptom forecasts

Help describes daily stories selected by **age, goal, cycle day and logged symptoms**, refreshing daily and when a symptom/event is logged. Stories include cycle-phase explanations, symptom causes/tips, pregnancy progress and fertility education. The Insights library is organized by goal-relevant/general categories, is searchable and permits saving content. **Documented; high.** [9]

Cycle analytics disclose previous-cycle length, bleeding length and variation; a three-cycle history widget; and a last-six-cycle trend graph compared with ACOG guidance. If a symptom pattern is noticed, it appears in “Patterns of Your Body”; doctor reports include cycle history, patterns and frequently logged symptoms. Exact normality evaluation rules are referenced to an in-app information icon, not provided on the help page. **Documented; high.** [10]

The 2021 engineering account calls symptom prediction an **MVP** and ML-based ovulation/window improvements something being investigated. These are dated development statements, not evidence that those particular prototypes shipped. “Smart algorithms” pair content with users, without disclosure of the recommender or symptom predictor. **Documented historical status; high. Inferred disclosure gap/current deployment uncertainty; moderate.** [8,11]

Flo-affiliated population studies describe cycle and symptom associations, but do not by themselves specify which relationships, thresholds or models the current individual insights engine uses. **Inferred; moderate.** [11]

## 3. Perimenopause Score and adjacent tools

The July 2025 launch announcement says Flo’s science/medical teams developed a Score evaluating symptoms and their real-life impact, calling it scientifically validated and specifically designed for perimenopause. **Reported validation claim; moderate**, because an identifiable Score-specific validation study or instrument was not located. [12]

The 2025 launch also describes a perimenopause period-arrival **window rather than an exact date**, based on logged cycle data, without giving its calculation. **Documented; high.** [12]

A May 2026 announcement separates four tools: **Symptom Checker** (possible symptom match), **Score** (severity/impact over time), **Menopause Timeline** (estimated journey phase), and **Relief Options** (matched information). The App Store description confirms month-by-month Score tracking. These should not be collapsed into one staging or diagnostic formula. **Documented; high.** [13–14]

Flo’s 2025 affiliated perimenopause survey used the **11-item MRS** to measure symptom burden; its educational research explanation describes adding responses into a total. The paper studies MRS scores and self-reported clinician-confirmed status, not a deployed product named Perimenopause Score. No reviewed source connects that research instrument to the product calculation. **Documented study method; high. Inferred unestablished equivalence/disclosure gap; moderate.** [15]

Questions, response scales, weighting, severity bands, missing-answer handling, monthly aggregation, score-change interpretation and Score-specific validation metrics therefore remain unknown. The 2025/2026 announcements also describe evolving availability differently; this report makes no free/Premium entitlement determination. **Inferred; moderate.** [12–15]

## 4. Symptom Checker

The product page describes a roughly five-minute question-based assessment and an output about whether symptoms match PCOS, endometriosis or fibroids. **Documented; high.** [16]

The 2023 Flo-affiliated paper describes three **single-condition** conversational checkers, using answers plus previously entered symptom/cycle information. In-house clinicians and external specialists author, test and iteratively review sequences against Monash, ESHRE and AAFP guidance. Its described flow includes an initial acute-symptom/red-flag step, a strong versus weak/no-match result, and a symptom summary for clinician discussion. These are descriptions of the studied prototype/process, not a complete current implementation. **Documented; high.** [17]

The 2024 paper is explicit: checkers use a **cumulative total of present symptoms over a threshold**. It describes significant, low or no match; its evaluation combines low/no into one category. Inputs include medical and family history as well as symptom questions. The separately conducted **LASSO regression** ranks predictive symptoms in the research dataset; it is not stated to be the checker’s decision engine. **Documented; high.** [18]

Reported agreement in 2023’s **24 vignettes per condition** was 83.3% for endometriosis/fibroids and 87.5% for PCOS. The 2024 self-reported-symptom study reported accuracy of 78%, 73% and 75% for PCOS, endometriosis and fibroids respectively. These are different evaluations, not interchangeable accuracy promises; the later paper itself explains the difference in study inputs. **Reported; high confidence in faithful attribution, not independently validated.** [17–18]

The 2024 supplement contains symptom prevalence and study-performance tables, not full deployed thresholds or dialogue trees. Thus neither published top-ten symptoms nor guideline names suffice to reconstruct Flo’s proprietary checker. **Documented supplement contents / Inferred reconstruction limit; high/moderate.** [18]

## 5. Health Assistant and the separate LLM experiment

Help calls Health Assistant an educational interactive dialogue tool. New cycle phases, specific symptom/event logs and cycle-start reports trigger conversations; some chats disappear after log changes or loss of relevance, others after 24 hours. Existing answers cannot be edited. Flo says automated reasoning follows medical evidence and specialist checking, but does not publish the complete rule graph or inference algorithm. **Documented; high for stated behavior; Inferred gap; moderate.** [19]

A 2026 Flo-affiliated *Digital Health* paper describes **“Expert”**, an LLM chatbot following a sexual-wellness program. Its prompt includes persona, medical/product rules, medically verified knowledge and a recap. A second, different-model **“Critic”** shares the ruleset and helps review responses; clinicians/product staff retain review responsibilities. Both use proprietary LLMs via API. Experimental exposure was approximately **3% of eligible program users**; planned broader post-market surveillance was not reached during the study. **Documented; high for the study, not an independent safety endorsement.** [20]

Neither the accessible article nor help establishes that Expert is the universal 24/7 Health Assistant, or that its architecture is used for all checkers. Full commercial model/version identities, complete prompts, general rollout and current coverage remain unverified. The LLM supplement retrieval timed out, so additional disclosure there is not ruled out. **Inferred; moderate.** [19–20]

## 6. Search boundaries, reproducibility and handoff

### Patent and inaccessible-source evidence

Google Patents public searches for assignees `Flo Health`, `FloHealth`, `Owhealth`, phrase `Flo Health UK Limited`, inventor `Klepchukova`, and phrase `Perimenopause Score` returned zero results. Phrase `Flo Health` produced a third-party Turkish digital-consultancy application, not a Flo-assigned invention. A broader Flo/menstrual search produced [US11350912B2](https://patents.google.com/patent/US11350912B2/en), **FLO Living LLC / Alisa Vitti**; do not attribute it to Flo Health. **Documented observations; high.** Search completeness is **low**: unpublished applications, alternate assignees/spellings and database coverage remain possible. No patent claim was used as deployed-behavior evidence. [21]

Flo’s careers page links its engineering publication at `medium.com/flo-health`; direct retrieval returned a Cloudflare block. Tecton’s Flo customer URL redirected to Databricks’ general blog. JMIR publisher retrieval yielded no usable article text; Europe PMC’s public full-text XML and the 2024 supplement supplied the paper evidence instead. Google search required JavaScript; DuckDuckGo presented a challenge; Bing returned repeatedly broad, irrelevant Flo results, which were not used as claim evidence. Interactive app behavior was not inspected. **Documented access observations; high.**

### Work performed and runtime evidence

Read the preserved planning prompt in full. Actual startup profile matched: `PI_PROVIDER=github-copilot`, `PI_MODEL=gpt-6.1-sol`, `PI_REASONING_LEVEL=high`. Own Pi session JSONL lines **2–3** independently record model/thinking changes to those values at 2026-10-02T02:55:21Z. **Documented; high.** Session: `/home/justi/.pi/agent/sessions/--home-justi-.treehouse-flo-333f10-2-flo--/2026-10-02T02-55-20-809Z_01a0fa89-a8e8-705a-b214-d96098f6b77b.jsonl`.

`chrome-devtools-axi open` and `newpage` both failed with `BROWSER_ERROR: No page is currently selected`. Firstmate inbox **001**, acknowledged into `handled/`, authorized public HTTP fallback; keyed browser blocker was resolved. No failing browser action was repeated afterward.

Reproducible retrieval patterns (Python standard library only; no installation):

```sh
curl -L --max-time 20 -s -w '\nSTATUS %{http_code}\n' '<source URL>'
# Help corpus: two public JSON pages, 141 English articles total
# https://help.flo.health/api/v2/help_center/en-us/articles.json?page=1&per_page=100
# https://help.flo.health/api/v2/help_center/en-us/articles.json?page=2&per_page=100
# Papers: urllib.request + xml.etree.ElementTree, body/sec and p text
# https://www.ebi.ac.uk/europepmc/webservices/rest/<PMCID>/fullTextXML
# Supplements: .../<PMCID>/supplementaryFiles; zipfile + DOCX XML in memory
# Patents: https://patents.google.com/xhr/query?url=<URL-encoded query>&exp=
```

Nature, Flo, help API and AWS source retrievals succeeded; API output furnished claim-level article bodies. Flo/help pages can change rapidly: several article update timestamps fell on 2026-10-01/02.

**Recommendation to firstmate:** carry the isolated documented rules forward as Flo-sourced behavior, and carry missing computations as explicit evidence gaps for R3 and later plan synthesis. Do not label substitutes as Flo’s formulas, treat research classifiers as deployed code, or assert measured prediction parity from a user survey. No architecture/product choices or captain-owned decisions were made. No application change is proposed for shipping.

## Citations and source locators

**All accessed 2026-10-02.** Links below are source evidence, not instructions to reuse Flo’s protected content.

1. [Flo Accuracy](https://flo.health/flo-accuracy), “Why is Flo so accurate?” and introductory explanation.
2. [Help: gaps between cycles](https://help.flo.health/hc/en-us/articles/51632057450900-How-can-I-remove-a-big-gap-between-cycles), history exclusions and marker priority.
3. [Help: checking predictions](https://help.flo.health/hc/en-us/articles/4406826523284-Checking-your-cycle-predictions); [setting up account](https://help.flo.health/hc/en-us/articles/4406826484500-Setting-up-your-Flo-account), “Period logging.”
4. [Help: cycle setting not reflected](https://help.flo.health/hc/en-us/articles/360015106232-The-app-doesn-t-reflect-the-cycle-duration-I-ve-specified); [symptom changes predictions](https://help.flo.health/hc/en-us/articles/360015106212-I-logged-a-symptom-and-my-predictions-changed-Why); [moving late-period prediction](https://help.flo.health/hc/en-us/articles/360015317051-My-period-is-late-but-Flo-just-moves-its-prediction-to-the-next-day).
5. [Help: ovulation test effect](https://help.flo.health/hc/en-us/articles/360015162972-What-changes-when-I-log-ovulation-test-results); [BBT and test logging](https://help.flo.health/hc/en-us/articles/360015318231-How-do-I-log-my-basal-temperature-or-ovulation-test-results).
6. [Help: manual ovulation](https://help.flo.health/hc/en-us/articles/360015106752-Can-I-enter-my-ovulation-manually).
7. [Help: fertile-window length](https://help.flo.health/hc/en-us/articles/360015313531-Why-is-my-fertile-window-so-short-long).
8. [AWS, Mikey Tom, 2021-02-19](https://aws.amazon.com/blogs/startups/using-machine-learning-to-track-periods-with-flo/); [Flo corresponding publication, 2021-03-09](https://flo.health/newsroom/machine-learning-and-amazon-sagemaker-to-advance-womens-health).
9. [Help: personalized insights](https://help.flo.health/hc/en-us/articles/4407234447252-Getting-insights-on-your-health-and-well-being); [stories](https://help.flo.health/hc/en-us/articles/360061400591-What-are-Flo-stories); [Insights library](https://help.flo.health/hc/en-us/articles/360061400651-What-is-Insights-and-how-do-I-navigate-there).
10. [Help: analyzing cycles/symptoms](https://help.flo.health/hc/en-us/articles/4407228784276-Analyzing-your-cycles-and-symptoms).
11. [Flo science/publication catalogue](https://flo.health/science-and-research); [Cunningham et al., 2024](https://www.nature.com/articles/s41598-024-60373-3), introductory app description and Methods, DOI `10.1038/s41598-024-60373-3`.
12. [Flo perimenopause launch, 2025-07-17](https://flo.health/newsroom/flo-for-perimenopause-is-launching-to-empower-the-1-billion-women-who-experience-perimenopause-without-the-support-they-deserve), Score and irregular-period-window descriptions.
13. [Flo updated perimenopause tools, 2026-05-12](https://flo.health/newsroom/the-perimenopause-conversation-has-arrived-but-clarity-has-not-flo-health-aims-to-change-that), four-tool separation.
14. [US App Store listing](https://apps.apple.com/us/app/flo-period-tracker-calendar/id1038369065), app description, perimenopause paragraph.
15. [Cunningham et al., 2025, perimenopause survey](https://www.nature.com/articles/s44294-025-00061-3), Introduction/Methods; [Flo research explanation](https://flo.health/collaborations/academic-research/when-do-perimenopause-symptoms-start), “When do symptoms start?” DOI `10.1038/s44294-025-00061-3`.
16. [Flo Symptom Checker](https://flo.health/product-tour/symptom-checker), “How does Symptom Checker work?”
17. [Peven et al., 2023, clinical vignettes](https://doi.org/10.2196/46718). Retrieved [full text](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10731551/fullTextXML), Introduction, symptom-checker development, Methods and Table 2. Flo affiliations are in the article front matter.
18. [Wickham et al., 2024, exploratory survey](https://doi.org/10.2196/65469). Retrieved [full text](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11672639/fullTextXML), “Flo App and Symptom Checker Development,” “Statistical Analysis,” Table 2 and [supplement](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11672639/supplementaryFiles), `formative_v8i1e65469_app1.docx`. Flo affiliation in front matter.
19. [Help: Health Assistant](https://help.flo.health/hc/en-us/articles/360052676191-How-do-I-chat-with-Flo-Health-Assistant), dialogue triggers/lifecycle and automated reasoning.
20. [McGee et al., 2026, LLM feasibility study](https://doi.org/10.1177/20552076261435861). Retrieved [full text](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC13087339/fullTextXML), Methodology, phases 2–3, stage 4, limitations; Flo affiliation in front matter. [Supplement endpoint](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC13087339/supplementaryFiles) timed out.
21. Google Patents searches: [Flo Health assignee](https://patents.google.com/?assignee=Flo+Health); [Owhealth assignee](https://patents.google.com/?assignee=Owhealth); [FloHealth assignee](https://patents.google.com/?assignee=FloHealth); [exact company phrase](https://patents.google.com/?q=%22Flo+Health+UK+Limited%22); [Klepchukova inventor](https://patents.google.com/?inventor=Klepchukova); [Perimenopause Score](https://patents.google.com/?q=%22Perimenopause+Score%22). Counts read from public `xhr/query` JSON, not estimated from search snippets. [FLO Living false positive](https://patents.google.com/patent/US11350912B2/en).
22. [Grieger and Norman, 2020](https://doi.org/10.2196/17109); [retrieved full text](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC7381001/fullTextXML), Methods, “Ovulation.” Flo-data collaboration, not Flo-affiliated author employment established here.
23. [Help: disappearing ovulation predictions](https://help.flo.health/hc/en-us/articles/360015106672-Why-can-t-I-see-ovulation-predictions).
24. [Help: birth-control logging](https://help.flo.health/hc/en-us/articles/360015106292-How-do-I-log-my-birth-control-method).
25. [Flo cycle product tour](https://flo.health/product-tour/tracking-cycle), 90% survey claim and reference 3.
26. [Flo Privacy Policy](https://flo.health/privacy-policy), personal-data processing table, App features/personalization and cycle-prediction rows; used only as methods evidence, not a privacy audit.

**Access-limit locators:** [Flo careers](https://flo.health/careers) → [Medium engineering publication](https://medium.com/flo-health), blocked; [Tecton Flo URL](https://www.tecton.ai/customers/flo/) → `https://www.databricks.com/blog`, non-specific redirect. No unavailable-source contents are asserted.
