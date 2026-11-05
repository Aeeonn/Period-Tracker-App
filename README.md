# Period-Tracker-App

Flo is a private, local-first cycle-tracking web app for iPhone. **Contributors and coding agents: start with [AGENTS.md](AGENTS.md)**, then [docs/status.md](docs/status.md) and [docs/decisions.md](docs/decisions.md).

Use synthetic data only in development, tests and previews. A synthetic preview must be deployed with an explicit non-`main` alias: `tools/deploy/pages-preview.sh app --branch <alias>`. Without `--branch`, the script deploys to the Pages production branch.

## Unlocked development preview

`npm run dev` starts the explicitly named `unlocked-preview` mode. It keeps the encrypted record-store pipeline, but automatically creates and stores a random preview-only lock credential in this browser. The credential is not a security boundary: the preview has **no passphrase protection**. Use synthetic data only; never enter real health information.

The preview uses a separate `app-unlocked-preview` IndexedDB database and a separate browser-stored credential. It requires Web Locks, IndexedDB, and localStorage; if they are unavailable, it reports an error without resetting data. Stopping the preview or returning to secured mode does not modify the existing `app` database. Run `npm run dev:secured` to use the normal secured local development mode. A normal production build is secured unless it is explicitly opted in.

For an intentional Cloudflare Pages **Preview** build only, set `VITE_FLO_UNLOCKED_PREVIEW=true` in the environment that runs the build. With a Git-integrated Pages build, use the Pages Preview environment; with a direct upload, including the existing preview script, set it in the shell that builds the files. A Pages dashboard variable alone cannot change an already-built upload. Do not set it for Production. To turn the bypass off, remove the variable (or set it to `false`) and rebuild; locally, stop `npm run dev` and use `npm run dev:secured` instead.

Preview data and its browser credential remain on this origin when the bypass is turned off. Re-enabling the lock returns to the original secured `app` store; preview data is not copied into it. The existing explicit **Delete All** action attempts to remove origin-wide local data, including both the secured and preview stores, and reports any incomplete deletion.
