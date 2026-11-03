-- Oniric 3.0 « Produire » : l'équipe, le dépouillement, le plan de travail, les feuilles de service, et les étapes 6 à 9
-- de l'Atelier. Never modify this file once published: add 0006_….sql instead.

-- A person of the project. Taken from the address book of the computer, it is a copy, so that the project stays
-- whole on another computer (specification, RG-04).
CREATE TABLE contact (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- phone, email, address, language, trades, agent, regime, diet, allergies, emergency, notes, photo, documents, ssn, iban
  data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  -- The card of the address book it was copied from.
  book_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- A post in the crew: a contact in a department [EQU-02].
CREATE TABLE crew_member (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contact (id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  role TEXT NOT NULL,
  head INTEGER NOT NULL DEFAULT 0 CHECK (head IN (0, 1)),
  rank TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  rate TEXT NOT NULL DEFAULT '',
  contract TEXT NOT NULL DEFAULT 'none' CHECK (contract IN ('none', 'sent', 'signed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX crew_member_contact ON crew_member (contact_id);

-- A part, by the name of the character as the scenes give it, and who plays it [EQU-05].
CREATE TABLE cast_role (
  id TEXT PRIMARY KEY,
  character TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'supporting' CHECK (kind IN ('lead', 'supporting', 'bit', 'extra', 'double', 'stunt')),
  -- The number on the strips; empty: after the numbered ones, by the number of scenes.
  number INTEGER,
  contact_id TEXT REFERENCES contact (id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- The people seen for a part [EQU-06].
CREATE TABLE casting_candidate (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES cast_role (id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contact (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'audition', 'shortlist', 'chosen', 'declined')),
  audition_at TEXT,
  -- The audition, in medias/.
  video TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (role_id, contact_id)
) STRICT;

-- The days a person can't come, both ends included [EQU-07].
CREATE TABLE unavailability (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contact (id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX unavailability_contact ON unavailability (contact_id);

-- What the scenes need, by category [DEP-01, DEP-02]; the bible entry it is, when there is one [DEP-05].
CREATE TABLE breakdown_element (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  entry_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX breakdown_element_category ON breakdown_element (category, name);

CREATE TABLE breakdown_item (
  scene_id TEXT NOT NULL REFERENCES scene (id) ON DELETE CASCADE,
  element_id TEXT NOT NULL REFERENCES breakdown_element (id) ON DELETE CASCADE,
  quantity INTEGER,
  PRIMARY KEY (scene_id, element_id)
) STRICT;

CREATE INDEX breakdown_item_element ON breakdown_item (element_id);

-- The breakdown of a scene: the text it was checked on [DEP-07] and the suggestions turned down [DEP-04].
CREATE TABLE breakdown_scene (
  scene_id TEXT PRIMARY KEY REFERENCES scene (id) ON DELETE CASCADE,
  checked_text TEXT,
  rejected TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(rejected)),
  updated_at TEXT NOT NULL
) STRICT;

-- A shooting schedule; several can be kept side by side, « beau temps » and « pluie » [PDT-05].
CREATE TABLE schedule (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rank TEXT NOT NULL,
  start_date TEXT,
  -- The days of the week worked, 1 for Monday to 7 for Sunday.
  week TEXT NOT NULL DEFAULT '[1,2,3,4,5]' CHECK (json_valid(week)),
  -- A day of work, and the time a page takes when its shots don't say, in minutes.
  day_minutes INTEGER NOT NULL DEFAULT 600,
  page_minutes INTEGER NOT NULL DEFAULT 90,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE shoot_day (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedule (id) ON DELETE CASCADE,
  rank TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'shoot' CHECK (kind IN ('shoot', 'off', 'travel')),
  -- A date set by hand; empty: the next day worked after the day before.
  date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX shoot_day_schedule ON shoot_day (schedule_id, rank);

-- A scene placed in a day, or a banner across the board [PDT-01, PDT-02].
CREATE TABLE strip (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL REFERENCES shoot_day (id) ON DELETE CASCADE,
  rank TEXT NOT NULL,
  scene_id TEXT REFERENCES scene (id) ON DELETE CASCADE,
  banner TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((scene_id IS NULL) <> (banner IS NULL))
) STRICT;

CREATE INDEX strip_day ON strip (day_id, rank);
CREATE INDEX strip_scene ON strip (scene_id);

-- The calendar of the production, around the shooting days [PDT-06].
CREATE TABLE production_event (
  id TEXT PRIMARY KEY,
  phase TEXT NOT NULL CHECK (phase IN ('prep', 'tests', 'shoot', 'edit', 'delivery', 'other')),
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- The call sheet of a shooting day [FDS-01, FDS-02], the versions sent [FDS-07] and the report of the day [FDS-08].
CREATE TABLE call_sheet (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL UNIQUE REFERENCES shoot_day (id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  -- [{"n", "at", "data"}], the last one sent last.
  versions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(versions)),
  report TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(report)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- Who gets the sheet, at what time, and whether it was sent and confirmed, ticked by hand [FDS-03, FDS-06].
CREATE TABLE call_recipient (
  sheet_id TEXT NOT NULL REFERENCES call_sheet (id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contact (id) ON DELETE CASCADE,
  call_time TEXT NOT NULL DEFAULT '',
  sent INTEGER NOT NULL DEFAULT 0 CHECK (sent IN (0, 1)),
  confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0, 1)),
  PRIMARY KEY (sheet_id, contact_id)
) STRICT;

-- The lists of steps 6 to 9 of the workshop: rewriting passes, readers and their remarks, deposits, submissions,
-- rewriting requests. A remark belongs to its reader.
CREATE TABLE workshop_item (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('pass', 'reader', 'remark', 'deposit', 'submission', 'request')),
  parent_id TEXT REFERENCES workshop_item (id) ON DELETE CASCADE,
  rank TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX workshop_item_kind ON workshop_item (kind, rank);
