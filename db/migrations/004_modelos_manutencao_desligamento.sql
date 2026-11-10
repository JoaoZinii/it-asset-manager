-- v5: cargo/gestor, catálogo de modelos com foto, registro de manutenção e de desligamento. Pode rodar mais de uma vez.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title    TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_name TEXT;

-- Catálogo de modelos: a foto do modelo vale para todos os equipamentos daquela marca/modelo
CREATE TABLE IF NOT EXISTS asset_models (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand      TEXT        NOT NULL,
  model      TEXT        NOT NULL,
  type       asset_type  NOT NULL DEFAULT 'notebook',
  photo_url  TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_models_key ON asset_models (lower(brand), lower(model));

-- Registro de manutenção (um equipamento só pode ter UMA manutenção aberta)
CREATE TABLE IF NOT EXISTS maintenances (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id   INTEGER     NOT NULL REFERENCES assets(id),
  opened_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at  TIMESTAMPTZ,
  reason     TEXT        NOT NULL,
  supplier   TEXT,
  ticket     TEXT,
  notes      TEXT,
  resolution TEXT,
  CONSTRAINT maintenances_closed_after_opened CHECK (closed_at IS NULL OR closed_at >= opened_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenances_open_asset ON maintenances (asset_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_maintenances_asset ON maintenances (asset_id);

-- Registro de desligamentos (um colaborador só pode ter UM desligamento aberto)
CREATE TABLE IF NOT EXISTS offboardings (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id INTEGER     NOT NULL REFERENCES employees(id),
  leave_date  DATE,
  ticket      TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_offboardings_open_employee ON offboardings (employee_id) WHERE closed_at IS NULL;
