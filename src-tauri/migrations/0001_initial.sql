-- Oniric 0.1: project settings and the screenplay, one row per scene (architecture, 6.3 and 6.4).
-- Never modify this file once published: add 0002_….sql instead.

CREATE TABLE project_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE scene (
  id TEXT PRIMARY KEY,
  rank TEXT NOT NULL,
  number TEXT,
  number_locked INTEGER NOT NULL DEFAULT 0 CHECK (number_locked IN (0, 1)),
  heading_int_ext TEXT,
  heading_location TEXT,
  heading_time TEXT,
  content TEXT NOT NULL CHECK (json_valid(content)),
  summary TEXT NOT NULL DEFAULT '',
  color TEXT,
  length_eighths INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE INDEX scene_rank ON scene (rank) WHERE deleted_at IS NULL;

CREATE TABLE oniric_journal (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  label TEXT NOT NULL,
  tables TEXT NOT NULL
) STRICT;
