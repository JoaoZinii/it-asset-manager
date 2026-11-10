-- Para bancos já criados antes da v2: adiciona a coluna de foto e ajusta datas do seed.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS photo_url TEXT;
