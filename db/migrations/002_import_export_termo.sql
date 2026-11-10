-- v3: campos da importação do inventário real. Pode ser executado mais de uma vez.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS site     TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS hostname TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS barcode  TEXT;
CREATE INDEX IF NOT EXISTS idx_assets_barcode ON assets (barcode);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS site TEXT;
ALTER TABLE employees ALTER COLUMN registration DROP NOT NULL;
ALTER TABLE employees ALTER COLUMN email DROP NOT NULL;

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_source_check') THEN
    ALTER TABLE assignments ADD CONSTRAINT assignments_source_check CHECK (source IN ('manual', 'importacao'));
  END IF;
END $$;
