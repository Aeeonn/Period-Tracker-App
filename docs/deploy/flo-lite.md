# Flo Lite live deployments

Live app: https://flo-lite.pages.dev (Pages project `flo-lite`, production branch `main` of that project).
Relay: https://flo-lite-relay.my-app123.workers.dev (Worker `flo-lite-relay`, D1 `flo-lite`, id `bdfa53fd-bafd-4177-a245-19828c0c2e43`, `ALLOWED_ORIGINS=https://flo-lite.pages.dev`).

Add a row for each deployment. Live checks use synthetic data in fresh browser contexts only.

| Date       | What                          | From commit (branch `rewrite/flo-lite`) | Checks                                                                                                                                                                                                                                       |
| ---------- | ----------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-25 | Created D1, relay and project | —                                       | Schema applied (2 tables); relay deployed with the D1 binding and the app origin.                                                                                                                                                            |
| 2026-11-25 | First app deploy              | ea47c62                                 | CSP header includes the relay origin. Live two-context WebKit (iPhone 13) run: set up, log, pair, share Sex, notes hidden, pause, stop. D1 afterwards: 0 couples, 0 snapshots. Offline shell cached by the service worker. |
| 2026-11-25 | Install guidance, Patterns empty state | 664cc5b                        | Production alias took about 30 s to switch. Live two-context run passed with no console errors (the only failed request is the expected 404 after stop sharing). D1 afterwards: 0 couples, 0 snapshots. |
