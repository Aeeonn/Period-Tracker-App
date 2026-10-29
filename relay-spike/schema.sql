-- P0 relay spike schema (preview D1 "flo-preview"). Synthetic data only.
-- No IP, user-agent, location or precise wall-clock columns: nonce expiry is a coarse
-- minute bucket and the rate limit uses a 10-minute window index.

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nonces (
  device_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_bucket INTEGER NOT NULL,
  PRIMARY KEY (device_id, nonce)
);

CREATE INDEX IF NOT EXISTS nonces_expiry ON nonces (expires_bucket);

CREATE TABLE IF NOT EXISTS rate_limits (
  name TEXT NOT NULL,
  win INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (name, win)
);
