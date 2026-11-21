-- A new single-instance database. Never apply to the old PostgreSQL system.
CREATE TABLE entity (id TEXT PRIMARY KEY, version INTEGER NOT NULL, token TEXT NOT NULL, summary TEXT NOT NULL);
CREATE TABLE chunk (entity_id TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE, part INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(entity_id, part));
