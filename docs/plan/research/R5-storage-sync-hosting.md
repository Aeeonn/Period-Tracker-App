> **Provenance:** verbatim copy of the Stage A scout report `flo-r5/report.md` (Firstmate task `flo-r5`), copied into the plan on 2026-10-02 for Stage C. Content below this note is unchanged; all access dates and labels are the scout's. Downstream readers: read the summary first and open details only when a decision needs them.

# R5 — Storage, sync, hosting and notifications: evidence report

**Research/access date:** 2026-10-02 UTC. **Assignment:** Stage A, Step 1, R5; all Step 5 alternatives, under Sections 3–4. Research only: no architecture selection, privacy/security audit, application changes, accounts or credentials. R4 owns detailed iOS capability verification.

## Decision-relevant summary

- **Documented; high confidence (D/H):** GitHub Free supports a separate private data repository and scoped tokens. Its API creates commits; ordinary deletion does not purge history. **I/H:** this is not a ready-made two-device sync system. GitHub Pages **cannot host from a private repository on Free**.[G1–G6,H1]
- **D/H:** Cloudflare Workers/KV/D1 have free-plan limits that stop operations rather than automatically purchase more capacity. KV is eventually consistent; D1 offers seven-day free point-in-time recovery. R2's free allowance belongs to a **metered subscription**, not a demonstrated hard-$0 plan.[C1–C8]
- **D/H:** Supabase Free can pause after a week of inactivity and lacks downloadable routine database backups. Firestore Spark remains a no-payment-method option, but Firebase **Cloud Storage now requires Blaze**, and managed Firestore backups/exports are not Spark features.[S1–S3,F1–F4]
- **D/H:** Supabase/Firebase anonymous sign-in creates provider-side **user accounts**, despite requiring no email/password. It does not literally satisfy “no accounts.” Public project API keys are not private access credentials.[S4–S5,F5–F6]
- **D/H; eligibility implication Inferred/moderate (I/M):** Supabase's terms prohibit HIPAA-defined PHI without a BAA; that is not equivalent to prohibiting all personal health information. Firebase's current terms acceptance states use is related to “trade, business, craft, or profession.” Compatibility with this strictly personal project is **not established**; neither encryption nor a free price resolves legal eligibility.[S6,F7]
- **D/H:** Cloudflare Pages supports private source, custom response headers and previews; previews are public by default. Free Access onboarding still requests payment details and introduces identity/OTP authentication.[H2–H6]
- **D/H:** Web Push permits a message without application data, but WebKit requires a visible notification. **I/H:** locked storage cannot provide a health-specific notification when its decryption key is unavailable. Empty payloads still reveal subscription and timing metadata. Calendar health exports are plaintext outside the app; iCloud Calendar is not end-to-end encrypted even with Advanced Data Protection.[N1–N5,M2]
- **I/H:** manual exchange and P2P are possible exchange mechanisms, not verified asynchronous, always-available sync/backup services. No reviewed provider supplies the required category-key pairing, revocation, conflict handling or recovery automatically. Stage C must choose using this evidence and R4—not treat provider encryption-at-rest as app E2EE.

## Conventions and boundary

**Documented (D)** = primary documentation/terms, not tested deployed behavior. **Reported (R)** = attributed observation; none needed for the principal findings. **Inferred (I)** = feasibility implication, not a demonstrated implementation. **H/M/L** = confidence in evidentiary support, not a safety certification. Paragraphs/rows labeled D/H apply that label to their factual claims; inference labels explicitly override it. All citations were accessed on the date above.

Step 5 permits serverless computation, not an always-on server we operate. Infrastructure accounts require approval; neither phone should need app-user registration. All options retain local encrypted data offline; remote storage cannot rescue unsynced data lost with a phone (**I/H**). “Control” means keys, exports and access—not ownership of cloud hardware.

## 1. Exchange and storage options

### 1. Encrypted manual exchange/backups

**D/H:** Apple documents AirDrop's nearby BLE discovery and direct peer-to-peer Wi-Fi transfer protected by TLS. No internet/AP is required for that nearby transfer. iCloud Drive's default protection gives Apple access to service encryption keys; Advanced Data Protection strengthens content protection, but some file metadata remains available to Apple.[M1–M2]

**I/H:** exporting **app-encrypted** files before sharing can meet the third-party ciphertext-only requirement without an app account. AirDrop/iCloud system identities are separate from app identities; iCloud requires an Apple Account. **D/H:** iCloud includes **5 GB free**, shared with other iCloud content; actual remaining backup capacity is not assumed.[M2] QR transfer has limited practical capacity and no intrinsic confidentiality merely because it is a QR code (**I/M**, not measured).

**I/H:** both phones can exchange encrypted edits manually, but simple “replace database from backup” is not evidence of safe two-writer sync. Exchanged files are portable if the format, schema and key-recovery information survive. Cloud/file services see names, sizes, timestamps and sharing identities; nearby observers may see discovery metadata. Remote availability of the **app** is independent of whether the latest exchanged data is available. No server guarantee, automatic backup frequency, remote wipe or forgotten-passphrase recovery is supplied.

### 2. Separate private GitHub data repository/API

**D/H:** GitHub Free allows unlimited private repositories. Fine-grained PATs select a resource owner, selected repositories and permissions; Contents read/write supports file access. Tokens have expiration options and can be deleted; unused tokens are removed after a year. GitHub account login must not be shared between people.[G1–G2,G6]

**D/H:** authenticated personal API usage normally allows **5,000 requests/hour**, shared with other activity; secondary limits include generally **80 content-generating requests/minute and 500/hour**. Contents API supports full functionality through **1 MB**, restricted modes for **1–100 MB**, no files above **100 MB**, and lists at most **1,000 directory entries**. Updates require the current file SHA; concurrent create/update and delete operations can conflict.[G3–G4]

**D/H:** ordinary Git blocks files over **100 MiB**; repositories ideally remain below **1 GB**, below **5 GB** strongly recommended—not a free backup quota promise. GitHub explicitly says Git is not designed as a backup tool. History removal is complicated; clones/caches/references can retain removed content. Account cancellation normally deletes repository content within 90 days, with backup/legal exceptions. Private repositories are confidential, not inaccessible to GitHub: documented access includes security, maintenance and legal requirements.[G5–G6]

**I/H:** browser PAT access avoids a phone login UI but still delegates an infrastructure account's authority; account/token arrangements require review and approval. PAT permissions are repository-wide, **not per health category/path**. Git/API exports are portable; historical ciphertext accumulates, and filenames, commit times, authors/emails, sizes and access patterns are visible. Git history is not a conflict-resolution or key-recovery mechanism. Never put even encrypted health data in the **code repository**, issues, Actions logs or deployment artifacts.

### 3. Cloudflare Workers plus KV, D1 or R2

**D/H:** Workers Free currently allows **100,000 dynamic requests/day**, **10 ms CPU per HTTP request or Cron invocation**, 128 MB memory and **five Cron Triggers/account**. Static-asset requests are free/unlimited. Developer account/deployment authority is required; native Worker bindings connect a Worker to its stores.[C1–C2]

| Store | Documented current limits/behavior (D/H) | Inferred implications (I/H unless noted) |
|---|---|---|
| **KV Free** | **1 GB**, 100,000 reads/day; **1,000 each writes, deletes and lists/day**; one write/second to the same key; 25 MiB/value. Free over-limit operations fail until reset. Updates, including newly created/deleted keys, may take **60 seconds or more** to propagate; not suitable for atomic read-modify-write.[C3] | Small encrypted exchange is capacity-plausible, not proven. Stale reads matter for consent changes and conflicts. Listing/reading supports export; no reviewed point-in-time backup promise. |
| **D1 Free** | **5 million rows read/day**, **100,000 written/day**, **5 GB total**, **10 databases**, **500 MB/database**, **2 MB maximum row/string/BLOB**. Limits stop queries/writes. Seven-day Time Travel; SQL import/export. Sessions support sequential consistency when using read replicas.[C4–C5] | SQL gives persistence and coordination primitives, not encrypted-content merge logic. Recovery history means row deletion is not immediate historical erasure. SQL exports are comparatively portable; app semantics still need migration tests. |
| **R2 Standard allowance** | **10 GB-month/month**, **1 million Class A** and **10 million Class B operations/month**; free direct egress. Checkout adds a monthly usage-billed subscription; excess is priced, and Infrequent Access has no free allowance. Strong consistency for objects/listing, but cached public objects can remain accessible after deletion; IAM changes may take about a minute. Bucket-scoped object read/write tokens are available.[C6–C7] | S3-compatible objects are portable. “Within free allowance” does **not** establish a hard-$0 guarantee; payment requirements and an enforceable no-charge configuration remain unverified. Public bucket/cache delivery is not appropriate evidence of private sync. |

**D/H:** Cloudflare terms permit suspension/termination or service modification, including without notice; free use is not indefinite retention or availability insurance.[C8] **I/H:** Cloudflare can receive ciphertext, opaque IDs, IPs, sizes, timestamps and access-control metadata. These stores do not provide accountless app-device authorization, category-key distribution or cryptographic revocation as a turnkey feature. Infrastructure/API credentials must not be embedded in public app assets.

### 4. Supabase or Firebase

**D/H — Supabase:** Free is **$0**, two active projects, **500 MB database**, **1 GB file storage**, **5 GB egress plus 5 GB cached egress**, 50,000 monthly active users and unlimited API requests. Low-activity projects may pause after seven days. Current upgrade documentation gives paused projects a **one-year restore window**—do not repeat older 90-day advice. Free users are advised to export off-site; database backups do not include Storage objects, and project deletion permanently removes associated data/backups.[S1–S3]

**D/H:** publishable keys are intended for browsers; secret/service-role keys bypass Row Level Security and must not be shipped. Anonymous sign-in creates an authenticated user who loses access after logout/storage clearing unless identity/recovery handling exists. Supabase terms assign backup responsibility to the customer and require a BAA for HIPAA-defined PHI.[S4–S6]

**I/H:** Postgres dumps plus separately exported encrypted objects offer good portability. RLS can restrict ciphertext rows, but is not category E2EE. Anonymous Auth is not literally accountless; a different authorization approach has not been demonstrated here. Free pausing is materially different from online-anywhere availability. Whether this personal ciphertext is HIPAA-defined PHI is not determined by this scout.

**D/H — Firebase:** Spark needs no payment method. Firestore offers one free database/project: **1 GiB stored**, **50,000 reads/day**, **20,000 writes/day**, **20,000 deletes/day**, **10 GiB outbound/month**; document maximum **1 MiB**. Daily Firestore quotas reset around midnight Pacific. The generic Spark plan page describes product shutdown for some monthly overages; apply product-specific rules, not a single universal reset assumption.[F1–F2]

**D/H:** Cloud Storage requires **Blaze now**, including existing default buckets. Managed Firestore export/import requires billing/Blaze; TTL deletes, PITR, backup/restore and clones have no free usage. Realtime Database alternatively lists **1 GB**, **10 GB downloads/month**, **100 simultaneous connections** on Spark. Functions are not available on Spark. Firebase API keys identify projects, not authorize users; Security Rules/IAM provide authorization. Anonymous Auth creates temporary accounts; optional Identity Platform cleanup can delete them after 30 days. Firestore web persistence is off by default, caches survive sessions, and same-document offline changes are **last-write-wins**.[F1–F6,F8]

**D/H:** both BaaS providers document direct REST APIs; vendor SDKs are not mandatory, important under the no-third-party-SDK rule.[S7,F9] **I/H:** client-level encrypted export can avoid paid managed export, but needs testing within read quotas. SDK caching/conflict defaults do not prove app-level encrypted-at-rest protection or preservation of both partners' edits. Google sees project/device IDs, paths, sizes and traffic timing. **D/H:** Firebase terms acceptance describes professional/business-related use; applicable GCP terms disclaim uninterrupted service.[F7] **I/M:** personal-use eligibility needs clarification before selecting it; no legal conclusion or account creation was attempted.

### 5–6. P2P and excluded options

**D/H:** WebRTC data channels use SCTP over DTLS. Peers must exchange signaling; manual signaling is possible. STUN discovers connectivity, while some NAT situations require TURN relay.[M3]

**I/H:** both phones must be reachable simultaneously for direct live transfer. It is not an asynchronous mailbox or independent recovery copy; R4 should determine iOS execution limits. Signaling/STUN/TURN expose connection IPs and timing, even with encrypted content. No verified free production TURN quota/account arrangement was obtained; attempted Cloudflare Realtime pages returned 403. Do not assume unlimited public STUN/TURN or reliable carrier-NAT traversal.

**Excluded:** home hosting conflicts with the explicit no-always-on-home-server constraint. **D/H:** CloudKit JS requires a CloudKit app/container and web API token, with documented user authentication and Apple's hosted JS; container registration uses Certificates, Identifiers & Profiles. Apple's membership comparison places that facility in paid membership; ordinary Developer Program enrollment is **US$99/year**.[M4] **I/H:** this excludes ordinary CloudKit JS setup under $0, independently of its other account/CDN conflicts. Web Push, in contrast, does **not** require paid Apple membership.[N2]

## 2. Required capabilities—not a proposed design

**I/H, derived from the constitution and provider evidence:**

- **Pairing/category sharing:** all transports can carry ciphertext/key envelopes; none establishes authenticated in-person pairing, default-off category keys or “see what partner sees.” Repository/store permissions are not proof that the partner lacks unshared decryption keys.
- **Pause/revoke/unpair:** providers can reject future requests or remove records/credentials, but cannot retract downloaded plaintext, keys, screenshots or offline copies. Rotation must protect **future** data; cached/history access is separately relevant. Either-device unpairing, local deletion and treatment of each person's couple entries remain explicit acceptance requirements, not provider guarantees.
- **Recovery/durability:** forgetting a passphrase is not repaired by restoring ciphertext or resetting a provider password. Phone loss, cleared storage and Home Screen deletion need separately recoverable ciphertext **and** usable key material. Backup frequency, generic backup reminders, restore tests and loss-window disclosure must be specified later using R4. No reviewed free tier replaces an independent backup.
- **Portability:** preserve format/schema/version and key-recovery documentation as well as data. Cloud SQL/object exports alone do not preserve sharing rules, migrations or device permissions.
- **Metadata/host integrity:** meaningful category names, health-derived schedules and logs can leak health information even when record bodies are encrypted. A compromised static host can change JavaScript; backend E2EE does not establish protection from malicious code served to an unlocked client. This is a documented-capability implication, **not an audit finding**.

## 3. Static hosting comparison

| Host | Current evidence and constraint implications |
|---|---|
| **GitHub Pages** | **D/H:** Free supports public source only; private source needs Pro/Team or higher. Privately published sites need enterprise arrangements. Site maximum 1 GB; soft 100 GB/month bandwidth and ten builds/hour. **I/M:** reviewed Pages documentation exposes no custom HTTP-header configuration or native protected-preview workflow; do not claim strict response-header CSP support. A meta CSP is not proof of all required headers.[H1] |
| **Cloudflare Pages** | **D/H:** private GitHub/GitLab source; Free **500 builds/month**, one concurrent build, 20-minute build timeout, **20,000 files**, **25 MiB/file**, unlimited active previews. `_headers` supports response security headers, max 100 rules/2,000 characters per line; it does **not** apply to Function responses. Previews are public by default; the preview Access toggle does not protect production `pages.dev` or custom domains. GitHub App access can be restricted to selected repositories.[H2–H5] |
| **Firebase Hosting** | **D/H:** Spark **10 GB storage**, **360 MB/day transfer**; custom response headers, public/private GitHub source through Actions, preview channels. Preview URLs are public and normally use real project resources. Integration creates a deploy service account/key in GitHub secrets. **I/H:** static hosting itself does not authorize encrypted-data access; no accountless private-site gate was demonstrated.[F1,H7–H9] |

**D/H:** Cloudflare Access has a free plan but onboarding requires payment details; default identity login or one-time PIN/IdP is documented. Current free seat count was not substantiated from the redirected pricing page.[H6] **I/H:** imposing Access on normal app use introduces external authentication, contrary to a literal no-accounts/sign-in experience. All these hosts distribute assets through provider infrastructure; later planning should distinguish the approved hosting origin from forbidden third-party asset/SDK CDNs. No custom domain purchase is assumed.

## 4. Notifications without our own always-on server

**D/H:** Cloudflare Cron is UTC-based and configuration changes can take up to 15 minutes; Free currently has five triggers and 10 ms CPU/invocation. GitHub Free offers **2,000 Actions minutes/month**, 500 MB artifact storage; scheduled jobs can be delayed/dropped, run on the default branch, and public-repository schedules disable after 60 days without activity. Firebase Functions require Blaze.[C1,N6–N7,F1]

**I/M:** a tiny free job sending to two endpoints is plausible, not measured; especially validate VAPID signing against Workers' CPU limit. No exact-delivery guarantee was established. Approval is needed for infrastructure accounts and push signing credentials; those are not health-data decryption keys.

| Option | Evidence and metadata/locked-storage implications |
|---|---|
| **Empty-payload Web Push** | **D/H:** Push API can deliver an event with null data; RFC 8030 requires TTL and permits service expiration of subscriptions/messages. WebKit requires `userVisibleOnly` and a visible notification or risks subscription revocation. iOS push uses Apple infrastructure without paid membership. VAPID identifies the sender by signing key and potentially contact details.[N1–N4] **I/H:** scheduler/push provider learn endpoint, sending/receipt patterns and TTL; health-derived send dates may reveal information even without payload. With no accessible storage key while locked, only a generic non-health reminder can be rendered; detailed content must await unlock. Empty pushes cannot be a silent health-specific background scheduler. |
| **Calendar `.ics`** | **D/H:** iCalendar specifies events, recurrence/time zones and VALARM; format privacy depends on the surrounding transport/service. iCloud Calendars are not E2EE.[N5,M2] **I/H:** exporting detailed predictions/medication reminders into a cloud calendar violates ciphertext-only third-party storage. Generic, non-health schedules reduce content exposure but still reveal timing; actual iPhone import/alarm behavior needs R4. Existing exports will not automatically reflect revocation, changed predictions or deletions. |
| **In-app reminders** | **I/H:** can be evaluated from decrypted data while the app is open/unlocked, without new reminder-service metadata. They provide no closed-app alarm guarantee. Locked views must remain generic; notifications and partner-derived reminders remain limited to currently shared categories. |

## 5. Handoff, method and completion evidence

**Recommendation to firstmate:** carry every option forward with these constraints, not a selected architecture. Stage B should cross-check the decision-changing current facts: Firebase Storage's Blaze requirement and personal-use terms wording; Supabase's one-year restore window; Cloudflare's five free Cron triggers/10 ms CPU; R2's metered subscription; and private-source/preview restrictions. Stage C should test feasible shortlists on synthetic data with R4, and only then produce the weighted matrix/ADR.

Startup command `printenv | sort | grep -E '^(PI_|.*MODEL|.*THINK)'` returned **`PI_PROVIDER=github-copilot`, `PI_MODEL=gpt-6.1-sol`, `PI_REASONING_LEVEL=high`**. Read the preserved planning prompt in full, R1/R2 for context only, and the completion skill. No subordinate workers were launched.

Research used Python 3 standard-library `urllib.request`, `concurrent.futures`, `re`, `html`; public requests only, typically `urlopen(Request(url, headers={'User-Agent':'Mozilla/5.0'}), timeout=25)`, followed by reading bodies and stripping scripts/styles/HTML. Main documentation, pricing and terms URLs cited below returned **HTTP 200**. Apple CloudKit's dynamic reference provided a public `.md` link, which was read completely. No browser interaction or authenticated GitHub operation was required. Several guessed/obsolete paths returned 404; some later Cloudflare API/Realtime/FAQ requests returned 403. These were not bypassed and do not support factual claims. No packages, real health data, deployments or credentials were used. No reviewed source edits or ship candidate.

**File anchors:** `/home/justi/firstmate/data/flo-planning/planning-prompt.md:16,52,66,189,250` defines scope/constraints. Final `git status --short` was empty. `FM_HOME=/home/justi/firstmate /home/justi/firstmate/bin/fm-captain-hold.sh complete flo-r5 --none` returned `complete: flo-r5 captain-call inventory reviewed`; `verify flo-r5` returned `verified: flo-r5 captain-call inventory`. No new human choice gates this evidence report; future provider/account/deployment approvals are already required by the prompt.

## Citations and verification locators

**Every URL below accessed 2026-10-02.** Primary documentation/terms only. Group IDs identify the relevant table/section, not independent corroboration. These citations preserve verification routes without a persistent copied website corpus.

### GitHub
- **G1:** https://docs.github.com/en/get-started/learning-about-github/githubs-plans — “GitHub Free for personal accounts,” private repositories/Actions/Pages.
- **G2:** https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens — token limitations, selected repositories, expiration, unused-token removal, deletion.
- **G3:** https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api — primary PAT limit and secondary content-generation limits.
- **G4:** https://docs.github.com/en/rest/repos/contents — file sizes/list ceiling; Contents permissions; update SHA; concurrent update/delete warning; author/committer fields.
- **G5:** https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github ; https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository — size recommendations, backup warning, retained clones/caches/history.
- **G6:** https://docs.github.com/en/site-policy/github-terms/github-terms-of-service — B (account sharing), E (private-repository access), H (API suspension), M (cancellation/deletion/backups), O (disclaimer).

### Cloudflare storage
- **C1:** https://developers.cloudflare.com/workers/platform/limits/ — account plan table, CPU time including Cron, free daily requests.
- **C2:** https://developers.cloudflare.com/workers/platform/pricing/ — default Free plan; static assets; binding/service context and paid subscription distinction.
- **C3:** https://developers.cloudflare.com/kv/platform/limits/ ; https://developers.cloudflare.com/kv/platform/pricing/ ; https://developers.cloudflare.com/kv/concepts/how-kv-works/ ; https://developers.cloudflare.com/kv/api/list-keys/ — quotas/reset/error behavior, cache/consistency, paginated metadata/key export primitives.
- **C4:** https://developers.cloudflare.com/d1/platform/limits/ ; https://developers.cloudflare.com/d1/platform/pricing/ — Free vs Paid table, per-row/account constraints, quota failures.
- **C5:** https://developers.cloudflare.com/d1/reference/time-travel/ ; https://developers.cloudflare.com/d1/best-practices/import-export-data/ ; https://developers.cloudflare.com/d1/best-practices/read-replication/ — **Free is seven days**, despite general 30-day introduction; SQL export; Sessions consistency.
- **C6:** https://developers.cloudflare.com/r2/pricing/ ; https://developers.cloudflare.com/r2/get-started/ — Standard-only allowance, priced excess, subscription checkout/monthly billing.
- **C7:** https://developers.cloudflare.com/r2/reference/consistency/ ; https://developers.cloudflare.com/r2/api/tokens/ — object consistency vs caches/IAM, bucket-scoped tokens and S3 endpoints.
- **C8:** https://www.cloudflare.com/terms/ — §8 termination/modification, §6 security limitations; no free persistence guarantee inferred.

### Supabase
- **S1:** https://supabase.com/pricing — Free quotas, two projects, one-week pausing; paid backup features.
- **S2:** https://supabase.com/docs/guides/platform/going-into-prod ; https://supabase.com/docs/guides/platform/upgrading — availability/Free backup download; “Time limits” says **one-year** paused-project restore window, followed by downloadable backup/Storage objects.
- **S3:** https://supabase.com/docs/guides/platform/backups — Free export recommendation; project deletion; Storage excluded from database backups; `pg_dump`/CLI logical dumps.
- **S4:** https://supabase.com/docs/guides/api/api-keys — publishable vs secret/service-role, RLS bypass; legacy anon/service-role key deprecation announced for end of 2026.
- **S5:** https://supabase.com/docs/guides/auth/auth-anonymous — anonymous **user creation**, authenticated role, lost session access.
- **S6:** https://supabase.com/terms — §8 customer-data/backup/PHI responsibilities; service suspension and disclaimers. HIPAA-defined PHI qualification is preserved, not generalized to all health data.
- **S7:** https://supabase.com/docs/guides/api — browser-accessible PostgREST REST API.

### Firebase
- **F1:** https://firebase.google.com/pricing — Spark payment-free, Firestore, Realtime Database, Hosting, Functions and Storage tables.
- **F2:** https://firebase.google.com/docs/firestore/quotas ; https://firebase.google.com/docs/projects/billing/firebase-pricing-plans — free database/daily limits, document maximum, non-free backup/PITR/TTL; Spark overage behavior and billing distinction.
- **F3:** https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024 — present requirement for Blaze to access **all** Cloud Storage buckets, including legacy defaults; Spark 402/403 outcomes.
- **F4:** https://firebase.google.com/docs/firestore/manage-data/export-import — “Before you begin,” billing/Blaze and Cloud Storage requirements; export/import charging.
- **F5:** https://firebase.google.com/docs/auth/web/anonymous-auth — temporary anonymous accounts and optional 30-day automatic cleanup.
- **F6:** https://firebase.google.com/docs/projects/api-keys — identification versus authorization; Security Rules/IAM/App Check; public key handling.
- **F7:** https://firebase.google.com/terms ; https://cloud.google.com/terms/ — current acceptance paragraph (“trade, business, craft, or profession”), product-specific terms mapping including GCP terms; GCP §11 disclaimer; no finding of personal-use eligibility.
- **F8:** https://firebase.google.com/docs/firestore/manage-data/enable-offline — web default, persistent-cache caution, last-write-wins.
- **F9:** https://firebase.google.com/docs/firestore/use-rest-api — direct REST access and user-token/Security Rules versus OAuth/IAM authorization.

### Hosting
- **H1:** https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages ; https://docs.github.com/en/get-started/learning-about-github/githubs-plans ; https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits — source-plan/private-site restrictions, size/bandwidth/build limits; no custom-header guarantee claimed.
- **H2:** https://developers.cloudflare.com/pages/get-started/git-integration/ — explicit public/private GitHub/GitLab support.
- **H3:** https://developers.cloudflare.com/pages/platform/limits/ — free builds, files, previews, headers and Function quota distinction.
- **H4:** https://developers.cloudflare.com/pages/configuration/headers/ — response security-header examples; Functions exception; rule/line ceilings.
- **H5:** https://developers.cloudflare.com/pages/configuration/preview-deployments/ ; https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/ — preview-public default/Access scope, repository-scoped installation permissions.
- **H6:** https://developers.cloudflare.com/cloudflare-one/setup/ — free onboarding still requests payment details; default Cloudflare identity and OTP/IdP options. Pricing URL https://www.cloudflare.com/plans/zero-trust-services/ returned a Cloudflare One-oriented page without a substantiated free seat number.
- **H7:** https://firebase.google.com/docs/hosting/full-config — custom headers and deployment config.
- **H8:** https://firebase.google.com/docs/hosting/test-preview-deploy — public URLs, shared real resources, preview workflow.
- **H9:** https://firebase.google.com/docs/hosting/github-integration — explicit public/private source; automatic service-account/key creation in GitHub secrets.

### Notifications
- **N1:** https://www.w3.org/TR/push-api/ — §10.2 PushEvent: absent data initializes null; §10.3 receiving a push message. Current document also includes declarative push; this report does not infer iOS rollout from the standard.
- **N2:** https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ — Home Screen permission, Apple push infrastructure, no paid Developer Program requirement; https://webkit.org/blog/12945/meet-web-push/ — user-visible promise and revocation for violations.
- **N3:** https://www.rfc-editor.org/rfc/rfc8030 — §5.2 TTL, subscription/message expiration and HTTP push metadata.
- **N4:** https://www.rfc-editor.org/rfc/rfc8292 — VAPID identification/signing key/contact and restricted subscriptions.
- **N5:** https://www.rfc-editor.org/rfc/rfc5545 — VALARM, DTSTART/TZID/recurrence, §7 security considerations; CLASS:PRIVATE is not cryptographic encryption.
- **N6:** https://developers.cloudflare.com/workers/configuration/cron-triggers/ — UTC schedule, propagation up to 15 minutes; limits cross-reference C1.
- **N7:** https://docs.github.com/en/actions/reference/limits ; https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule — 2,000 minutes/500 MB; schedule delays/drops/default branch/public inactivity disable.

### Manual exchange, P2P and CloudKit
- **M1:** https://support.apple.com/guide/security/airdrop-security-sec2261183f4/web — nearby discovery/direct Wi-Fi/TLS and identity hashes.
- **M2:** https://support.apple.com/en-us/102651 — standard vs Advanced Data Protection; Drive metadata; Contacts/Calendars lack E2EE; https://support.apple.com/en-us/108922 — 5 GB free storage shared with backups/photos/files; storage-full effects.
- **M3:** https://www.rfc-editor.org/rfc/rfc8831 — SCTP/DTLS confidentiality/integrity; https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity ; https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols — signaling alternatives, STUN/NAT/TURN. Failed, unused TURN evidence URLs: https://developers.cloudflare.com/realtime/turn/ ; https://developers.cloudflare.com/realtime/pricing/ ; https://developers.cloudflare.com/realtime/turn/generate-credentials/ (403).
- **M4:** https://developer.apple.com/documentation/cloudkitjs.md — existing CloudKit app/container, web-services API token, authentication, hosted JS; https://developer.apple.com/documentation/cloudkit/obtaining-an-api-token-for-an-icloud-container.md — console token/origin/user sign-in setup; https://developer.apple.com/help/account/identifiers/create-an-icloud-container — registration facility; https://developer.apple.com/support/compare-memberships/ — Certificates, Identifiers & Profiles membership comparison; https://developer.apple.com/programs/enroll/ — US$99 per membership year, limited fee-waiver eligibility.
