-- v4: dados vindos do AD (sincronização de colaboradores). Pode ser executado mais de uma vez.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ad_login  TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS category  TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ad_status TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS end_date  DATE;
CREATE UNIQUE INDEX IF NOT EXISTS employees_ad_login_key ON employees (ad_login);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_ad_status_check') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_ad_status_check CHECK (ad_status IN ('ativo', 'desativando', 'inativo'));
  END IF;
END $$;
