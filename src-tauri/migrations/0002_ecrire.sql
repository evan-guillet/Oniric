-- Oniric 0.5, lot 1 « Écrire »: story structure, scene cards, bible, workshop, documents, versions, notes.
-- Never modify this file once published: add 0003_….sql instead.

CREATE TABLE act (
  id TEXT PRIMARY KEY,
  rank TEXT NOT NULL,
  title TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE sequence (
  id TEXT PRIMARY KEY,
  act_id TEXT REFERENCES act (id) ON DELETE SET NULL,
  rank TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

ALTER TABLE scene ADD COLUMN sequence_id TEXT REFERENCES sequence (id) ON DELETE SET NULL;
ALTER TABLE scene ADD COLUMN status TEXT CHECK (status IN ('todo', 'draft', 'rewrite', 'done'));
ALTER TABLE scene ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags));
ALTER TABLE scene ADD COLUMN plotlines TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(plotlines));
ALTER TABLE scene ADD COLUMN story_time TEXT;

CREATE TABLE structure_beat (
  id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  key TEXT NOT NULL,
  rank TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (model, key)
) STRICT;

CREATE TABLE beat_scene (
  beat_id TEXT NOT NULL REFERENCES structure_beat (id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scene (id) ON DELETE CASCADE,
  PRIMARY KEY (beat_id, scene_id)
) STRICT;

CREATE TABLE workshop_field (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE workshop_field_version (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL CHECK (json_valid(value)),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX workshop_field_version_key ON workshop_field_version (key, created_at);

CREATE TABLE document (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL CHECK (json_valid(content)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE document_version (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL CHECK (json_valid(content)),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE bible_type (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  fields TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(fields)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE TABLE bible_entry (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases)),
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}' CHECK (json_valid(content)),
  fields TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(fields)),
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  links TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(links)),
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'validated', 'abandoned')),
  image TEXT,
  gallery TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(gallery)),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT
) STRICT;

CREATE INDEX bible_entry_type ON bible_entry (type, name) WHERE deleted_at IS NULL;

CREATE TABLE bible_entry_version (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES bible_entry (id) ON DELETE CASCADE,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE relation (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES bible_entry (id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES bible_entry (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  act_id TEXT REFERENCES act (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE note (
  id TEXT PRIMARY KEY,
  scene_id TEXT,
  quote TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE TABLE script_version (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  pages INTEGER NOT NULL,
  scenes INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
