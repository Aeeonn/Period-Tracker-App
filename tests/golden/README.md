# Golden vectors

This directory has no vectors or tests yet. Do not invent algorithm expectations here: future
vectors must be transcribed from the approved algorithm specification and independently derived by
the algorithm auditor before implementation review.

Synthetic fixture provenance uses a `synthetic: true` header (for example, a leading comment in a
TypeScript fixture or a top-level JSON field). Never place real health or identifying data here.

The current `test` and `test:golden` scripts use Vitest's documented pass-with-no-tests mode. A
successful empty run is wiring evidence only; it is not application, algorithm, privacy, consent, or
security coverage. Test-strategy §1 suite commands are wired to their intended runners: Vitest commands
select `tests/<suite>`, `test:tz` repeats the suite over the five configured time zones, `bench` uses
Vitest bench mode, and `e2e:shots` selects the `@shots` tag. Their tests do not exist yet. `backtest`
invokes the planned `tsx tools/backtest/index.ts` entry and intentionally fails until that feature-owned
implementation exists rather than reporting a false pass.

`check:size` enforces the architecture budgets when a `dist/` build exists: at most 120 KiB gzip
across JavaScript assets and at most 1.5 MiB total output. With no application entry point or build
output in this toolchain task, it reports that the measurement is deferred rather than claiming a
bundle passed. A production build and device measurements remain future work.
