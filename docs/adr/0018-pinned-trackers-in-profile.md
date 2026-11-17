# ADR-0018: Pinned trackers are stored in the profile

- **Status:** Accepted (owner approved the "before real use" list, 2026-11-16).
- **Context:** The trackers she pins, hides and reorders were kept only in memory, so the choice reset every time the app was reopened. The profile is already the place for display preferences (units, week start, theme) and already carries one optional, additive field (`recentContentCards`).
- **Decision:**
  - **Contract (additive, `CONTRACTS_VERSION` stays 1, no schema bump).** `Profile` gains an optional `pinnedTrackers: readonly Tracker[]`, in her order. Absent means "not chosen yet" and the UI uses its default pins; an empty list is a real choice (every tracker hidden).
  - **Read.** The app keeps only known tracker names, once each, and never treats `heavy_detail` as a pin (it is edited inside Flow). Unknown names are ignored, so a later build that removes a tracker does not break an older profile.
  - **Write.** Each change is saved into the latest stored profile, one write after another. Settings now also applies its changes to the latest stored profile instead of its own in-memory copy, so pins and recently shown cards written by other screens are not overwritten.
  - **Export and import.** The field travels with the profile in portable files. Import accepts it only as a list of known tracker names with no repeats and rejects anything else; files without the field import as before.
- **Consequences:**
  - A build from before this change rejects a file that contains the field (its profile check allows only known keys). Only one build is in use, and newer builds read older files.
  - The preference is not health data and is never shared, but it is stored and exported with the rest of the encrypted profile.
  - Nothing a day stores is changed by pinning or hiding a tracker.
