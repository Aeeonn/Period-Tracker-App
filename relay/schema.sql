CREATE TABLE IF NOT EXISTS couples (
  id TEXT PRIMARY KEY,
  write_key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  couple_id TEXT PRIMARY KEY REFERENCES couples (id) ON DELETE CASCADE,
  iv TEXT NOT NULL,
  ct TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Reminder pushes. A phone's subscription and the times to wake it; the relay
-- never learns what a reminder is about.
CREATE TABLE IF NOT EXISTS push_devices (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  -- Set only on his phone, so her "period started" signal can reach it.
  couple_id TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS push_devices_couple ON push_devices (couple_id);

CREATE TABLE IF NOT EXISTS push_times (
  device_id TEXT NOT NULL REFERENCES push_devices (id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (device_id, at)
);

CREATE INDEX IF NOT EXISTS push_times_at ON push_times (at);
