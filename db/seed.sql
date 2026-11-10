-- Dados 100% fictícios. Contém inconsistências propositais para a auditoria:
--  * PAT-0009 está "entregue", mas sem vínculo aberto.
--  * PAT-0010 está "disponivel", mas com vínculo aberto (Elisa).

INSERT INTO employees (registration, name, email, department, active) VALUES
  ('E001', 'Ana Souza',       'ana.souza@exemplo.com.br',       'Tecnologia', TRUE),
  ('E002', 'Bruno Lima',      'bruno.lima@exemplo.com.br',      'Financeiro', TRUE),
  ('E003', 'Carla Mendes',    'carla.mendes@exemplo.com.br',    'RH',         TRUE),
  ('E004', 'Diego Alves',     'diego.alves@exemplo.com.br',     'Comercial',  TRUE),
  ('E005', 'Elisa Rocha',     'elisa.rocha@exemplo.com.br',     'Marketing',  TRUE),
  ('E006', 'Felipe Costa',    'felipe.costa@exemplo.com.br',    'Logística',  TRUE),
  ('E007', 'Gabriela Nunes',  'gabriela.nunes@exemplo.com.br',  'Jurídico',   TRUE),
  ('E008', 'Henrique Dias',   'henrique.dias@exemplo.com.br',   'Comercial',  FALSE);

INSERT INTO assets (asset_tag, service_tag, type, brand, model, status, notes) VALUES
  ('PAT-0001', 'ST7K2M91', 'notebook', 'Dell',   'Latitude 5420',    'entregue',      NULL),
  ('PAT-0002', 'ST3B8Q44', 'notebook', 'Lenovo', 'ThinkPad E14',     'entregue',      NULL),
  ('PAT-0003', 'ST9X1C27', 'notebook', 'HP',     'ProBook 440 G8',   'entregue',      NULL),
  ('PAT-0004', 'ST5D6N18', 'notebook', 'Dell',   'Latitude 3420',    'disponivel',    NULL),
  ('PAT-0005', 'ST2F4R73', 'notebook', 'Lenovo', 'IdeaPad 3',        'disponivel',    NULL),
  ('PAT-0006', 'ST8H0W56', 'notebook', 'Acer',   'TravelMate P2',    'em_manutencao', 'Tela com defeito'),
  ('PAT-0007', 'ST1J7T39', 'desktop',  'Dell',   'OptiPlex 3080',    'entregue',      NULL),
  ('PAT-0008', 'ST6L3V82', 'desktop',  'HP',     'EliteDesk 800 G6', 'disponivel',    NULL),
  ('PAT-0009', 'ST4P9Z15', 'notebook', 'Dell',   'Vostro 3510',      'entregue',      'Sem vínculo registrado'),
  ('PAT-0010', 'ST0M5Y60', 'notebook', 'Lenovo', 'ThinkBook 14',     'disponivel',    'Com vínculo aberto');

-- Vínculos abertos
INSERT INTO assignments (asset_id, employee_id, delivered_at, delivery_notes)
SELECT a.id, e.id, NOW() - v.ago, v.obs
FROM (VALUES
  ('PAT-0001', 'E001', INTERVAL '120 days', 'Entrega inicial'),
  ('PAT-0002', 'E002', INTERVAL '90 days',  NULL),
  ('PAT-0003', 'E003', INTERVAL '60 days',  NULL),
  ('PAT-0007', 'E004', INTERVAL '45 days',  'Estação de trabalho'),
  ('PAT-0010', 'E005', INTERVAL '10 days',  NULL)
) AS v(tag, reg, ago, obs)
JOIN assets a    ON a.asset_tag = v.tag
JOIN employees e ON e.registration = v.reg;

-- Histórico (vínculos já encerrados)
INSERT INTO assignments (asset_id, employee_id, delivered_at, returned_at, delivery_notes, return_notes)
SELECT a.id, e.id, NOW() - v.ini, NOW() - v.fim, NULL, v.obs
FROM (VALUES
  ('PAT-0006', 'E006', INTERVAL '200 days', INTERVAL '150 days', 'Devolvido com defeito na tela'),
  ('PAT-0004', 'E007', INTERVAL '100 days', INTERVAL '40 days',  'Devolvido em bom estado'),
  ('PAT-0005', 'E008', INTERVAL '300 days', INTERVAL '250 days', 'Desligamento do colaborador')
) AS v(tag, reg, ini, fim, obs)
JOIN assets a    ON a.asset_tag = v.tag
JOIN employees e ON e.registration = v.reg;

-- Datas de cadastro coerentes com o histórico (para a linha do tempo)
UPDATE employees SET created_at = NOW() - INTERVAL '400 days';
UPDATE assets    SET created_at = NOW() - INTERVAL '400 days';

-- Unidade, etiqueta e hostname fictícios (para a demonstração dos novos campos)
UPDATE employees SET site = CASE WHEN id % 2 = 0 THEN 'Matriz' ELSE 'Filial' END;
UPDATE assets SET site = CASE WHEN id % 2 = 0 THEN 'Matriz' ELSE 'Filial' END,
                  barcode = 'C0067' || LPAD(id::text, 2, '0'),
                  hostname = CASE WHEN type = 'notebook' THEN 'LAPTOP' || LPAD(id::text, 4, '0') END;

-- Demonstração da auditoria de desligamentos: Carla (E003) está em desligamento e ainda tem o PAT-0003
UPDATE employees SET ad_status = 'desativando', end_date = CURRENT_DATE + 7 WHERE registration = 'E003';

-- Demonstração: manutenção em aberto (PAT-0006) e desligamento em aberto (Carla, E003)
INSERT INTO maintenances (asset_id, opened_at, reason, supplier, ticket)
SELECT id, NOW() - INTERVAL '12 days', 'Tela com defeito', 'Assistência Exemplo', 'CH-1042' FROM assets WHERE asset_tag = 'PAT-0006';
INSERT INTO offboardings (employee_id, leave_date, ticket, notes)
SELECT id, CURRENT_DATE + 7, 'CH-1050', 'Desligamento programado' FROM employees WHERE registration = 'E003';
