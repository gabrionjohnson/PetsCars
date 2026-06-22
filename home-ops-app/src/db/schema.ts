export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS home (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  address TEXT,
  year_built INTEGER,
  home_age_band TEXT NOT NULL,
  climate_zone TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  home_id INTEGER NOT NULL REFERENCES home(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  default_cadence TEXT NOT NULL,
  next_due_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'library',
  notification_id TEXT
);

CREATE TABLE IF NOT EXISTS task_completion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  note TEXT,
  photo_uri TEXT
);

CREATE TABLE IF NOT EXISTS appliance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  home_id INTEGER NOT NULL REFERENCES home(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  purchase_date TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS warranty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appliance_id INTEGER NOT NULL REFERENCES appliance(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  document_uri TEXT,
  last_alerted_at TEXT
);

CREATE TABLE IF NOT EXISTS document (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  home_id INTEGER NOT NULL REFERENCES home(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  uri TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recall_dataset_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_synced_at TEXT,
  version TEXT
);

CREATE TABLE IF NOT EXISTS recall_match (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appliance_id INTEGER NOT NULL REFERENCES appliance(id) ON DELETE CASCADE,
  recall_id TEXT NOT NULL,
  recall_title TEXT NOT NULL,
  recall_url TEXT NOT NULL,
  hazard TEXT NOT NULL,
  matched_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL,
  UNIQUE(appliance_id, recall_id)
);

CREATE INDEX IF NOT EXISTS idx_task_home ON task(home_id);
CREATE INDEX IF NOT EXISTS idx_task_completion_task ON task_completion(task_id);
CREATE INDEX IF NOT EXISTS idx_appliance_home ON appliance(home_id);
CREATE INDEX IF NOT EXISTS idx_warranty_appliance ON warranty(appliance_id);
CREATE INDEX IF NOT EXISTS idx_document_home ON document(home_id);
CREATE INDEX IF NOT EXISTS idx_recall_match_appliance ON recall_match(appliance_id);
`;
