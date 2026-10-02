# ADR-0001: Stack — strict TypeScript, Preact, Vite, IndexedDB, WebCrypto

- **Status:** Proposed (Stage C, 2026-10-02; reviewed in Stage D/E, unchanged)
- **Context:** The constitution requires a mainstream, typed, well-documented stack (rule 9), minimal dependencies (rule 3) and fast iPhone startup. The app is a Safari Home Screen PWA (R4).
- **Decision:**
  - TypeScript in strict mode.
  - Preact with `@preact/signals` for the UI, built with Vite.
  - IndexedDB through `idb` for storage.
  - WebCrypto only for cryptography.
  - A hand-written service worker.
  - Tests: Vitest, fast-check, Playwright WebKit and axe.
  - Runtime dependencies are limited to `preact`, `@preact/signals`, `idb`, a QR encoder and `jsqr` (details in [architecture.md §2](../plan/architecture.md#2-stack-and-why)).
- **Alternatives:**
  - React: well known, but about 40 KB larger.
  - Svelte: less mainstream.
  - Vanilla TypeScript: more custom code.
  - Workbox: adds complexity to update control.
- **Consequences:** The bundle stays small and contracts are typed. Preact's ecosystem is smaller than React's, but it is compatible with React patterns. Every runtime dependency added later needs an ADR and a security review.
