-- IT Asset Manager - esquema do banco (PostgreSQL 16)

CREATE TYPE asset_status AS ENUM ('disponivel', 'entregue', 'em_manutencao');
CREATE TYPE asset_type   AS ENUM ('notebook', 'desktop');

CREATE TABLE employees (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  registration TEXT        UNIQUE,           -- pode ser nulo (ex.: vindo de importação); NULLs não colidem no UNIQUE
  name         TEXT        NOT NULL,
  email        TEXT        UNIQUE,
  department   TEXT        NOT NULL,
  site         TEXT,
  ad_login     TEXT        UNIQUE,          -- login no AD (chave estável para sincronizar)
  category     TEXT,                        -- vínculo no AD: Employee, Temporary Work, Supplier...
  ad_status    TEXT        CHECK (ad_status IN ('ativo', 'desativando', 'inativo')),
  end_date     DATE,                        -- data de desligamento (quando conhecida)
  job_title    TEXT,                        -- cargo
  manager_name TEXT,                        -- gestor
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assets (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_tag   TEXT         NOT NULL UNIQUE,  -- patrimônio
  service_tag TEXT         NOT NULL UNIQUE,
  type        asset_type   NOT NULL,
  brand       TEXT         NOT NULL,
  model       TEXT         NOT NULL,
  status      asset_status NOT NULL DEFAULT 'disponivel',
  notes       TEXT,
  photo_url   TEXT,              -- URL (http/https/caminho) ou data URL da foto
  site        TEXT,              -- unidade onde o equipamento está
  hostname    TEXT,
  barcode     TEXT,              -- etiqueta com código de barras
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE assignments (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id       INTEGER     NOT NULL REFERENCES assets(id),
  employee_id    INTEGER     NOT NULL REFERENCES employees(id),
  delivered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at    TIMESTAMPTZ,
  delivery_notes TEXT,
  return_notes   TEXT,
  source         TEXT        NOT NULL DEFAULT 'manual',  -- 'importacao' = carga inicial (não conta como movimentação)
  CONSTRAINT assignments_source_check CHECK (source IN ('manual', 'importacao')),
  CONSTRAINT assignments_returned_after_delivered
    CHECK (returned_at IS NULL OR returned_at >= delivered_at)
);

-- Um equipamento só pode ter UM vínculo aberto (returned_at IS NULL) por vez.
CREATE UNIQUE INDEX uq_assignments_open_asset
  ON assignments (asset_id) WHERE returned_at IS NULL;

CREATE INDEX idx_assignments_employee ON assignments (employee_id);
CREATE INDEX idx_assets_status        ON assets (status);
CREATE INDEX idx_assets_barcode       ON assets (barcode);

-- Catálogo de modelos: a foto do modelo vale para todos os equipamentos daquela marca/modelo
CREATE TABLE asset_models (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand      TEXT        NOT NULL,
  model      TEXT        NOT NULL,
  type       asset_type  NOT NULL DEFAULT 'notebook',
  photo_url  TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_asset_models_key ON asset_models (lower(brand), lower(model));

-- Registro de manutenção (um equipamento só pode ter UMA manutenção aberta)
CREATE TABLE maintenances (
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
CREATE UNIQUE INDEX uq_maintenances_open_asset ON maintenances (asset_id) WHERE closed_at IS NULL;
CREATE INDEX idx_maintenances_asset ON maintenances (asset_id);

-- Registro de desligamentos (um colaborador só pode ter UM desligamento aberto)
CREATE TABLE offboardings (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id INTEGER     NOT NULL REFERENCES employees(id),
  leave_date  DATE,
  ticket      TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_offboardings_open_employee ON offboardings (employee_id) WHERE closed_at IS NULL;
