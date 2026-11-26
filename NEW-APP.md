# Flo Lite: the new app

This branch (`rewrite/flo-lite`) is where Flo is being rebuilt as a smaller, personal app. When the new app works on both phones, it replaces `main`. Until then, `main` keeps the current app, which serves as a reference for the code and specs that are being reused.

## What the app is for

Flo Lite is a private app for one couple, used on two iPhones:

1. **Improving their sex life together.** She logs her desire, comfort and satisfaction, and when they had sex. Over time, the app shows how these change across her cycle, so they can both understand her rhythm and plan around it.
2. **Tracking her period.** She logs her periods and symptoms, and the app predicts her next period and her cycle phase.
3. **A partner view on his phone.** He sees what she chooses to share: when her period is expected, her current phase, and the logs she shares.

**Ground rule:** desire, mood and pattern information are never consent. The app describes tendencies; it never tells either of them what she wants on a given day. Its wording must not push for sex or treat a pattern as an expectation.

## Why rebuild

The current app grew far beyond a personal tracker. It was planned as a general, security-first product: about 18,000 lines of app code, more than 100 test files and about 10,000 lines of planning docs. Most of that effort went into:

- a passphrase lock with Face ID, recovery codes, auto-lock and a separate unlocked development mode;
- multi-device key exchange, signing and key rotation for sharing;
- a Cloudflare relay with a device registry, signed requests and web push;
- data fields and modes they don't use (temperature, ovulation tests, pills and medication, pregnancy, postpartum, perimenopause, weight, stress, test logs);
- ten database upgrade versions, a background prediction worker, a complex offline and update system;
- custom check gates, a backtest, benchmarks, a time-zone test matrix and a retired agent workflow.

All of this slowed down the parts they actually want. A focused app of about 4,000–5,000 lines can do everything they need. There is no real data in the current app yet, so no data migration is needed.

## Decisions

| Topic                      | Decision                                                                                                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Partner view               | Built in the first version. It's half the point of the app.                                                                                                                                                                                                                   |
| Lock and passphrase        | Left out for now. Data on her phone is protected by the iPhone's own lock. All data access goes through one file (`storage.ts`), so a lock or local encryption can be added later without changing the screens.                                                               |
| Shared data                | Encrypted on her phone before it's uploaded, from the first version (confirmed 2026-11-25). The server only ever stores data it can't read.                                                                                                                                   |
| Contraception              | Hormonal IUD (confirmed 2026-11-25). The app hides the fertility estimate on both phones. Hormonal IUDs often make periods lighter, irregular or absent, so period predictions must show their uncertainty and handle long gaps. She can still change the method in Settings. |
| Who can change shared data | Only her phone. His pairing code lets him read; it can't upload, change or delete anything.                                                                                                                                                                                   |
| Fields kept                | Flow, pain, discharge, symptoms, energy, mood, desire, sex (comfort and satisfaction), sleep, activity, alcohol, water and private notes.                                                                                                                                     |
| Fields removed             | Weight, stress, the tests log, STI tests, temperature, ovulation tests, pill and medication tracking, and the pregnancy, postpartum and perimenopause modes.                                                                                                                  |
| Notes                      | Never shared.                                                                                                                                                                                                                                                                 |
| Existing data              | None, so the new database starts at version 1.                                                                                                                                                                                                                                |

## How sharing works

When she turns on sharing, her phone creates three random values:

| Value     | Kept on                       | Purpose                                   |
| --------- | ----------------------------- | ----------------------------------------- |
| Couple ID | Both phones and the server    | Finds their shared snapshot on the server |
| Read key  | Both phones, never the server | Encrypts and decrypts what she shares     |
| Write key | Her phone only                | Proves an upload or delete came from her  |

1. **Pairing.** Her phone registers the couple ID with the server, along with a hash of the write key. It then shows a pairing code containing only the couple ID and the read key. She sends it by AirDrop or Messages, and he pastes it into his app.
2. **Updates.** A few seconds after she changes something, her phone builds a snapshot of the categories she shares, encrypts it with the read key and uploads it with the write key. Each new snapshot replaces the previous one.
3. **His view.** His app downloads the snapshot when it opens, when he comes back to it and when he taps Refresh. It shows when her next period is expected, her cycle day and phase, a "higher" or "lower" fertility estimate only when her contraception allows it (not with her hormonal IUD), and about six months of shared logs.
4. **Her controls.** An on/off switch per category (all off at first), a one-tap pause, "see what he sees", and unpair. Unpairing deletes the data from the server and erases the keys from her phone.

The server is one small Cloudflare Worker with one D1 table: couple ID, encrypted snapshot, write-key hash and last-updated time.

## What the app shows

- **Today:** a cycle ring with her current day and phase, and the days until her next period.
- **Calendar:** past periods and logged days, plus predicted periods.
- **Log:** a quick, tap-to-select editor. Sex and desire come first.
- **Patterns:** simple summaries by cycle phase of her desire, satisfaction, comfort, mood, energy and sleep. Each shows how many days it's based on, and says "not enough data yet" when there are too few.
- **Partner:** his view, as described above.
- **Settings:** cycle and period length, contraception method, sharing controls, and export and import.
- **A few information cards:** period pain, heavy bleeding, and "this app is not birth control", with Canadian sources.

Medical content is informational only. The app never calls a day safe or a chance zero.

## What was built (2026-11-25)

The first version is on this branch. The old app's code, plans and gates were removed here; they remain on `main` and in Git history.

- **Reused:** the `LocalDate` date code, the visual style tokens, the period and fertile-window logic (trimmed into a much smaller engine), the heavy-bleeding warning and the wording and sources of a few information cards.
- **New:** a single IndexedDB database (version 1), the log, calendar, patterns, settings, share and partner screens, the sharing code and the relay Worker.
- **Packages:** Preact and `idb` for the app; Vite, TypeScript, Vitest, Playwright (WebKit), ESLint, Prettier, `fake-indexeddb` and `wrangler` for development. The QR, signals, coverage, property-testing and DOM-emulation packages were removed.

```
src/
  lib/date.ts    LocalDate calendar dates
  data/          types.ts, storage.ts (the only file that reads or writes data)
  engine/        episodes.ts, index.ts (predictions and warnings), patterns.ts
  share/         crypto.ts, snapshot.ts, relay-client.ts, sync.ts
  ui/            app.tsx, components.tsx, labels.ts, content.ts, styles.css, screens/
relay/           the Cloudflare Worker, its D1 schema and wrangler.toml
public/sw.js     basic offline cache
```

## Testing

- unit tests for dates, the engine, patterns, storage, building and filtering the shared snapshot, share encryption, and the server rejecting uploads or deletes without her write key;
- Playwright tests on WebKit iPhone SE and iPhone 13: set up, log a period and reload; and a two-phone flow that pairs, shares one category, checks notes and unshared categories stay hidden, pauses and stops sharing;
- `npm run check` runs only the type check, lint, format check and unit tests.

Tests use made-up data only.

## Replacing `main`

When the new app is ready and checked on both phones:

1. Merge or fast-forward `rewrite/flo-lite` into `main`. The old app stays in Git history, and a tag such as `flo-v1-final` marks its last commit.
2. Deploy from `main` as usual.

## Open questions

None right now. Her IUD type (hormonal) and encrypted sharing were confirmed on 2026-11-25.
