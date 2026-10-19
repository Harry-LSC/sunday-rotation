-- Sunday Rotation edition-management schema (STAGED; not yet applied to D1).
-- Existing listeners, editions, edition_albums and journal_entries remain untouched.
CREATE TABLE IF NOT EXISTS catalog_albums (
  album_id TEXT PRIMARY KEY,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  release_year INTEGER,
  genre TEXT,
  duration_seconds INTEGER,
  cover_url TEXT,
  apple_url TEXT,
  spotify_url TEXT,
  youtube_url TEXT,
  tidal_url TEXT,
  tracklist_json TEXT NOT NULL DEFAULT '[]',
  metadata_source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rotation_editions (
  edition_id TEXT PRIMARY KEY,
  edition_number INTEGER NOT NULL UNIQUE,
  starts_on TEXT NOT NULL UNIQUE,
  ends_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','scheduled','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(ends_on >= starts_on)
);
CREATE TABLE IF NOT EXISTS rotation_slots (
  edition_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 11),
  album_id TEXT NOT NULL,
  genre_label TEXT,
  is_limelight INTEGER NOT NULL DEFAULT 0 CHECK(is_limelight IN (0,1)),
  listen_when TEXT,
  listen_for TEXT,
  why_here TEXT,
  editorial_note TEXT,
  PRIMARY KEY(edition_id,position),
  UNIQUE(edition_id,album_id),
  FOREIGN KEY(edition_id) REFERENCES rotation_editions(edition_id),
  FOREIGN KEY(album_id) REFERENCES catalog_albums(album_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_limelight_per_edition
 ON rotation_slots(edition_id) WHERE is_limelight = 1;
CREATE INDEX IF NOT EXISTS idx_rotation_schedule
 ON rotation_editions(status,starts_on,ends_on);
-- Publication must be validated in the admin Worker before status becomes scheduled:
-- Exactly ten regular slots 1..10; optional slot 11 with is_limelight=1.
-- Future editions remain private until Europe/Berlin Sunday local date reaches starts_on.
-- Existing edition 01 remains the live source until full migration is explicitly approved.
