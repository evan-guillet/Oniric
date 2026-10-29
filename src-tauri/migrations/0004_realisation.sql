-- Réalisation: moodboards, the shot list of each scene and its storyboard frames.
-- Never modify this file once published: add 0005_….sql instead.

CREATE TABLE moodboard (
  id TEXT PRIMARY KEY,
  rank TEXT NOT NULL,
  name TEXT NOT NULL,
  -- general, character, location, sequence, light, costume, color, other
  kind TEXT NOT NULL DEFAULT 'general',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE moodboard_item (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES moodboard (id) ON DELETE CASCADE,
  -- image, color, text, note
  kind TEXT NOT NULL CHECK (kind IN ('image', 'color', 'text', 'note')),
  x REAL NOT NULL,
  y REAL NOT NULL,
  w REAL NOT NULL,
  h REAL NOT NULL,
  z INTEGER NOT NULL DEFAULT 0,
  -- image: {"path"}; color: {"color"}; text and note: {"text"}
  data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX moodboard_item_board ON moodboard_item (board_id);

-- A board shown on a scene or a bible entry; the target is either, by its id.
CREATE TABLE moodboard_link (
  board_id TEXT NOT NULL REFERENCES moodboard (id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  PRIMARY KEY (board_id, target_id)
) STRICT;

CREATE INDEX moodboard_link_target ON moodboard_link (target_id);

CREATE TABLE shot (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scene (id) ON DELETE CASCADE,
  -- Order in the edit, inside the scene.
  rank TEXT NOT NULL,
  -- Order of shooting inside the scene, from 1; empty: the order of the edit.
  shoot_order INTEGER,
  size TEXT,
  angle TEXT,
  movement TEXT,
  support TEXT,
  sound TEXT,
  lens TEXT NOT NULL DEFAULT '',
  camera TEXT NOT NULL DEFAULT '',
  frame_rate TEXT NOT NULL DEFAULT '',
  characters TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(characters)),
  action TEXT NOT NULL DEFAULT '',
  dialogue TEXT NOT NULL DEFAULT '',
  -- Estimated length on screen, in seconds.
  duration INTEGER,
  -- Estimated time to shoot it, in minutes.
  setup INTEGER,
  lighting TEXT NOT NULL DEFAULT '',
  effects TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  -- The elements of the scene the shot covers, by their text.
  covers TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(covers)),
  -- The storyboard frame of the shot: its image in medias/, and notes.
  frame_image TEXT,
  frame_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX shot_scene ON shot (scene_id, rank);
