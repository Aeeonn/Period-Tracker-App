# Flo Lite - guide for coding agents

Read this file before working on Flo, then read:

1. [NEW-APP.md](NEW-APP.md) - what the app is for, the decisions behind it and how sharing works.
2. [docs/status.md](docs/status.md) - where the project is and what to do next.
3. [docs/decisions.md](docs/decisions.md) - the owner's decisions and preferences.

## What Flo Lite is

A small, private cycle and intimacy tracker for one couple, each on an iPhone. She logs her period, sex, desire, body, mood and habits on her phone. He sees only the categories she chooses to share, through an end-to-end encrypted snapshot passed through a tiny Cloudflare Worker relay. There is no lock or passphrase for now; data on her phone is protected by the iPhone's own lock.

The original, much larger app lives on `main` and in Git history. It is reference only; do not bring its lock, key management, migrations, gates or planning process back without the owner asking.

## Layout

| Path                | What it holds                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `src/lib/date.ts`   | `LocalDate` calendar dates. Health dates never become timestamps.                           |
| `src/data/`         | Types and `storage.ts`, the only module that reads or writes IndexedDB.                      |
| `src/engine/`       | Pure prediction engine (episodes, cycles, period and fertile windows, warnings) and patterns. |
| `src/share/`        | Pairing keys, AES-GCM sealing, snapshot building, relay client and upload/refresh logic.     |
| `src/ui/`           | Preact app shell, components, labels, info-card content and one file per screen.            |
| `relay/`            | The Cloudflare Worker (`src/index.ts`), its D1 schema and `wrangler.toml`.                   |
| `public/`           | Service worker, manifest, icons and `_headers` (CSP).                                        |
| `tests/`            | Vitest unit tests; `tests/e2e/` holds the Playwright specs.                                  |

## Environment

- The repository lives in WSL Ubuntu-24.04 at `/home/justi/code/flo` (Windows: `\\wsl.localhost\Ubuntu-24.04\home\justi\code\flo`). Run `node`, `npm` and `git` **inside WSL**.
- From PowerShell, pipe a script: `@'` ... `'@ | wsl.exe -- bash -lc "tr -d '\r' | bash -l -s"`. Start it with `cd /home/justi/code/flo` and `. ~/.nvm/nvm.sh`. Keep piped scripts ASCII.
- Files created from Windows tools can get CRLF line endings; normalise them (`sed -i 's/\r$//' <file>` or Prettier) before committing.
- Node 24. Dependencies are exactly pinned in `package-lock.json`; restore with `npm ci --ignore-scripts`.
- Browser tests use Playwright **WebKit** with iPhone SE and iPhone 13 emulation. Emulation is not real-iPhone proof.

## Commands

| Command                          | Use                                                                    |
| -------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                    | Local app. Sharing is off unless `VITE_RELAY_URL` is set.              |
| `npm run build`                  | Production build into `dist/`.                                         |
| `npm run check`                  | Typecheck, lint, Prettier check and all unit tests.                    |
| `npx vitest run <path>`          | Targeted unit tests.                                                   |
| `npm run e2e`                    | Playwright (builds `dist-e2e/` with a fake relay URL, one worker).     |
| `npm run relay:dev`              | Run the relay locally with Wrangler.                                   |
| `tools/deploy/pages-preview.sh --branch <alias>` | Synthetic-data preview on Cloudflare Pages (never `main`). |

## How to work

- **Branch.** Work on `rewrite/flo-lite` until the owner decides to replace `main` with it (see NEW-APP.md). Commit there; do not push it or merge it into `main` without asking.
- **Tests.** Add deterministic tests for behaviour and edge cases, with synthetic data only. Before committing, run `npm run build && npm run check` and `npm run e2e` when the UI or sharing changed. Report exactly what ran.
- **Review.** For non-trivial changes to the engine, the share crypto/snapshot/sync code, the relay, storage import/export or delete-everything, or medical wording, ask one independent reviewer (the [`flo-reviewer`](.github/agents/flo-reviewer.agent.md) agent) to check the diff. Fix correctness, privacy and data-loss findings; list nits in `docs/status.md`.
- **Commits.** Conventional Commits (`feat(scope): ...`, `fix`, `test`, `docs`, `refactor`, `chore`), with the `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer when an agent wrote the change.
- **Record.** Keep `docs/status.md` current; add owner decisions to `docs/decisions.md`.

## Ask the owner first

- Adding or upgrading any dependency or tool.
- Cloudflare accounts, D1 databases, tokens, DNS, deploying the relay, or any production deployment.
- Real health data, or starting real use.
- Destructive actions on history or other branches (force-push, deleting branches, rewriting `main`).
- Product decisions not covered by NEW-APP.md or docs/decisions.md.

Synthetic-only Pages previews are allowed without asking; record them in `docs/deploy/`.

## Privacy and safety rules

- **Synthetic data only** in code, tests, fixtures, logs, screenshots and examples.
- Sharing starts off and is chosen category by category. Notes are never shared. Pause sends an empty snapshot; stopping deletes the relay copy. His phone can only read.
- Anything that leaves her phone is encrypted on the phone. Add no analytics, telemetry, third-party assets or new network endpoints.
- Desire, mood and patterns are never consent; wording must not push for sex.
- Medical content is informational. Never call a day safe or a chance zero; show uncertainty and cite sources (Canadian preferred).
- Never read, print or copy `~/.config/flo-deploy/cloudflare.env`; the deploy script loads it.
- Do not read or modify `~/.pi/agent/auth.json`, run any `pi` login or logout, or change the "no-pq-tls" block in `~/.bashrc`.
