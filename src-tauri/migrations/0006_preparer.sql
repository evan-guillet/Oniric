-- Oniric 4.0 : le budget, les repérages et les autorisations.
-- Never modify this file once published: add 0007_….sql instead.

-- A version of the budget: an estimate, a forecast, what was really spent [BUD-05].
CREATE TABLE budget (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'estimate' CHECK (kind IN ('estimate', 'forecast', 'actual')),
  rank TEXT NOT NULL,
  -- currency, rates of exchange, social regimes, contingency, overheads, insurance, completion bond
  settings TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- The grid: chapters hold posts, posts hold lines [BUD-01].
CREATE TABLE budget_line (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budget (id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES budget_line (id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('chapter', 'post', 'line')),
  -- The same line across the versions of the budget, to compare them; expenses are attached to it.
  origin TEXT NOT NULL,
  rank TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  -- code, quantity, unit, people, rate, currency, social regime, vat, notes, what it is linked to [BUD-02, BUD-03]
  data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX budget_line_budget ON budget_line (budget_id);
CREATE INDEX budget_line_parent ON budget_line (parent_id);

-- Money spent, whatever the version: it is attached to the line through its origin [BUD-06].
CREATE TABLE budget_expense (
  id TEXT PRIMARY KEY,
  origin TEXT,
  spent_on TEXT,
  supplier TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '',
  -- The scan or the photo of the receipt, in medias/.
  receipt TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX budget_expense_origin ON budget_expense (origin);

-- The financing plan [BUD-07].
CREATE TABLE funding_source (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'own',
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'asked' CHECK (status IN ('asked', 'granted', 'paid')),
  notes TEXT NOT NULL DEFAULT '',
  rank TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- A real place: a set, or what the shoot needs around it (the base, parking, catering, hospital, pharmacy) [REP-01].
CREATE TABLE real_location (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'set' CHECK (kind IN ('set', 'base', 'parking', 'catering', 'hospital', 'pharmacy')),
  status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'visited', 'kept', 'refused', 'booked')),
  name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  lat REAL,
  lon REAL,
  rank TEXT NOT NULL,
  -- type, owner, photos, plan, access, power, rental, scores, nearest hospital, capture of the map…
  data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- A set can play several places of the story, and the other way round [REP-02].
CREATE TABLE real_location_entry (
  location_id TEXT NOT NULL REFERENCES real_location (id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES bible_entry (id) ON DELETE CASCADE,
  PRIMARY KEY (location_id, entry_id)
) STRICT;

CREATE INDEX real_location_entry_entry ON real_location_entry (entry_id);

-- A scouting visit: when, who, what was seen [REP-06].
CREATE TABLE scouting_visit (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES real_location (id) ON DELETE CASCADE,
  visited_on TEXT,
  data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX scouting_visit_location ON scouting_visit (location_id);

-- A route already worked out: it stays readable without a connection [REP-04d].
CREATE TABLE map_route (
  from_id TEXT NOT NULL REFERENCES real_location (id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES real_location (id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('car', 'foot')),
  distance_m REAL NOT NULL,
  duration_s REAL NOT NULL,
  geometry TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(geometry)),
  computed_at TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, mode)
) STRICT;

-- A request for a shooting permit [AUT-01, AUT-02].
CREATE TABLE permit (
  id TEXT PRIMARY KEY,
  location_id TEXT REFERENCES real_location (id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'street',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'sent', 'review', 'granted', 'refused', 'expired')),
  authority TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  deadline TEXT,
  -- hours, contact, documents given, notes
  data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX permit_location ON permit (location_id);

-- Who agreed to be filmed [AUT-05].
CREATE TABLE image_release (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contact (id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'sent', 'signed')),
  signed_on TEXT,
  -- The signed copy, in medias/.
  document TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- An insurance or a certificate, for a set or a risky activity [AUT-06].
CREATE TABLE insurance (
  id TEXT PRIMARY KEY,
  location_id TEXT REFERENCES real_location (id) ON DELETE SET NULL,
  activity TEXT NOT NULL DEFAULT '',
  insurer TEXT NOT NULL DEFAULT '',
  policy TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  document TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- A letter or a contract made from a model, filled from the project, then free to edit [AUT-03].
CREATE TABLE legal_document (
  id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  location_id TEXT REFERENCES real_location (id) ON DELETE SET NULL,
  permit_id TEXT REFERENCES permit (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
