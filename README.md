# Flo Lite

A small, private period, sex and intimacy tracker for one couple, as an iPhone web app. She logs on her phone; he sees only what she chooses to share, end-to-end encrypted. See [NEW-APP.md](NEW-APP.md) for the reasoning and design, and [AGENTS.md](AGENTS.md) for how to work on it.

Use synthetic data only in development, tests and previews.

## Run it

```sh
npm ci --ignore-scripts
npm run dev        # http://localhost:5173
npm run check      # typecheck, lint, format check, unit tests
npm run e2e        # Playwright WebKit (iPhone SE and iPhone 13)
```

Sharing needs the relay. Without `VITE_RELAY_URL` the Share screen says sharing is not set up. To try it locally:

```sh
npm run relay:dev                                   # http://localhost:8787, allows http://localhost:5173 (needs a local D1, see below)
VITE_RELAY_URL=http://localhost:8787 npm run dev
```

## Live app

- App: **https://flo-lite.pages.dev** (Cloudflare Pages project `flo-lite`).
- Relay: https://flo-lite-relay.my-app123.workers.dev (Worker `flo-lite-relay`, D1 database `flo-lite`). It only accepts requests from the app's address.
- Deploy the app from a clean, committed tree with `tools/deploy/app.sh`, and the relay with `npm run relay:deploy` (both load `~/.config/flo-deploy/cloudflare.env` themselves). Record each deploy in [docs/deploy/flo-lite.md](docs/deploy/flo-lite.md).

### Getting started on the iPhones

1. **Her phone:** open the app address in Safari, tap Share → **Add to Home Screen**, then open Flo from the new icon and tap **Set up my tracker**. Set it up in the Home Screen app, not in a Safari tab: the two keep separate data.
2. In Flo, open **Share → Start sharing**, turn on what he may see, and tap **Copy code**. Send him the code privately.
3. **His phone:** add Flo to the Home Screen the same way, tap **Connect to her** and paste the code.
4. Her data lives only on her phone. Use **Settings → Export** now and then to keep a backup file.

## Relay setup

The relay is one Cloudflare Worker with one D1 table. It stores only the couple ID, a hash of her write key and the latest encrypted snapshot. It is already set up (see above); to recreate it:

1. Create a D1 database (`npx wrangler d1 create flo-lite`) and put its id in `relay/wrangler.toml` (`database_id`).
2. Apply the schema: `npx wrangler d1 execute flo-lite --remote --file relay/schema.sql --config relay/wrangler.toml`.
3. Set `ALLOWED_ORIGINS` in `relay/wrangler.toml` to the app's address(es).
4. Deploy with `npm run relay:deploy`, then build the app with `VITE_RELAY_URL=<worker URL>`.

For a local relay, run step 2 with `--local` instead of `--remote`.
