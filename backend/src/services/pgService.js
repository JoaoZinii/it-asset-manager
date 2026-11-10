import { pool, withTransaction } from '../db.js';
import { conflict, dbErrorMessage, notFound } from '../errors.js';
import { normalizeName } from '../importer.js';

const EMPLOYEE_COLUMNS = ['ad_login', 'email', 'registration', 'category', 'end_date', 'ad_status', 'active', 'job_title', 'manager_name', 'department', 'site'];

// Foto do modelo: fotos enviadas ficam no banco e são servidas por /api/models/:id/photo (curta e cacheável);
// se o modelo guarda uma URL http(s), usa a própria URL.
const MODEL_PHOTO_SQL = `CASE WHEN m.photo_url IS NULL THEN NULL
  WHEN m.photo_url LIKE 'data:%' THEN '/api/models/' || m.id || '/photo?v=' || extract(epoch FROM m.updated_at)::bigint
  ELSE m.photo_url END`;

// Fragmentos SQL reutilizados (sem dados do usuário: seguro concatenar)
const HAS_OPEN_LINK = `EXISTS (SELECT 1 FROM assignments s WHERE s.asset_id = a.id AND s.returned_at IS NULL)`;

// Transforma o termo de busca em padrão ILIKE, escapando % _ e \
const likePattern = (s) => (s ? `%${s.replace(/[\\%_]/g, '\\$&')}%` : null);

/** Implementação real: PostgreSQL com queries parametrizadas ($1, $2...). */
export function createPgService() {
  async function auditData() {
    const [noNotebook, noOwner, notDelivered, available, leavers] = await Promise.all([
      // Colaboradores ativos sem nenhum NOTEBOOK com vínculo aberto
      pool.query(`
        SELECT e.id, e.registration, e.name, e.email, e.department
        FROM employees e
        WHERE e.active
          AND NOT EXISTS (
            SELECT 1 FROM assignments s JOIN assets a ON a.id = s.asset_id
            WHERE s.employee_id = e.id AND s.returned_at IS NULL AND a.type = 'notebook')
        ORDER BY e.name`),
      // Status "entregue", mas sem vínculo aberto
      pool.query(`
        SELECT a.*, NULL::int AS employee_id, NULL::text AS employee_name
        FROM assets a
        WHERE a.status = 'entregue' AND NOT ${HAS_OPEN_LINK}
        ORDER BY a.asset_tag`),
      // Vínculo aberto, mas status diferente de "entregue"
      pool.query(`
        SELECT a.*, e.id AS employee_id, e.name AS employee_name
        FROM assets a
        JOIN assignments s ON s.asset_id = a.id AND s.returned_at IS NULL
        JOIN employees e   ON e.id = s.employee_id
        WHERE a.status <> 'entregue'
        ORDER BY a.asset_tag`),
      // Notebooks disponíveis E sem vínculo aberto
      pool.query(`
        SELECT a.*, NULL::int AS employee_id, NULL::text AS employee_name
        FROM assets a
        WHERE a.type = 'notebook' AND a.status = 'disponivel' AND NOT ${HAS_OPEN_LINK}
        ORDER BY a.asset_tag`),
      // Colaboradores inativos ou em desligamento (AD) que ainda têm equipamento
      pool.query(`
        SELECT e.id AS employee_id, e.name AS employee_name, e.email, e.ad_status, to_char(COALESCE(e.end_date, o.leave_date), 'YYYY-MM-DD') AS end_date, e.active,
               o.id AS offboarding_id, o.ticket,
               a.id, a.asset_tag, a.service_tag, a.type, a.brand, a.model, a.site, s.id AS assignment_id
        FROM employees e
        JOIN assignments s ON s.employee_id = e.id AND s.returned_at IS NULL
        JOIN assets a      ON a.id = s.asset_id
        LEFT JOIN offboardings o ON o.employee_id = e.id AND o.closed_at IS NULL
        WHERE NOT e.active OR e.ad_status IN ('desativando', 'inativo') OR o.id IS NOT NULL
        ORDER BY e.name, a.asset_tag`),
    ]);
    return {
      summary: {
        employeesWithoutNotebook: noNotebook.rowCount,
        deliveredWithoutOwner: noOwner.rowCount,
        ownedButNotDelivered: notDelivered.rowCount,
        availableNotebooks: available.rowCount,
        leaversWithEquipment: leavers.rowCount,
        stockCoversDemand: available.rowCount >= noNotebook.rowCount,
      },
      employeesWithoutNotebook: noNotebook.rows,
      deliveredWithoutOwner: noOwner.rows,
      ownedButNotDelivered: notDelivered.rows,
      availableNotebooks: available.rows,
      leaversWithEquipment: leavers.rows,
    };
  }

  return {
    mode: 'postgres',

    async listEmployees({ search } = {}) {
      const { rows } = await pool.query(
        `SELECT e.*, to_char(e.end_date, 'YYYY-MM-DD') AS end_date,
                EXISTS (SELECT 1 FROM assignments s JOIN assets a ON a.id = s.asset_id
                        WHERE s.employee_id = e.id AND s.returned_at IS NULL AND a.type = 'notebook') AS has_notebook
         FROM employees e
         WHERE ($1::text IS NULL OR e.name ILIKE $1 OR e.registration ILIKE $1
                OR e.email ILIKE $1 OR e.department ILIKE $1 OR e.site ILIKE $1)
         ORDER BY e.name`,
        [likePattern(search)],
      );
      return rows;
    },

    async createEmployee({ registration, name, email, department }) {
      const { rows } = await pool.query(
        `INSERT INTO employees (registration, name, email, department)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [registration, name, email, department],
      );
      return { ...rows[0], has_notebook: false };
    },

    async listAssets({ status, type, search } = {}) {
      const { rows } = await pool.query(
        `SELECT a.*, e.id AS employee_id, e.name AS employee_name, e.department AS employee_department,
                e.registration AS employee_registration, e.email AS employee_email, ${MODEL_PHOTO_SQL} AS model_photo_url
         FROM assets a
         LEFT JOIN assignments s ON s.asset_id = a.id AND s.returned_at IS NULL
         LEFT JOIN employees e   ON e.id = s.employee_id
         LEFT JOIN asset_models m ON lower(m.brand) = lower(a.brand) AND lower(m.model) = lower(a.model)
         WHERE ($1::asset_status IS NULL OR a.status = $1)
           AND ($2::asset_type   IS NULL OR a.type   = $2)
           AND ($3::text IS NULL OR a.asset_tag ILIKE $3 OR a.service_tag ILIKE $3
                OR a.brand ILIKE $3 OR a.model ILIKE $3 OR e.name ILIKE $3
                OR a.barcode ILIKE $3 OR a.hostname ILIKE $3 OR a.site ILIKE $3)
         ORDER BY a.asset_tag`,
        [status ?? null, type ?? null, likePattern(search)],
      );
      return rows;
    },

    async createAsset({ asset_tag, service_tag, type, brand, model, notes, photo_url, site, hostname, barcode }) {
      const { rows } = await pool.query(
        `INSERT INTO assets (asset_tag, service_tag, type, brand, model, notes, photo_url, site, hostname, barcode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [asset_tag, service_tag, type, brand, model, notes, photo_url, site, hostname, barcode],
      );
      return { ...rows[0], employee_id: null, employee_name: null };
    },

    // Edição parcial. Os nomes das colunas vêm de uma lista fixa (nunca do usuário); os valores são parametrizados.
    async updateAsset(id, data) {
      const columns = ['asset_tag', 'service_tag', 'type', 'brand', 'model', 'notes', 'photo_url', 'site', 'hostname', 'barcode'].filter((c) => c in data);
      const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const upd = await pool.query(
        `UPDATE assets SET ${sets} WHERE id = $${columns.length + 1} RETURNING id`,
        [...columns.map((c) => data[c]), id],
      );
      if (upd.rowCount === 0) throw notFound('Equipamento não encontrado.');
      const { rows } = await pool.query(
        `SELECT a.*, e.id AS employee_id, e.name AS employee_name
         FROM assets a
         LEFT JOIN assignments s ON s.asset_id = a.id AND s.returned_at IS NULL
         LEFT JOIN employees e   ON e.id = s.employee_id
         WHERE a.id = $1`,
        [id],
      );
      return rows[0];
    },

    async assetHistory(id) {
      const asset = await pool.query('SELECT id FROM assets WHERE id = $1', [id]);
      if (asset.rowCount === 0) throw notFound('Equipamento não encontrado.');
      const { rows } = await pool.query(
        `SELECT s.*, e.name AS employee_name, e.registration
         FROM assignments s JOIN employees e ON e.id = s.employee_id
         WHERE s.asset_id = $1
         ORDER BY s.delivered_at DESC, s.id DESC`,
        [id],
      );
      return rows;
    },

    async updateAssetStatus(id, status) {
      return withTransaction(async (db) => {
        const cur = await db.query('SELECT status FROM assets WHERE id = $1 FOR UPDATE', [id]);
        if (cur.rowCount === 0) throw notFound('Equipamento não encontrado.');
        if (cur.rows[0].status === 'entregue') {
          throw conflict('Equipamento entregue: registre a devolução antes de alterar o status.');
        }
        await db.query('UPDATE assets SET status = $1 WHERE id = $2', [status, id]);
        // mantém o registro de manutenção coerente com o status
        if (status === 'disponivel') {
          await db.query(`UPDATE maintenances SET closed_at = NOW(), resolution = 'Liberado pelo cadastro do equipamento'
                          WHERE asset_id = $1 AND closed_at IS NULL`, [id]);
        } else if (status === 'em_manutencao') {
          await db.query(`INSERT INTO maintenances (asset_id, reason) VALUES ($1, 'Motivo não informado')
                          ON CONFLICT (asset_id) WHERE closed_at IS NULL DO NOTHING`, [id]);
        }
        const { rows } = await db.query(
          `SELECT a.*, e.id AS employee_id, e.name AS employee_name
           FROM assets a
           LEFT JOIN assignments s ON s.asset_id = a.id AND s.returned_at IS NULL
           LEFT JOIN employees e   ON e.id = s.employee_id
           WHERE a.id = $1`,
          [id],
        );
        return rows[0];
      });
    },

    async listOpenAssignments() {
      const { rows } = await pool.query(
        `SELECT s.*, a.asset_tag, a.service_tag, a.type, a.brand, a.model, a.status AS asset_status,
                e.name AS employee_name, e.registration
         FROM assignments s
         JOIN assets a    ON a.id = s.asset_id
         JOIN employees e ON e.id = s.employee_id
         WHERE s.returned_at IS NULL
         ORDER BY s.delivered_at DESC`,
      );
      return rows;
    },

    // Entrega: trava a linha do equipamento (FOR UPDATE) para evitar duas entregas simultâneas
    async createAssignment({ asset_id, employee_id, notes }) {
      return withTransaction(async (db) => {
        const asset = await db.query('SELECT id, status FROM assets WHERE id = $1 FOR UPDATE', [asset_id]);
        if (asset.rowCount === 0) throw notFound('Equipamento não encontrado.');
        const emp = await db.query('SELECT id, active FROM employees WHERE id = $1', [employee_id]);
        if (emp.rowCount === 0) throw notFound('Colaborador não encontrado.');
        if (asset.rows[0].status !== 'disponivel') {
          throw conflict('Só é possível entregar equipamentos com status "disponível".');
        }
        const open = await db.query(
          'SELECT 1 FROM assignments WHERE asset_id = $1 AND returned_at IS NULL', [asset_id]);
        if (open.rowCount > 0) throw conflict('Este equipamento já possui um vínculo aberto.');
        if (!emp.rows[0].active) throw conflict('O colaborador está inativo.');

        const { rows } = await db.query(
          `INSERT INTO assignments (asset_id, employee_id, delivery_notes)
           VALUES ($1, $2, $3) RETURNING *`,
          [asset_id, employee_id, notes],
        );
        await db.query(`UPDATE assets SET status = 'entregue' WHERE id = $1`, [asset_id]);
        return rows[0];
      });
    },

    async returnAssignment(id, { notes, next_status }) {
      return withTransaction(async (db) => {
        const cur = await db.query('SELECT * FROM assignments WHERE id = $1 FOR UPDATE', [id]);
        if (cur.rowCount === 0) throw notFound('Vínculo não encontrado.');
        if (cur.rows[0].returned_at) throw conflict('Este vínculo já foi encerrado.');
        const { rows } = await db.query(
          `UPDATE assignments SET returned_at = NOW(), return_notes = $2 WHERE id = $1 RETURNING *`,
          [id, notes],
        );
        await db.query('UPDATE assets SET status = $1 WHERE id = $2', [next_status, cur.rows[0].asset_id]);
        if (next_status === 'em_manutencao') {
          await db.query(`INSERT INTO maintenances (asset_id, reason) VALUES ($1, $2)
                          ON CONFLICT (asset_id) WHERE closed_at IS NULL DO NOTHING`,
          [cur.rows[0].asset_id, notes || 'Devolvido para manutenção']);
        }
        return rows[0];
      });
    },

    /**
     * Sincroniza dados do AD em colaboradores JÁ existentes (não cria ninguém).
     * Procura por login do AD -> e-mail -> RA -> nome (sem acento/caixa). Mesma técnica de SAVEPOINT por linha.
     */
    async syncEmployees(rows, { dryRun = false } = {}) {
      const client = await pool.connect();
      const errors = [];
      let updated = 0;
      try {
        await client.query('BEGIN');
        const all = await client.query('SELECT id, name, email, registration, ad_login FROM employees');
        const idx = { login: new Map(), email: new Map(), ra: new Map(), name: new Map() };
        for (const e of all.rows) {
          if (e.ad_login) idx.login.set(e.ad_login.toLowerCase(), e.id);
          if (e.email) idx.email.set(e.email.toLowerCase(), e.id);
          if (e.registration) idx.ra.set(String(e.registration), e.id);
          idx.name.set(normalizeName(e.name), e.id);
        }
        for (const row of rows) {
          const m = row.match;
          const found = [m.login_ad && idx.login.get(m.login_ad), m.email && idx.email.get(m.email),
            m.ra && idx.ra.get(m.ra), idx.name.get(normalizeName(m.name))].filter(Boolean);
          if (new Set(found).size > 1) {
            errors.push({ line: row.line, ref: m.name, motivo: 'Nome, e-mail, RA ou login apontam para colaboradores diferentes: conferir duplicidade' });
            continue;
          }
          const id = found[0];
          if (!id) { errors.push({ line: row.line, ref: m.name, motivo: 'Colaborador não encontrado no sistema' }); continue; }
          await client.query('SAVEPOINT linha');
          try {
            const cols = EMPLOYEE_COLUMNS.filter((c) => c in row.set);
            await client.query(
              `UPDATE employees SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`,
              [...cols.map((c) => row.set[c]), id]);
            await client.query('RELEASE SAVEPOINT linha');
            updated += 1;
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT linha');
            errors.push({ line: row.line, ref: m.name, motivo: dbErrorMessage(err) });
          }
        }
        await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      return { updated, errors };
    },

    // Todos os vínculos (abertos e encerrados) para exportação
    async listAssignments() {
      const { rows } = await pool.query(
        `SELECT s.*, a.asset_tag, a.service_tag, a.brand, a.model, e.name AS employee_name, e.registration
         FROM assignments s
         JOIN assets a    ON a.id = s.asset_id
         JOIN employees e ON e.id = s.employee_id
         ORDER BY s.delivered_at DESC, s.id DESC`);
      return rows;
    },

    // Dados para o termo em PDF
    async getTermData(id) {
      const { rows } = await pool.query(
        `SELECT s.*, a.asset_tag, a.service_tag, a.type, a.brand, a.model, a.barcode, a.hostname,
                e.name AS employee_name, e.registration, e.email, e.department, e.site AS employee_site
         FROM assignments s
         JOIN assets a    ON a.id = s.asset_id
         JOIN employees e ON e.id = s.employee_id
         WHERE s.id = $1`, [id]);
      if (rows.length === 0) throw notFound('Vínculo não encontrado.');
      return rows[0];
    },

    /**
     * Importação em lote. Tudo roda em UMA transação; cada linha usa um SAVEPOINT, então uma linha
     * com erro (ex.: duplicada no banco) é desfeita sozinha sem derrubar as outras.
     * dryRun = true executa tudo e termina com ROLLBACK (simulação).
     */
    async importAssets(rows, { dryRun = false } = {}) {
      const client = await pool.connect();
      const errors = [];
      const imported = { assets: 0, employees: 0, assignments: 0 };
      try {
        await client.query('BEGIN');
        const existing = await client.query('SELECT id, name FROM employees');
        const byName = new Map(existing.rows.map((e) => [normalizeName(e.name), e.id]));

        for (const row of rows) {
          await client.query('SAVEPOINT linha');
          try {
            let employeeId = null;
            let newEmployeeKey = null;
            if (row.employee) {
              const key = normalizeName(row.employee.name);
              employeeId = byName.get(key) ?? null;
              if (!employeeId) {
                const e = row.employee;
                const ins = await client.query(
                  `INSERT INTO employees (registration, name, email, department, site)
                   VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                  [e.registration, e.name, e.email, e.department, e.site]);
                employeeId = ins.rows[0].id;
                newEmployeeKey = key;
              }
            }
            const a = row.asset;
            const asset = await client.query(
              `INSERT INTO assets (asset_tag, service_tag, type, brand, model, status, site, hostname, barcode, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
              [a.asset_tag, a.service_tag, a.type, a.brand, a.model, a.status, a.site, a.hostname, a.barcode, a.notes]);
            if (employeeId) {
              await client.query(
                `INSERT INTO assignments (asset_id, employee_id, delivery_notes, source)
                 VALUES ($1, $2, 'Carga inicial (importação)', 'importacao')`,
                [asset.rows[0].id, employeeId]);
              imported.assignments += 1;
            }
            await client.query('RELEASE SAVEPOINT linha');
            if (newEmployeeKey) { byName.set(newEmployeeKey, employeeId); imported.employees += 1; }
            imported.assets += 1;
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT linha');
            errors.push({ line: row.line, ref: row.asset.asset_tag, motivo: dbErrorMessage(err) });
          }
        }
        await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      return { imported, errors };
    },

    // ---------------------------------------------------------------- catálogo de modelos
    async listModels() {
      const { rows } = await pool.query(`
        WITH used AS (
          SELECT lower(brand) AS bk, lower(model) AS mk, MIN(brand) AS brand, MIN(model) AS model, MIN(type::text) AS type, COUNT(*)::int AS assets
          FROM assets GROUP BY lower(brand), lower(model))
        SELECT m.id, COALESCE(m.brand, u.brand) AS brand, COALESCE(m.model, u.model) AS model,
               COALESCE(m.type::text, u.type) AS type, COALESCE(u.assets, 0) AS assets,
               (m.photo_url IS NOT NULL) AS has_photo, ${MODEL_PHOTO_SQL} AS photo
        FROM asset_models m
        FULL OUTER JOIN used u ON lower(m.brand) = u.bk AND lower(m.model) = u.mk
        ORDER BY 2, 3`);
      return rows;
    },

    // Cria ou atualiza o modelo (chave: marca + modelo sem diferenciar maiúsculas). photo_url: undefined = manter, null = remover.
    async upsertModel({ brand, model, type, photo_url }) {
      const { rows } = await pool.query(
        `INSERT INTO asset_models (brand, model, type, photo_url) VALUES ($1, $2, $3, $4)
         ON CONFLICT (lower(brand), lower(model)) DO UPDATE
           SET type = EXCLUDED.type,
               photo_url = CASE WHEN $5::boolean THEN EXCLUDED.photo_url ELSE asset_models.photo_url END,
               updated_at = NOW()
         RETURNING id`,
        [brand, model, type, photo_url ?? null, photo_url !== undefined]);
      return { id: rows[0].id };
    },

    async getModelPhoto(id) {
      const { rows } = await pool.query('SELECT photo_url FROM asset_models WHERE id = $1', [id]);
      if (rows.length === 0 || !rows[0].photo_url) throw notFound('Foto não encontrada.');
      return rows[0].photo_url;
    },

    async deleteModel(id) {
      const { rows } = await pool.query(
        `SELECT m.id, (SELECT COUNT(*)::int FROM assets a WHERE lower(a.brand) = lower(m.brand) AND lower(a.model) = lower(m.model)) AS assets
         FROM asset_models m WHERE m.id = $1`, [id]);
      if (rows.length === 0) throw notFound('Modelo não encontrado.');
      if (rows[0].assets > 0) throw conflict('Existem equipamentos deste modelo. Remova só a foto, se quiser.');
      await pool.query('DELETE FROM asset_models WHERE id = $1', [id]);
      return { deleted: true };
    },

    // ---------------------------------------------------------------- manutenção
    async listMaintenances({ status = 'aberto' } = {}) {
      const { rows } = await pool.query(
        `SELECT mt.*, a.asset_tag, a.service_tag, a.type, a.brand, a.model, a.site,
                (EXTRACT(EPOCH FROM (COALESCE(mt.closed_at, NOW()) - mt.opened_at)) / 86400)::int AS days
         FROM maintenances mt JOIN assets a ON a.id = mt.asset_id
         WHERE $1 = 'todos' OR ($1 = 'aberto' AND mt.closed_at IS NULL) OR ($1 = 'concluido' AND mt.closed_at IS NOT NULL)
         ORDER BY (mt.closed_at IS NOT NULL), mt.opened_at DESC`, [status]);
      return rows;
    },

    // Equipamentos com status "em manutenção" que ainda não têm registro (ex.: dados antigos)
    async listUntrackedMaintenance() {
      const { rows } = await pool.query(
        `SELECT a.id AS asset_id, a.asset_tag, a.type, a.brand, a.model, a.site
         FROM assets a
         WHERE a.status = 'em_manutencao'
           AND NOT EXISTS (SELECT 1 FROM maintenances mt WHERE mt.asset_id = a.id AND mt.closed_at IS NULL)
         ORDER BY a.asset_tag`);
      return rows;
    },

    async createMaintenance({ asset_id, reason, supplier, ticket, notes }) {
      return withTransaction(async (db) => {
        const asset = await db.query('SELECT id, status FROM assets WHERE id = $1 FOR UPDATE', [asset_id]);
        if (asset.rowCount === 0) throw notFound('Equipamento não encontrado.');
        if (asset.rows[0].status === 'entregue') throw conflict('Equipamento entregue: registre a devolução antes de enviar para manutenção.');
        const { rows } = await db.query(
          `INSERT INTO maintenances (asset_id, reason, supplier, ticket, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [asset_id, reason, supplier, ticket, notes]);
        await db.query(`UPDATE assets SET status = 'em_manutencao' WHERE id = $1`, [asset_id]);
        return rows[0];
      });
    },

    async closeMaintenance(id, { resolution }) {
      return withTransaction(async (db) => {
        const cur = await db.query('SELECT * FROM maintenances WHERE id = $1 FOR UPDATE', [id]);
        if (cur.rowCount === 0) throw notFound('Manutenção não encontrada.');
        if (cur.rows[0].closed_at) throw conflict('Esta manutenção já foi concluída.');
        const { rows } = await db.query(
          `UPDATE maintenances SET closed_at = NOW(), resolution = $2 WHERE id = $1 RETURNING *`, [id, resolution]);
        await db.query(`UPDATE assets SET status = 'disponivel' WHERE id = $1 AND status = 'em_manutencao'`, [cur.rows[0].asset_id]);
        return rows[0];
      });
    },

    // ---------------------------------------------------------------- desligamentos
    async listOffboardings({ status = 'aberto' } = {}) {
      const { rows } = await pool.query(
        `SELECT o.id, o.employee_id, e.name AS employee_name, e.email, e.department, e.site, e.job_title,
                to_char(o.leave_date, 'YYYY-MM-DD') AS leave_date, o.ticket, o.notes, o.created_at, o.closed_at,
                COALESCE((SELECT json_agg(json_build_object('assignment_id', s.id, 'asset_id', a.id, 'asset_tag', a.asset_tag,
                                                              'type', a.type, 'brand', a.brand, 'model', a.model) ORDER BY a.asset_tag)
                          FROM assignments s JOIN assets a ON a.id = s.asset_id
                          WHERE s.employee_id = e.id AND s.returned_at IS NULL), '[]'::json) AS pending
         FROM offboardings o JOIN employees e ON e.id = o.employee_id
         WHERE $1 = 'todos' OR ($1 = 'aberto' AND o.closed_at IS NULL) OR ($1 = 'concluido' AND o.closed_at IS NOT NULL)
         ORDER BY (o.closed_at IS NOT NULL), o.leave_date NULLS LAST, o.id DESC`, [status]);
      return rows;
    },

    // Sugestões: inativos/em desligamento no AD, com equipamento e sem registro de desligamento aberto
    async offboardingCandidates() {
      const { rows } = await pool.query(
        `SELECT e.id AS employee_id, e.name, e.email, e.ad_status, to_char(e.end_date, 'YYYY-MM-DD') AS end_date, e.site,
                (SELECT COUNT(*)::int FROM assignments s WHERE s.employee_id = e.id AND s.returned_at IS NULL) AS equipment
         FROM employees e
         WHERE (NOT e.active OR e.ad_status IN ('desativando', 'inativo'))
           AND NOT EXISTS (SELECT 1 FROM offboardings o WHERE o.employee_id = e.id AND o.closed_at IS NULL)
           AND EXISTS (SELECT 1 FROM assignments s WHERE s.employee_id = e.id AND s.returned_at IS NULL)
         ORDER BY e.name`);
      return rows;
    },

    async createOffboarding({ employee_id, leave_date, ticket, notes }) {
      const emp = await pool.query('SELECT id FROM employees WHERE id = $1', [employee_id]);
      if (emp.rowCount === 0) throw notFound('Colaborador não encontrado.');
      const { rows } = await pool.query(
        `INSERT INTO offboardings (employee_id, leave_date, ticket, notes) VALUES ($1, $2, $3, $4) RETURNING id`,
        [employee_id, leave_date, ticket, notes]);
      return { id: rows[0].id };
    },

    // Só conclui quando todos os equipamentos foram devolvidos; então inativa o colaborador.
    async closeOffboarding(id) {
      return withTransaction(async (db) => {
        const cur = await db.query('SELECT * FROM offboardings WHERE id = $1 FOR UPDATE', [id]);
        if (cur.rowCount === 0) throw notFound('Desligamento não encontrado.');
        if (cur.rows[0].closed_at) throw conflict('Este desligamento já foi concluído.');
        const pending = await db.query('SELECT COUNT(*)::int AS n FROM assignments WHERE employee_id = $1 AND returned_at IS NULL', [cur.rows[0].employee_id]);
        if (pending.rows[0].n > 0) throw conflict(`Ainda há ${pending.rows[0].n} equipamento(s) com o colaborador: registre a devolução antes de concluir.`);
        await db.query('UPDATE offboardings SET closed_at = NOW() WHERE id = $1', [id]);
        await db.query('UPDATE employees SET active = FALSE, end_date = COALESCE(end_date, $2) WHERE id = $1', [cur.rows[0].employee_id, cur.rows[0].leave_date]);
        return { id, closed: true };
      });
    },

    async deleteOffboarding(id) {
      const { rowCount } = await pool.query('DELETE FROM offboardings WHERE id = $1 AND closed_at IS NULL', [id]);
      if (rowCount === 0) {
        const exists = await pool.query('SELECT 1 FROM offboardings WHERE id = $1', [id]);
        throw exists.rowCount === 0 ? notFound('Desligamento não encontrado.') : conflict('Desligamentos concluídos não podem ser cancelados.');
      }
      return { deleted: true };
    },

    audit: auditData,

    async dashboard() {
      const [byStatus, byType, byBrand, monthly, audit] = await Promise.all([
        pool.query('SELECT status, COUNT(*)::int AS total FROM assets GROUP BY status'),
        pool.query('SELECT type, COUNT(*)::int AS total FROM assets GROUP BY type ORDER BY type'),
        pool.query('SELECT brand, COUNT(*)::int AS total FROM assets GROUP BY brand ORDER BY total DESC, brand'),
        // Entregas e devoluções por mês nos últimos 6 meses (generate_series garante meses sem movimento)
        pool.query(`
          SELECT to_char(m, 'YYYY-MM') AS month,
                 (SELECT COUNT(*)::int FROM assignments s
                   WHERE s.source = 'manual' AND date_trunc('month', s.delivered_at) = m) AS entregas,
                 (SELECT COUNT(*)::int FROM assignments s
                   WHERE s.source = 'manual' AND s.returned_at IS NOT NULL AND date_trunc('month', s.returned_at) = m) AS devolucoes
          FROM generate_series(date_trunc('month', NOW()) - INTERVAL '5 months',
                               date_trunc('month', NOW()), INTERVAL '1 month') AS m
          ORDER BY m`),
        auditData(),
      ]);
      const assets = { total: 0, disponivel: 0, entregue: 0, em_manutencao: 0 };
      for (const r of byStatus.rows) { assets[r.status] = r.total; assets.total += r.total; }
      return { assets, byType: byType.rows, byBrand: byBrand.rows, monthly: monthly.rows, alerts: audit.summary };
    },
  };
}
