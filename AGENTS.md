# Flo — guide for coding agents

Read this file before working on Flo, then read:

1. [docs/status.md](docs/status.md) — where the project is and what to do next.
2. [docs/decisions.md](docs/decisions.md) — the owner's decisions, preferences and approvals, in plain language.

These three files are the working instructions. The earlier Firstmate/Pi/Herdr orchestration (captain, crewmates, briefs, slots, status files, routing rules) is **retired** ([ADR-0015](docs/adr/0015-normal-agentic-development.md)). Old records remain only as history; do not follow their procedures.

## What Flo is

A private, local-first cycle-tracking PWA for one couple: the cycle owner and her partner, each on an iPhone. Health data lives on the device, encrypted with the user's passphrase. Partner sharing is opt-in per category and end-to-end encrypted; a small Cloudflare relay only moves ciphertext.

| Need                                                | Read                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Overview, scope, constitution                       | [docs/plan/plan.md](docs/plan/plan.md)                                                                   |
| Modules and contracts                               | [docs/plan/architecture.md](docs/plan/architecture.md), `src/contracts/`                                 |
| Prediction engine, dates, warnings                  | [docs/plan/algorithms-spec.md](docs/plan/algorithms-spec.md) and the `cycle-math` skill                  |
| Privacy, consent, crypto, network                   | [docs/plan/security-privacy.md](docs/plan/security-privacy.md)                                           |
| Screens and copy                                    | [docs/plan/ux-spec.md](docs/plan/ux-spec.md)                                                             |
| Phases and exit criteria                            | [docs/plan/roadmap.md](docs/plan/roadmap.md)                                                             |
| Acceptance criteria for a planned item              | [docs/plan/task-briefs.md](docs/plan/task-briefs.md) — search for `### <item-id>`, e.g. `### p2-pairing` |
| Test catalogue, phase gates, iPhone smoke checklist | [docs/plan/test-strategy.md](docs/plan/test-strategy.md)                                                 |
| Architecture decisions                              | [docs/adr/](docs/adr/README.md)                                                                          |
| Deploy records                                      | [docs/deploy/](docs/deploy/)                                                                             |

In `task-briefs.md` and `backlog.md`, use the goals, owned areas, interfaces and acceptance criteria. Ignore their process fields (route, model, effort, brief/record paths, slots, “first mate”, “captain hold”).

## Environment

- The repository lives in WSL Ubuntu-24.04 at `/home/justi/code/flo` (Windows: `\\wsl.localhost\Ubuntu-24.04\home\justi\code\flo`). Run `node`, `npm` and `git` **inside WSL**; Windows npm cannot resolve the tools on the UNC path.
- From PowerShell, run single commands like this: `wsl.exe --cd '\\wsl.localhost\Ubuntu-24.04\home\justi\code\flo' -- bash -lic 'npm run check'`.
- For multi-line scripts, pipe a single-quoted here-string and `cd` first, because WSL shells may start in another directory:
  `@'` … `'@ | wsl.exe -- bash -lc "tr -d '\r' | bash -l -s"`.
  Inline `wsl bash -lc "..."` mangles `$`, quotes and `;`. Keep piped scripts ASCII (PowerShell 5 pipes ASCII to native programs). Give commands that read stdin (for example `cmd.exe`) `</dev/null` inside a piped script.
- Files created from Windows tools on `\\wsl.localhost` paths can get CRLF line endings. Normalise new files (`sed -i 's/\r$//' <file>` or Prettier) before committing; scripts otherwise fail with `bash\r`.
- Node 24. Dependencies are exactly pinned in `package-lock.json`. If `npm ls --depth=0` reports missing or invalid packages, restore with `npm ci --ignore-scripts`; never add or upgrade a package to fix it.
- Browser tests use Playwright **WebKit** with iPhone SE and iPhone 13 emulation. Chromium is not installed for Playwright; Windows has Edge. Emulation is not real-iPhone proof.
- Run related Playwright specs in **one** process. Parallel Playwright processes share and clear `test-results/`.

## Commands

| Command                                                | Use                                                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                          | Local app in **unlocked development mode**: no passphrase or recovery code, separate synthetic-only database ([README](README.md)) |
| `npm run dev:secured`                                  | Local app with the real lock                                                                                                       |
| `npx vitest run <path or filter>`                      | Targeted unit tests while working                                                                                                  |
| `npx playwright test <spec> --workers=1`               | Targeted browser tests                                                                                                             |
| `npm run build`                                        | Production build (also generates security headers); run before `check` so the size gate runs instead of skipping                   |
| `npm run check`                                        | Typecheck, lint, format, dependency/licence, secrets, synthetic-data, copy and size gates, and all unit tests                      |
| `npm run e2e`                                          | Build plus every Playwright spec (phase-level; slow)                                                                               |
| `npm run test:tz`, `npm run backtest`, `npm run bench` | Time-zone matrix, engine backtest, benchmarks (phase-level, or when touching the engine)                                           |

## How to work

1. **Understand.** Read `docs/status.md`, `docs/decisions.md`, the relevant spec sections and the item's acceptance criteria. If a product question is not answered there, ask the owner instead of guessing.
2. **Branch.** In the primary checkout, create a short-lived branch from `main`: `git switch -c <type>/<short-name> main`. Keep one focused change per branch. Leave old `fm/*` branches and `~/.treehouse` worktrees alone; they are history.
3. **Build with tests.** Add deterministic tests for behaviour and edge cases, using synthetic data only. Run targeted tests while working.
4. **Check.** Before merging, run `npm run build && npm run check` and the Playwright specs for the affected area. Report exactly what ran; never claim a check you did not run.
5. **Review sensitive changes.** See below.
6. **Commit.** Use Conventional Commits (`feat(scope): …`, `fix`, `test`, `docs`, `refactor`, `chore`). Make one or a few coherent commits. Add the `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer when an agent wrote the change.
7. **Merge.** Rebase on `main` if it moved and rerun the tests. Then `git switch main && git merge --ff-only <branch>` and delete the merged branch.
8. **Push.** The owner has given standing approval to push `main` after each verified merge:
   - confirm `git remote get-url Period-Tracker-App` is `git@github.com:Aeeonn/Period-Tracker-App.git` (the remote is **not** called `origin`);
   - `git fetch Period-Tracker-App` and confirm `Period-Tracker-App/main` is an ancestor of local `main`;
   - `git push Period-Tracker-App main`.
     Push only `main`. Never force-push, delete remote refs, or rewrite pushed history.
9. **Record.** Update `docs/status.md`. For milestones or decisions, also update [docs/progress.md](docs/progress.md). Record new owner decisions in `docs/decisions.md`. Add an ADR when architecture, a contract, or a security property changes.

## Sensitive changes and review

Sensitive areas are: the prediction and medical engine (`src/engine`), crypto and keys, the lock, pairing and sync merge, sharing and consent enforcement, migrations, backup/restore/export/import, delete-all, CSP and network policy, and medical or educational content.

For changes in these areas, decide per change whether an independent review is warranted. The default is **yes** for anything beyond a trivial edit. Launch one review subagent (the [`flo-reviewer`](.github/agents/flo-reviewer.agent.md) agent, or a general code-review agent). Give it the diff range, the spec sections and the acceptance criteria. It follows the [`sensitive-change-review`](.agents/skills/sensitive-change-review/SKILL.md) skill.

Fix correctness, security, data-loss and spec defects before merging. Put nits in `docs/status.md` as follow-ups. After a fix, re-review only the fix. Other changes need tests and a careful self-review.

## Ask the owner first

- Installing, adding or upgrading any dependency or tool.
- Accounts, credentials, tokens, billing, DNS or Cloudflare settings.
- Production deployment, real health data, or anything in the P6 launch.
- Destructive or irreversible actions, such as deleting unmerged work, resetting or cleaning worktrees, rewriting pushed history, or wiping stores.
- Product decisions not covered by the spec or `docs/decisions.md`, and starting a new phase (the owner reviews a demo first).

You may run **synthetic-only preview deployments** from merged `main` without asking. Use `tools/deploy/pages-preview.sh app --branch <alias>`, always with an explicit non-`main` alias, because `main` is the production branch of the Pages project. Record each deployment in `docs/deploy/`.

## Engineering standards

- Use strict TypeScript, Preact, Vite, IndexedDB and Web Crypto. Prefer small typed modules and explicit contracts in `src/contracts/`.
- Keep dependencies minimal, exactly pinned and licence-checked.
- Store health dates as `LocalDate` calendar values and use the date engine. Never convert them to timestamps or introduce UTC/DST arithmetic.
- Keep the engine pure, deterministic and versioned (`cycle-math` skill).

## Privacy, consent and safety

- **Synthetic data only.** Never put real health or identifying data in source, tests, fixtures, logs, screenshots, issues or examples.
- Sharing is off by default and controlled category by category. Preserve pause, revoke, preview and unpair semantics. Desire, mood and patterns are never consent ([security-privacy.md §2](docs/plan/security-privacy.md#2-consent-and-privacy-rules-testable)).
- Health data that leaves the device stays end-to-end encrypted with keys held by the users. Add no analytics, telemetry, third-party assets, hosted fonts or unapproved network endpoints (`tools/allowed-endpoints.json`).
- Medical content is informational, not diagnosis or contraception advice. Never call a day safe or a chance zero. Show uncertainty and cite sources; Canadian guidance is preferred.
- Use original wording, assets and implementation. Do not copy Flo (the commercial app) content, branding or proprietary methods, and do not claim parity or validated clinical accuracy.
- Never read, print or copy `~/.config/flo-deploy/cloudflare.env`; the deploy script loads it. Keep secrets out of the repository.
- Do not read or modify `~/.pi/agent/auth.json`, run any `pi` login or logout, or try to work around the company's Conditional Access block. Do not change the “no-pq-tls” block in `~/.bashrc`.

## Definition of done

- The acceptance criteria are met, with real evidence.
- Behaviour is covered by deterministic tests using synthetic data.
- `npm run build && npm run check` and the affected Playwright specs pass.
- A sensitive change has had its review, and blocking findings are fixed.
- `main` is merged, pushed and verified, and `docs/status.md` is current.
- The final report states what ran and what did not. It implies no phone, medical, privacy or security proof that was not shown.

## History

Firstmate-era briefs and verification reports are kept outside the repository in `~/firstmate/data/<task-id>/`, which is local to this machine. [docs/plan/backlog.md](docs/plan/backlog.md) is a frozen item list and history; [docs/plan/agent-operating-model.md](docs/plan/agent-operating-model.md) describes the retired process. Use them for reference only.
