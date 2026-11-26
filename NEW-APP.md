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
3. **His view.** His app downloads the snapshot when it opens and when he pulls to refresh. It shows when her next period is expected, her cycle day and phase, a "higher" or "lower" fertility estimate only when her contraception allows it (not with her hormonal IUD), and about six months of shared logs.
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

## Reused from the current app

- the prediction engine in `src/engine/` and its tests, trimmed to period days plus contraception method;
- date handling in `src/lib/localdate/`;
- the calendar logic, the Today cycle ring, the tap-to-select log editor and the visual style in `src/ui/tokens.ts`;
- `src/crypto/envelope/aes-gcm.ts`, for encrypting the shared snapshot;
- the heavy-bleeding warning (W-01) and a few information cards with their sources.

**Tools and packages:** Preact, Vite, TypeScript and `idb` for the app; Vitest, Playwright (WebKit), ESLint and Prettier for checks; `wrangler` for the server. All are already pinned in this repo. `jsqr` and `qrcode-generator` are dropped.

## Planned structure

```
src/
  lib/date/      LocalDate (copied)
  engine/        prediction engine (copied, trimmed)
  data/          db.ts (schema v1), storage.ts (the only file that reads or writes data)
  share/         snapshot.ts, crypto.ts, relay-client.ts
  ui/            today/, calendar/, log/, patterns/, partner/, settings/, tokens.ts
  sw.ts          basic offline cache
relay/           the Cloudflare Worker and its table
```

## Build order

1. **Setup:** project skeleton, home-screen install support, offline cache and test setup.
2. **Logging:** storage, the log editor (sex and desire first) and the calendar.
3. **Predictions:** the trimmed engine, the Today screen and the settings screen.
4. **Patterns:** desire, satisfaction and comfort by cycle phase, then the other fields.
5. **Export and import:** a plain JSON file, clearly marked as sensitive.
6. **Partner sharing:** the server, pairing, her controls and his partner screen.
7. **Preview and real use:** a preview with fake data, a check on both iPhones, then real use once approved.

**Later, if they decide:** a passphrase or Face ID lock, encrypting the data stored on her phone, push notifications, and more intimacy content.

## Testing

- the engine and date tests copied from the current app;
- unit tests for storage, building and filtering the shared snapshot, share encryption, and the server rejecting uploads or deletes without her write key;
- about five Playwright tests: log a day, see the prediction, pair the phones, pause sharing and unpair;
- a check command that runs only the type check, lint and unit tests.

Tests use made-up data only.

## Replacing `main`

When the new app is ready and checked on both phones:

1. Merge or fast-forward `rewrite/flo-lite` into `main`. The old app stays in Git history, and a tag such as `flo-v1-final` marks its last commit.
2. Deploy from `main` as usual.

## Open questions

None right now. Her IUD type (hormonal) and encrypted sharing were confirmed on 2026-11-25.
