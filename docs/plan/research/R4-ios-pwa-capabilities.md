> **Provenance:** verbatim copy of the Stage A scout report `flo-r4/report.md` (Firstmate task `flo-r4`), copied into the plan on 2026-10-02 for Stage C. Content below this note is unchanged; all access dates and labels are the scout's. Downstream readers: read the summary first and open details only when a decision needs them.

# R4 — iPhone Safari / Home Screen PWA capabilities

**As of/access date: 2026-10-02 (UTC).** Research only, for two adult iPhone users of an offline health tracker with encrypted local storage, encrypted sync and owner-controlled sharing. No application code, architectural selection, security audit, accounts, payments or health data were involved.

## Decision-relevant summary (one page)

- **Documented · High:** Apple currently lists **iOS/iPadOS 27.0.1**, released September 28, 2026; WebKit published the shipped Safari 27.0 feature set on September 17. “Current Safari” must not mean Safari 18 or the Safari 26 beta. Neither user's installed version is known. [S1–S2]
- **Documented · High:** IndexedDB and OPFS are available. Since Safari/iOS 17, browser and standalone Home Screen storage quotas are **up to 60% of total disk per origin and 80% overall**, not reserved capacity. Best-effort storage can be evicted; `persist()` uses heuristics including Home Screen installation, not an unconditional installation guarantee. [S3–S4]
- **Documented · High:** The often-quoted “Safari deletes everything after seven days” omits important qualifications: seven days **of Safari use without interaction**, with Home Screen apps using their own counter. WebKit says first-party Home Screen data is not intended to be deleted by ITP. This is not protection against storage pressure, user deletion or bugs. [S3,S5]
- **Documented · High:** Home Screen Web Push shipped in iOS 16.4; declarative push shipped in 18.4. Apple Developer Program membership is unnecessary. Permission requires user interaction, and push must result in a visible notification; it is **not silent background sync or an offline alarm clock**. [S6–S9; final distinction Inferred · High]
- **Documented · High:** Passkeys shipped on iPhone in iOS 16; WebAuthn PRF shipped in Safari/iOS 18. PRF offers credential-associated symmetric key material, not automatic encryption or guaranteed compatibility with every authenticator. Cross-device and hardware-key limitations remain in public tracker evidence. [S10–S13,T1–T3]
- **Documented · High:** File sharing, downloads/file selection and OPFS are distinct capabilities. Web Share file support shipped in Safari 15; arbitrary JSON/encrypted-backup MIME types and destinations need actual testing. WebGPU shipped on iPhone in Safari 26, making “no iOS WebGPU” obsolete. [S4,S14–S17; testing need Inferred · High]
- **Documented · High:** Since iOS 26 every site added to Home Screen opens as a web app by default; users can disable that choice. Installation does not itself create offline functionality. Safari and the installed app do not continuously share their data stores. [S17–S19; offline distinction Inferred · High]
- **Reported · Medium:** Recent file-upload failures and older IndexedDB reliability reports make read-back, backup/restore, resume and actual two-iPhone validation essential. Safari 27 documents additional IndexedDB fixes, not universal immunity from data loss. No device behavior was independently reproduced in this research. [S2,T4–T6; validation need Inferred · High]

## 1. Evidence and version discipline

**Documented · High:** The current Apple release listing and the September Safari 27 release article establish shipping, whereas WWDC25's June Safari 26 article explicitly described a beta. A specification, an implementation commit, a Technology Preview, and a production iOS release are different evidence levels. [S1–S2,S20]

**Documented · High:** Useful shipped boundaries: OPFS began in iOS 15.2; `getFile()` followed in 15.4. File sharing: Safari 15. Passkeys: iOS 16. Home Screen push: 16.4. StorageManager persistence/estimate and revised quotas: 17. PRF: 18. Declarative push: 18.4. WebGPU, OPFS writable streams and revised Home Screen installation: 26. Safari 27 adds service-worker static routing. These boundaries do not promise identical behavior across phones, private browsing or authenticator providers. [S2–S4,S6–S7,S10–S11,S14,S17]

**Documented · High (standard, not shipping evidence):** WebAuthn Level 3 is now a W3C Recommendation dated August 25, 2026. Its PRF section specifies the API contract; WebKit's release notes establish Safari support independently. [S11,S13]

## 2. Storage, eviction and offline use

| Claim | Classification / confidence / evidence |
|---|---|
| Safari/iOS 17+ origin quota is up to 60% of total disk; browser-wide quota up to 80%. Standalone Home Screen apps receive the same quota policy. Non-browser embedded WebKit apps have 15%/20% limits; cross-origin frames receive about one-tenth of their main-frame origin quota. | **Documented · High** [S3] |
| Quota covers localStorage, IndexedDB, Cache API, service workers and File System storage together; cookies and ordinary HTTP cache are outside that particular policy. Quota exhaustion can throw `QuotaExceededError`. `estimate()` is approximate, may vary for anti-fingerprinting reasons, and is not a free-space reservation. | **Documented · High** [S3] |
| The percentage quotas are not a universal per-API allowance: MDN documents Web Storage's separate 5 MiB localStorage plus 5 MiB sessionStorage limits. | **Documented · Medium–High** [S28] |
| Eviction can follow overall quota exhaustion, system storage pressure or inactivity policy. WebKit normally evicts an origin's data together, using least-recently-used ordering influenced by interaction/storage operations. An active page or persistent mode can exclude an origin. | **Documented · High** [S3] |
| `persisted()` reports status; `persist()` requests persistence using WebKit heuristics such as Home Screen use. Installation alone is not documented as a promise of a `true` result or a backup guarantee. | First sentence **Documented · High**, second **Inferred · High** [S3] |
| ITP's inactivity cap applies after seven days of Safari use without site interaction, including IndexedDB and service-worker registrations/cache. Home Screen apps have independent use counters; WebKit states first-party deletion there is not intended. | **Documented · High** [S5] |
| OPFS is origin-private browser-managed storage, not a user-visible Files folder. Its lifetime follows other origin storage; iOS Settings can delete it. The 2022 article says Private Browsing did not support it then; that dated statement is not proof of the current private-mode matrix. | **Documented · High** [S4] |
| IndexedDB supplies structured storage; OPFS supplies file/directory handles and synchronous access in dedicated workers. Safari 26 adds writable streams. OPFS support does not imply Chrome-style arbitrary Files-directory access or `showSaveFilePicker()` support. | **Documented · High** [S4,S17]; picker distinction **Inferred · Medium**, supported by current MDN “Not widely supported in Safari” markup [S16] |

**Documented · High:** WebCrypto's `SubtleCrypto` supplies encryption/decryption and key-derivation operations in secure contexts and workers. **Inferred · High:** IndexedDB/OPFS do not automatically implement the requested application-level health-data encryption or lock; the application must use the cryptographic capability. [S4,S24]

**Inferred · High:** Encrypted databases and offline app-shell caches remain browser-controlled data. A successful persistence request reduces an eviction risk; it cannot establish recovery after deliberate deletion, uninstall/reinstall, phone loss or an implementation defect. Independent export/restore evidence is required before calling storage durable. Exact current uninstall, iOS device-backup and Safari-clear-data interactions were not established here. [S3–S5,T4–T6]

**Documented · High:** Adding an app to Home Screen in iOS 17.2 copies cookies once, but **“No other kind of local storage is copied over.”** After installation no other website data is shared. A database initialized in Safari is therefore not documented to become the installed app's database. [S19]

## 3. Notifications and background execution

**Documented · High:** iOS 16.4 Home Screen apps can request notification permission following a direct user gesture. Notifications appear on the Lock Screen, Notification Center and paired Apple Watch, and integrate with Focus. APNs handles delivery; Apple Developer Program membership is not required. Ordinary iPhone Safari tabs are not the documented push surface. [S6–S7]

**Documented · High:** Traditional Web Push requires `userVisibleOnly: true` and displaying a notification in response to push; violations can revoke the subscription. Declarative push in iOS 18.4 supplies visible fallback content without requiring a service worker; an existing worker may replace it. It still prohibits silent push. Its standardization work and shipped implementation should not be confused with universal browser support. [S7–S9]

**Documented · High (standard):** Service workers are event-driven, can be terminated when idle or exceeding execution limits, and are not permanent processes. `waitUntil()` is not a right to indefinite runtime. WebKit's Background Sync request remains NEW; Periodic Background Sync is WONTFIX with an explicit WebKit opposition statement. Current MDN also marks both unsupported broadly in Safari. [S21,T7–T8,S22–S23]

**Inferred · High:** Neither timers nor Home Screen installation establish continuous locked-screen execution, reliable closed-app sync or scheduled offline reminders. Push needs delivery from outside the phone; it is not a local future notification scheduler. A visible push can be an event-time work opportunity, not an always-running engine. No authoritative fixed “N seconds of background execution” guarantee was found. [S6–S9,S21,T7–T8]

**Inferred · High:** Under the requested lock behavior, if the decryption key exists only in an unlocked page, a newly started service worker cannot reconstruct private notification text from ciphertext. WebCrypto capability alone does not supply the missing key. Declarative generic fallback content is documented; access to health-specific content while locked remains a later design question, not something the platform solves automatically. [S9,S24]

## 4. WebAuthn, passkeys and PRF

**Documented · High:** Safari on iOS 16 supports passkeys. Apple's platform passkeys authorize use via Face ID/Touch ID, sync through end-to-end-encrypted iCloud Keychain, and depend on Apple Account/Keychain setup; registering without account two-factor authentication triggers setup. This is distinct from creating an application account. [S10,S12]

**Documented · High:** Safari 18 supports the WebAuthn `prf` extension. The standard maps inputs to credential-associated **32-byte outputs**, usable for symmetric encryption; some authenticators do not provide evaluation outputs during creation, requiring a later assertion. With CTAP `hmac-secret`, PRF uses the user-verified output. Returned material is available to the invoking JavaScript, not a generic non-exportable “Face ID encryption key.” [S11,S13 §10.1.4]

**Documented · High:** WebAuthn operates in secure contexts and binds credentials to a relying-party identifier/origin rules. Ordinary assertion signatures and PRF results are different outputs. **Inferred · High:** Face ID sign-in without obtaining suitable key material is not by itself encrypted-at-rest storage; passkey synchronization is not health-record synchronization. [S13,S24]

**Reported · Medium:** T1 describes PRF working with iCloud passkeys but failing in Safari's QR cross-device flow (Safari 18.x, including iOS 18 peers). The issue remains NEW; neither that status nor its original reproduction proves current Safari 27 failure. Its initial expansion of PRF as “Password Recovery Format” is erroneous; PRF means pseudo-random function. [T1,S13]

**Reported · Medium:** T2 describes incorrect hardware-key PRF outputs in Safari 26.4 and reports a successful fix/cross-browser round trip in **Technology Preview 241**. T3 reports `null` outputs for YubiKey C Bio on iOS 26.5 and a successful locally patched WebKit build in September. Both records remain NEW. **Gap:** production iOS 27 fix status was not established; a preview or local patch is not shipping evidence. [T2–T3]

**Gap:** Offline PRF unlock, stable outputs across iCloud restoration/provider changes, cancellation/passcode fallback, and Safari-versus-Home-Screen ceremonies require actual-device verification. No claim of demonstrated offline passkey recovery is made.

## 5. Sharing, export, GPU, installation and updates

**Documented · High:** Safari 15 shipped Web Share level 2 file sharing. `navigator.share()` invokes native sharing, requires transient user activation and appropriate policy; `canShare({files})` checks shareability. Supported destinations/types vary. The standard permits promise fulfillment after OS handoff, not proof of a durable backup at a chosen destination. [S14–S15,S25]

**Documented · High:** File inputs and download anchors are established file-exchange mechanisms described by WebKit; OPFS does not expose its contents directly to Files. **Inferred · High:** CSV, JSON and encrypted backup/import need separate tests for actual filenames/MIME types, Save to Files, AirDrop and restore. Arbitrary binary/JSON share success must not be inferred from PDF or image sharing. [S4,S14–S16,S25]

**Documented · High:** WebGPU shipped in Safari 26 on iOS, including compute shaders. WebKit names Transformers.js and ONNX Runtime among working frameworks. Safari 27 extends WGSL functionality and documents restored WebGPU limits. **Inferred · High:** This establishes a possible local-compute capability, not a particular model's memory budget, speed, thermal behavior or offline availability. No model benchmark was run. [S2,S17]

**Documented · High:** Apple's current installation instructions are Safari → Share → Add to Home Screen → Open as Web App → Add. iOS 26 defaults any added site to app mode, regardless of manifest; users can instead choose a browser bookmark. iOS does not support the `beforeinstallprompt` programmatic installation flow. [S17–S18,S26]

**Documented · High (standard):** Service-worker updates use installation, waiting and activation states; `skipWaiting()` can activate while clients still use the older worker. **Inferred · High:** Hosted code/cache updates and OS/Safari updates are distinct. Adding to Home Screen is not an App Store package or an assurance of precaching, offline first launch, synchronized code/schema versions or zero data loss. No fixed Home Screen manifest/icon refresh interval was established. [S17,S21]

## 6. Known bugs: impact and limits of evidence

| Evidence | What it actually establishes |
|---|---|
| Safari 27 storage fixes | **Documented · High:** fixed version-0 DB after initial upgrade abort, worker IndexedDB reconnection after network-process crash, and transactions blocked behind a background-suspended transaction. These are shipped release notes, not our reproductions. [S2] |
| Safari 26.6 service-worker fixes | **Documented · High:** missing main/imported scripts could prevent replacement registration; release notes say automatic unregistering was fixed. Relevant to offline boot/update recovery. [S27] |
| IndexedDB T4 / T5 | **Reported · Medium:** T4's iOS 17.4 connection loss was marked CONFIGURATION CHANGED with an engineer believing an OS fix was in 17.6/18 betas, but later reports disputed resolution. T5 reports read/write errors and mixed binary results on iOS 17.4/18.0.1 and remains NEW. Do not label these conclusively fixed—or reproduced on iOS 27. [T4–T5] |
| File uploads T6 | **Reported · Medium–High:** disk-backed/IndexedDB-restored Files can send zero-byte bodies; multiple reproductions/logs include iOS 26.5/26.6 and later macOS. Contributors report an in-memory Blob workaround. Engineers initially could not reproduce; subsequent comments show service-worker control is not necessary. August “iOS 27” reports predate its September release and cannot prove released 27.0.1 behavior. Still NEW as accessed. [T6] |
| PRF T1–T3 | **Reported · Medium:** provider/transport-specific failures, a preview fix and local-patch evidence; no blanket current production guarantee. |

## 7. Verification recommendations and research limitations

Recommendations, not architectural choices: record both phones' OS versions; test Safari and installed contexts separately; measure quota/persistence; test commit/read-back after backgrounding, force quit and reboot; verify offline restart and controlled updates; export synthetic CSV/JSON/encrypted files and restore; test notification permission/Focus/locked behavior and offline PRF determinism; benchmark any proposed local model. Treat error recovery and backup restoration as explicit acceptance evidence.

Research used existing curl/Python public HTTP retrieval and HTML parsing, not a live Safari/iPhone. Browser page-opening was already unavailable per brief. Google retrieval returned a JavaScript/interstitial shell; DuckDuckGo returned a challenge; neither was bypassed or used as factual evidence. MDN compatibility tables required JavaScript, so only accessible narrative/engine-status markup was used. A broad Web Share tracker search timed out; no conclusions depend on it. Public bug records demonstrate what others reported, not independent confirmation. No fix ready to ship in this project was reproduced. No unresolved owner/product decision is created by this report; downstream planners own any architectural choices.

### Reproducible research evidence

Runtime: `printenv | sort | grep '^PI_'` returned `PI_PROVIDER=github-copilot`, `PI_MODEL=gpt-6.1-sol`, `PI_REASONING_LEVEL=high`. `date -u` returned `2026-10-02T03:06:58Z`. The preserved planning prompt, not the older committed prompt, was read.

Representative commands:

```text
curl -L --max-time 30 -sS https://webkit.org/blog/14403/updates-to-storage-policy/
Python urllib.request.urlopen(Request(url, User-Agent=Mozilla/5.0), timeout=35)
rg -n -i 'PRF|IndexedDB|storage|Home Screen|WebGPU' <retrieved text>
```

The cited sources below returned HTTP 200. Durable anchors include S3 “up to 60%”/“up to 80%”; S19 “No other kind of local storage is copied over”; S11's Passkeys section; S2's Storage fixes (176195526, 177219395, 178769599); T2 comments 2–4; T4 comments 15, 19–22; T6 comments 1, 9, 13–19. Disposable extraction references: `.research/storage.txt:45–102`, `.research/safari172.txt:208–211`, `.research/safari18.txt:225–229`, `.research/safari27.txt:965–968`. Scratch files do not survive teardown; URLs, anchors and quoted evidence above do.

Completion policy was read in full. `FM_HOME=/home/justi/firstmate /home/justi/firstmate/bin/fm-captain-hold.sh complete flo-r4 --none` returned `complete: flo-r4 captain-call inventory reviewed`; `verify flo-r4` returned `verified: flo-r4 captain-call inventory`. There is no visual-review surface or unresolved owner decision.

## Citations

Each source was accessed **2026-10-02**; the explicit per-entry date below applies to every claim citing that ID. Source authority does not upgrade a contributor's reported observation to Documented behavior.

- **S1** Apple security releases: https://support.apple.com/en-us/100100 — accessed 2026-10-02.
- **S2** WebKit, Safari 27.0 shipped features: https://webkit.org/blog/18325/webkit-features-for-safari-27-0/ — accessed 2026-10-02.
- **S3** WebKit storage policy: https://webkit.org/blog/14403/updates-to-storage-policy/ — accessed 2026-10-02.
- **S4** WebKit OPFS: https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/ — accessed 2026-10-02.
- **S5** WebKit ITP and seven-day/Home Screen qualifications: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ — accessed 2026-10-02.
- **S6** WebKit iOS push announcement (beta context): https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ — accessed 2026-10-02.
- **S7** WebKit Safari 16.4 shipped features: https://webkit.org/blog/13966/webkit-features-in-safari-16-4/ — accessed 2026-10-02.
- **S8** WebKit push visibility requirement: https://webkit.org/blog/12945/meet-web-push/ — accessed 2026-10-02.
- **S9** WebKit declarative push: https://webkit.org/blog/16535/meet-declarative-web-push/ ; shipped iOS 18.4 confirmation: https://webkit.org/blog/16574/webkit-features-in-safari-18-4/ — both accessed 2026-10-02.
- **S10** WebKit Safari 16 passkeys: https://webkit.org/blog/13152/webkit-features-in-safari-16-0/ — accessed 2026-10-02.
- **S11** WebKit Safari 18 PRF: https://webkit.org/blog/15865/webkit-features-in-safari-18-0/#passkeys — accessed 2026-10-02.
- **S12** Apple passkey/Keychain security: https://support.apple.com/en-us/102195 — accessed 2026-10-02.
- **S13** W3C WebAuthn Level 3, especially §10.1.4 and RP-ID rules: https://www.w3.org/TR/webauthn-3/ — accessed 2026-10-02.
- **S14** WebKit Safari 15 file sharing: https://webkit.org/blog/11989/new-webkit-features-in-safari-15/ — accessed 2026-10-02. Correction to earlier announced 14.1 support: https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1/ — accessed 2026-10-02.
- **S15** MDN share/canShare: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share ; https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare — both accessed 2026-10-02.
- **S16** MDN save picker: https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker — accessed 2026-10-02.
- **S17** WebKit Safari 26 shipped features: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ — accessed 2026-10-02.
- **S18** Apple current Home Screen installation guide: https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios — accessed 2026-10-02.
- **S19** WebKit Safari 17.2 cookie-copy/data separation: https://webkit.org/blog/14787/webkit-features-in-safari-17-2/ — accessed 2026-10-02.
- **S20** WebKit Safari 26 beta announcement: https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/ — accessed 2026-10-02.
- **S21** W3C Service Workers, lifetime/update algorithms: https://www.w3.org/TR/service-workers/ — accessed 2026-10-02.
- **S22** MDN background sync: https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API — accessed 2026-10-02.
- **S23** MDN periodic sync: https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API — accessed 2026-10-02.
- **S24** MDN WebCrypto/SubtleCrypto: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto — accessed 2026-10-02.
- **S25** W3C Web Share, handoff semantics: https://www.w3.org/TR/web-share/ — accessed 2026-10-02.
- **S26** MDN installability/iOS prompt limitation: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable — accessed 2026-10-02.
- **S27** WebKit Safari 26.6 service-worker fixes: https://webkit.org/blog/18178/webkit-features-for-safari-26-6/ — accessed 2026-10-02.
- **S28** MDN quota/eviction details, including smaller Web Storage limits: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria — accessed 2026-10-02.
- **T1** PRF cross-device limitations (NEW): https://bugs.webkit.org/show_bug.cgi?id=284166 — accessed 2026-10-02.
- **T2** Hardware PRF outputs/TP241 observations (NEW): https://bugs.webkit.org/show_bug.cgi?id=311099 — accessed 2026-10-02.
- **T3** YubiKey Bio PRF/local patch (NEW): https://bugs.webkit.org/show_bug.cgi?id=314934 — accessed 2026-10-02.
- **T4** IndexedDB connection loss/disputed resolution: https://bugs.webkit.org/show_bug.cgi?id=273827 — accessed 2026-10-02.
- **T5** IndexedDB errors/binary-result reports (NEW): https://bugs.webkit.org/show_bug.cgi?id=282093 — accessed 2026-10-02.
- **T6** Zero-body File uploads (NEW): https://bugs.webkit.org/show_bug.cgi?id=319985 — accessed 2026-10-02.
- **T7** Background Sync request (NEW): https://bugs.webkit.org/show_bug.cgi?id=182565 — accessed 2026-10-02.
- **T8** Periodic Background Sync opposition (WONTFIX): https://bugs.webkit.org/show_bug.cgi?id=204117 — accessed 2026-10-02.
