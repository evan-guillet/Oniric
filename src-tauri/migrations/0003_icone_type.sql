-- A custom entry type chooses its icon (a key of the app's icon set; empty: the plain sheet).
ALTER TABLE bible_type ADD COLUMN icon TEXT NOT NULL DEFAULT '';
