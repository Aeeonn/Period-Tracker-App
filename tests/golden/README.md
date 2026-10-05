# Golden vectors

This directory contains the synthetic A0 date fixture and its golden-vector tests.
`npm run test:golden` runs those tests. Do not invent algorithm expectations here: future vectors must be
transcribed from the approved algorithm specification and independently derived by the algorithm
auditor before implementation review.

Synthetic fixture provenance uses a `synthetic: true` header (for example, a leading comment in a
TypeScript fixture or a top-level JSON field). Never place real health or identifying data here.

Crypto known-answer and behavior tests live separately under `tests/crypto` and run with
`npm run test:crypto`. A successful empty `--passWithNoTests` run is wiring evidence only, not test
coverage. `backtest` invokes the planned `tsx tools/backtest/index.ts` entry and intentionally fails
until that feature-owned implementation exists rather than reporting a false pass.

`check:size` enforces the architecture budgets when a `dist/` build exists: at most 120 KiB gzip
across JavaScript assets and at most 1.5 MiB total output. With no application entry point or build
output in this toolchain task, it reports that the measurement is deferred rather than claiming a
bundle passed. A production build and device measurements remain future work.
