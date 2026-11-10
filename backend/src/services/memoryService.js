import { conflict, notFound } from '../errors.js';
import { normalizeName } from '../importer.js';

/** Mesmo contrato do pgService, mas com dados em memória (reiniciar o servidor restaura o seed). */
export function createMemoryService() {
  const now = () => new Date().toISOString();
  const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const norm = (v) => String(v ?? '').toLowerCase();

  const employees = [
    ['E001', 'Ana Souza', 'ana.souza@exemplo.com.br', 'Tecnologia', true],
    ['E002', 'Bruno Lima', 'bruno.lima@exemplo.com.br', 'Financeiro', true],
    ['E003', 'Carla Mendes', 'carla.mendes@exemplo.com.br', 'RH', true],
    ['E004', 'Diego Alves', 'diego.alves@exemplo.com.br', 'Comercial', true],
    ['E005', 'Elisa Rocha', 'elisa.rocha@exemplo.com.br', 'Marketing', true],
    ['E006', 'Felipe Costa', 'felipe.costa@exemplo.com.br', 'Logística', true],
    ['E007', 'Gabriela Nunes', 'gabriela.nunes@exemplo.com.br', 'Jurídico', true],
    ['E008', 'Henrique Dias', 'henrique.dias@exemplo.com.br', 'Comercial', false],
  ].map(([registration, name, email, department, active], i) => ({
    id: i + 1, registration, name, email, department, site: i % 2 ? 'Matriz' : 'Filial', ad_login: null, category: null,
    ad_status: null, end_date: null, active, created_at: daysAgo(400),
  }));
  // Demonstração da auditoria de desligamentos: Carla (E003) está em desligamento e ainda tem o PAT-0003
  Object.assign(employees[2], { ad_status: 'desativando', end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) });

  const assets = [
    ['PAT-0001', 'ST7K2M91', 'notebook', 'Dell', 'Latitude 5420', 'entregue', null],
    ['PAT-0002', 'ST3B8Q44', 'notebook', 'Lenovo', 'ThinkPad E14', 'entregue', null],
    ['PAT-0003', 'ST9X1C27', 'notebook', 'HP', 'ProBook 440 G8', 'entregue', null],
    ['PAT-0004', 'ST5D6N18', 'notebook', 'Dell', 'Latitude 3420', 'disponivel', null],
    ['PAT-0005', 'ST2F4R73', 'notebook', 'Lenovo', 'IdeaPad 3', 'disponivel', null],
    ['PAT-0006', 'ST8H0W56', 'notebook', 'Acer', 'TravelMate P2', 'em_manutencao', 'Tela com defeito'],
    ['PAT-0007', 'ST1J7T39', 'desktop', 'Dell', 'OptiPlex 3080', 'entregue', null],
    ['PAT-0008', 'ST6L3V82', 'desktop', 'HP', 'EliteDesk 800 G6', 'disponivel', null],
    ['PAT-0009', 'ST4P9Z15', 'notebook', 'Dell', 'Vostro 3510', 'entregue', 'Sem vínculo registrado'],
    ['PAT-0010', 'ST0M5Y60', 'notebook', 'Lenovo', 'ThinkBook 14', 'disponivel', 'Com vínculo aberto'],
  ].map(([asset_tag, service_tag, type, brand, model, status, notes], i) => ({
    id: i + 1, asset_tag, service_tag, type, brand, model, status, notes, photo_url: null,
    site: i % 2 ? 'Matriz' : 'Filial', hostname: type === 'notebook' ? `LAPTOP${String(i + 1).padStart(4, '0')}` : null,
    barcode: `C0067${String(i + 1).padStart(2, '0')}`, created_at: daysAgo(400),
  }));

  // [asset_id, employee_id, entregue há (dias), devolvido há (dias) | null, obs entrega, obs devolução]
  const assignments = [
    [1, 1, 120, null, 'Entrega inicial', null],
    [2, 2, 90, null, null, null],
    [3, 3, 60, null, null, null],
    [7, 4, 45, null, 'Estação de trabalho', null],
    [10, 5, 10, null, null, null],
    [6, 6, 200, 150, null, 'Devolvido com defeito na tela'],
    [4, 7, 100, 40, null, 'Devolvido em bom estado'],
    [5, 8, 300, 250, null, 'Desligamento do colaborador'],
  ].map(([asset_id, employee_id, ini, fim, delivery_notes, return_notes], i) => ({
    id: i + 1, asset_id, employee_id, delivered_at: daysAgo(ini),
    returned_at: fim == null ? null : daysAgo(fim), delivery_notes, return_notes, source: 'manual',
  }));

  // Catálogo de modelos, manutenções e desligamentos (demonstração: PAT-0006 em manutenção, Carla em desligamento)
  const models = [];
  const maintenances = [{ id: 1, asset_id: 6, opened_at: daysAgo(12), closed_at: null, reason: 'Tela com defeito', supplier: 'Assistência Exemplo', ticket: 'CH-1042', notes: null, resolution: null }];
  const offboardings = [{ id: 1, employee_id: 3, leave_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), ticket: 'CH-1050', notes: 'Desligamento programado', created_at: daysAgo(1), closed_at: null }];
  let nextModel = 1;
  let nextMaintenance = 2;
  let nextOffboarding = 2;
  const modelKey = (brand, model) => `${norm(brand)}|${norm(model)}`;
  const findModel = (brand, model) => models.find((m) => modelKey(m.brand, m.model) === modelKey(brand, model));
  const photoUrl = (m) => (!m?.photo_url ? null : m.photo_url.startsWith('data:') ? `/api/models/${m.id}/photo?v=${Date.parse(m.updated_at)}` : m.photo_url);
  const openMaintenance = (assetId) => maintenances.find((x) => x.asset_id === assetId && !x.closed_at);
  const openOffboarding = (employeeId) => offboardings.find((o) => o.employee_id === employeeId && !o.closed_at);
  const openAssignmentsOf = (employeeId) => assignments.filter((s) => s.employee_id === employeeId && !s.returned_at);

  let nextEmployee = employees.length + 1;
  let nextAsset = assets.length + 1;
  let nextAssignment = assignments.length + 1;

  const openOf = (assetId) => assignments.find((s) => s.asset_id === assetId && !s.returned_at);
  const employeeById = (id) => employees.find((e) => e.id === id);
  const assetById = (id) => assets.find((a) => a.id === id);
  const hasOpenNotebook = (employeeId) =>
    assignments.some((s) => s.employee_id === employeeId && !s.returned_at && assetById(s.asset_id)?.type === 'notebook');

  // mesmo formato do PostgreSQL: campos opcionais sempre presentes (null)
  const employeeView = (e) => ({
    site: null, ad_login: null, category: null, ad_status: null, end_date: null, job_title: null, manager_name: null,
    ...e, has_notebook: hasOpenNotebook(e.id),
  });
  const assetView = (a) => {
    const open = openOf(a.id);
    const emp = open && employeeById(open.employee_id);
    return {
      ...a, employee_id: emp?.id ?? null, employee_name: emp?.name ?? null, employee_department: emp?.department ?? null,
      employee_registration: emp?.registration ?? null, employee_email: emp?.email ?? null,
      model_photo_url: photoUrl(findModel(a.brand, a.model)),
    };
  };
  const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');

  function auditData() {
    const employeesWithoutNotebook = employees
      .filter((e) => e.active && !hasOpenNotebook(e.id)).sort(byName)
      .map(({ id, registration, name, email, department }) => ({ id, registration, name, email, department }));
    const deliveredWithoutOwner = assets.filter((a) => a.status === 'entregue' && !openOf(a.id)).map(assetView);
    const ownedButNotDelivered = assets.filter((a) => a.status !== 'entregue' && openOf(a.id)).map(assetView);
    const availableNotebooks = assets
      .filter((a) => a.type === 'notebook' && a.status === 'disponivel' && !openOf(a.id)).map(assetView);
    const leaversWithEquipment = assignments
      .filter((s) => !s.returned_at)
      .map((s) => ({ s, e: employeeById(s.employee_id), a: assetById(s.asset_id) }))
      .filter(({ e }) => !e.active || ['desativando', 'inativo'].includes(e.ad_status) || openOffboarding(e.id))
      .map(({ s, e, a }) => ({
        employee_id: e.id, employee_name: e.name, email: e.email, ad_status: e.ad_status, end_date: e.end_date ?? openOffboarding(e.id)?.leave_date ?? null, active: e.active,
        offboarding_id: openOffboarding(e.id)?.id ?? null, ticket: openOffboarding(e.id)?.ticket ?? null,
        id: a.id, asset_tag: a.asset_tag, service_tag: a.service_tag, type: a.type, brand: a.brand, model: a.model, site: a.site,
        assignment_id: s.id,
      }))
      .sort((x, y) => x.employee_name.localeCompare(y.employee_name, 'pt-BR'));
    return {
      summary: {
        employeesWithoutNotebook: employeesWithoutNotebook.length,
        leaversWithEquipment: leaversWithEquipment.length,
        deliveredWithoutOwner: deliveredWithoutOwner.length,
        ownedButNotDelivered: ownedButNotDelivered.length,
        availableNotebooks: availableNotebooks.length,
        stockCoversDemand: availableNotebooks.length >= employeesWithoutNotebook.length,
      },
      employeesWithoutNotebook, deliveredWithoutOwner, ownedButNotDelivered, availableNotebooks, leaversWithEquipment,
    };
  }

  return {
    mode: 'demo',

    async listEmployees({ search } = {}) {
      const q = norm(search);
      return employees
        .filter((e) => !q || [e.name, e.registration, e.email, e.department, e.site].some((f) => norm(f).includes(q)))
        .sort(byName).map(employeeView);
    },

    async createEmployee({ registration, name, email, department }) {
      if (employees.some((e) => norm(e.registration) === norm(registration))) throw conflict('Já existe um colaborador com esta matrícula.');
      if (employees.some((e) => norm(e.email) === norm(email))) throw conflict('Já existe um colaborador com este e-mail.');
      const e = { id: nextEmployee++, registration, name, email, department, active: true, created_at: now() };
      employees.push(e);
      return employeeView(e);
    },

    async listAssets({ status, type, search } = {}) {
      const q = norm(search);
      return assets.map(assetView)
        .filter((a) => (!status || a.status === status) && (!type || a.type === type))
        .filter((a) => !q || [a.asset_tag, a.service_tag, a.brand, a.model, a.employee_name, a.barcode, a.hostname, a.site].some((f) => norm(f).includes(q)))
        .sort((a, b) => a.asset_tag.localeCompare(b.asset_tag));
    },

    async createAsset({ asset_tag, service_tag, type, brand, model, notes, photo_url, site, hostname, barcode }) {
      if (assets.some((a) => a.asset_tag === asset_tag)) throw conflict('Já existe um equipamento com este patrimônio.');
      if (assets.some((a) => a.service_tag === service_tag)) throw conflict('Já existe um equipamento com esta Service Tag.');
      const a = { id: nextAsset++, asset_tag, service_tag, type, brand, model, status: 'disponivel', notes, photo_url: photo_url ?? null,
        site: site ?? null, hostname: hostname ?? null, barcode: barcode ?? null, created_at: now() };
      assets.push(a);
      return assetView(a);
    },

    async updateAsset(id, data) {
      const a = assetById(id);
      if (!a) throw notFound('Equipamento não encontrado.');
      if (data.asset_tag && assets.some((x) => x.id !== id && x.asset_tag === data.asset_tag)) throw conflict('Já existe um equipamento com este patrimônio.');
      if (data.service_tag && assets.some((x) => x.id !== id && x.service_tag === data.service_tag)) throw conflict('Já existe um equipamento com esta Service Tag.');
      Object.assign(a, data);
      return assetView(a);
    },

    async assetHistory(id) {
      if (!assetById(id)) throw notFound('Equipamento não encontrado.');
      return assignments.filter((s) => s.asset_id === id)
        .sort((a, b) => b.delivered_at.localeCompare(a.delivered_at))
        .map((s) => {
          const e = employeeById(s.employee_id);
          return { ...s, employee_name: e.name, registration: e.registration };
        });
    },

    async updateAssetStatus(id, status) {
      const a = assetById(id);
      if (!a) throw notFound('Equipamento não encontrado.');
      if (a.status === 'entregue') throw conflict('Equipamento entregue: registre a devolução antes de alterar o status.');
      a.status = status;
      const open = openMaintenance(a.id);
      if (status === 'disponivel' && open) { open.closed_at = now(); open.resolution = 'Liberado pelo cadastro do equipamento'; }
      if (status === 'em_manutencao' && !open) maintenances.push({ id: nextMaintenance++, asset_id: a.id, opened_at: now(), closed_at: null, reason: 'Motivo não informado', supplier: null, ticket: null, notes: null, resolution: null });
      return assetView(a);
    },

    async listOpenAssignments() {
      return assignments.filter((s) => !s.returned_at).map((s) => {
        const a = assetById(s.asset_id);
        const e = employeeById(s.employee_id);
        return {
          ...s, asset_tag: a.asset_tag, service_tag: a.service_tag, type: a.type, brand: a.brand,
          model: a.model, asset_status: a.status, employee_name: e.name, registration: e.registration,
        };
      }).sort((x, y) => y.delivered_at.localeCompare(x.delivered_at));
    },

    async createAssignment({ asset_id, employee_id, notes }) {
      const a = assetById(asset_id);
      if (!a) throw notFound('Equipamento não encontrado.');
      const e = employeeById(employee_id);
      if (!e) throw notFound('Colaborador não encontrado.');
      if (a.status !== 'disponivel') throw conflict('Só é possível entregar equipamentos com status "disponível".');
      if (openOf(a.id)) throw conflict('Este equipamento já possui um vínculo aberto.');
      if (!e.active) throw conflict('O colaborador está inativo.');
      const s = {
        id: nextAssignment++, asset_id, employee_id, delivered_at: now(), returned_at: null,
        delivery_notes: notes, return_notes: null, source: 'manual',
      };
      assignments.push(s);
      a.status = 'entregue';
      return s;
    },

    async returnAssignment(id, { notes, next_status }) {
      const s = assignments.find((x) => x.id === id);
      if (!s) throw notFound('Vínculo não encontrado.');
      if (s.returned_at) throw conflict('Este vínculo já foi encerrado.');
      s.returned_at = now();
      s.return_notes = notes;
      assetById(s.asset_id).status = next_status;
      if (next_status === 'em_manutencao' && !openMaintenance(s.asset_id)) {
        maintenances.push({ id: nextMaintenance++, asset_id: s.asset_id, opened_at: now(), closed_at: null, reason: notes || 'Devolvido para manutenção', supplier: null, ticket: null, notes: null, resolution: null });
      }
      return s;
    },

    // Sincroniza dados do AD em colaboradores já existentes (não cria ninguém)
    async syncEmployees(rows, { dryRun = false } = {}) {
      const snapshot = structuredClone(employees);
      const errors = [];
      let updated = 0;
      const candidates = (m) => [
        m.login_ad && employees.find((e) => e.ad_login === m.login_ad),
        m.email && employees.find((e) => e.email && e.email.toLowerCase() === m.email),
        m.ra && employees.find((e) => e.registration && String(e.registration) === m.ra),
        employees.find((e) => normalizeName(e.name) === normalizeName(m.name)),
      ].filter(Boolean);
      for (const row of rows) {
        const found = candidates(row.match);
        if (new Set(found).size > 1) {
          errors.push({ line: row.line, ref: row.match.name, motivo: 'Nome, e-mail, RA ou login apontam para colaboradores diferentes: conferir duplicidade' });
          continue;
        }
        const e = found[0];
        if (!e) { errors.push({ line: row.line, ref: row.match.name, motivo: 'Colaborador não encontrado no sistema' }); continue; }
        const set = row.set;
        const clash = (field, label) => set[field] && employees.some((x) => x.id !== e.id && x[field] && String(x[field]).toLowerCase() === String(set[field]).toLowerCase())
          ? label : null;
        const conflict = clash('ad_login', 'Já existe um colaborador com este login do AD.') || clash('email', 'Já existe um colaborador com este e-mail.')
          || clash('registration', 'Já existe um colaborador com esta matrícula.');
        if (conflict) { errors.push({ line: row.line, ref: row.match.name, motivo: conflict }); continue; }
        Object.assign(e, set);
        updated += 1;
      }
      if (dryRun) employees.splice(0, employees.length, ...snapshot);
      return { updated, errors };
    },

    async listAssignments() {
      return assignments.map((s) => {
        const a = assetById(s.asset_id);
        const e = employeeById(s.employee_id);
        return { ...s, asset_tag: a.asset_tag, service_tag: a.service_tag, brand: a.brand, model: a.model, employee_name: e.name, registration: e.registration };
      }).sort((x, y) => y.delivered_at.localeCompare(x.delivered_at));
    },

    async getTermData(id) {
      const s = assignments.find((x) => x.id === id);
      if (!s) throw notFound('Vínculo não encontrado.');
      const a = assetById(s.asset_id);
      const e = employeeById(s.employee_id);
      return {
        ...s, asset_tag: a.asset_tag, service_tag: a.service_tag, type: a.type, brand: a.brand, model: a.model,
        barcode: a.barcode, hostname: a.hostname, employee_name: e.name, registration: e.registration,
        email: e.email, department: e.department, employee_site: e.site,
      };
    },

    // Importação em lote (dryRun restaura o estado anterior ao final)
    async importAssets(rows, { dryRun = false } = {}) {
      const snapshot = {
        employees: structuredClone(employees), assets: structuredClone(assets), assignments: structuredClone(assignments),
        counters: [nextEmployee, nextAsset, nextAssignment],
      };
      const errors = [];
      const imported = { assets: 0, employees: 0, assignments: 0 };
      const byName = new Map(employees.map((e) => [normalizeName(e.name), e]));
      for (const row of rows) {
        const a = row.asset;
        if (assets.some((x) => x.asset_tag === a.asset_tag)) { errors.push({ line: row.line, ref: a.asset_tag, motivo: 'Já existe um equipamento com este patrimônio.' }); continue; }
        if (assets.some((x) => x.service_tag === a.service_tag)) { errors.push({ line: row.line, ref: a.asset_tag, motivo: 'Já existe um equipamento com esta Service Tag.' }); continue; }
        let emp = null;
        if (row.employee) {
          emp = byName.get(normalizeName(row.employee.name)) ?? null;
          if (!emp) {
            const e = row.employee;
            emp = { id: nextEmployee++, registration: e.registration, name: e.name, email: e.email, department: e.department, site: e.site, active: true, created_at: now() };
            employees.push(emp);
            byName.set(normalizeName(e.name), emp);
            imported.employees += 1;
          }
        }
        const asset = { id: nextAsset++, ...a, photo_url: null, created_at: now() };
        assets.push(asset);
        imported.assets += 1;
        if (emp) {
          assignments.push({ id: nextAssignment++, asset_id: asset.id, employee_id: emp.id, delivered_at: now(), returned_at: null, delivery_notes: 'Carga inicial (importação)', return_notes: null, source: 'importacao' });
          imported.assignments += 1;
        }
      }
      if (dryRun) {
        employees.splice(0, employees.length, ...snapshot.employees);
        assets.splice(0, assets.length, ...snapshot.assets);
        assignments.splice(0, assignments.length, ...snapshot.assignments);
        [nextEmployee, nextAsset, nextAssignment] = snapshot.counters;
      }
      return { imported, errors };
    },

    // ---------------------------------------------------------------- catálogo de modelos
    async listModels() {
      const rows = new Map();
      for (const a of assets) {
        const k = modelKey(a.brand, a.model);
        const cur = rows.get(k) ?? { id: null, brand: a.brand, model: a.model, type: a.type, assets: 0, has_photo: false, photo: null };
        cur.assets += 1;
        rows.set(k, cur);
      }
      for (const m of models) {
        const k = modelKey(m.brand, m.model);
        const cur = rows.get(k) ?? { brand: m.brand, model: m.model, type: m.type, assets: 0 };
        rows.set(k, { ...cur, id: m.id, type: m.type, has_photo: Boolean(m.photo_url), photo: photoUrl(m) });
      }
      return [...rows.values()].sort((x, y) => x.brand.localeCompare(y.brand, 'pt-BR') || x.model.localeCompare(y.model, 'pt-BR'));
    },

    async upsertModel({ brand, model, type, photo_url }) {
      let m = findModel(brand, model);
      if (!m) { m = { id: nextModel++, brand, model, type, photo_url: null, updated_at: now() }; models.push(m); }
      m.type = type;
      if (photo_url !== undefined) m.photo_url = photo_url;
      m.updated_at = now();
      return { id: m.id };
    },

    async getModelPhoto(id) {
      const m = models.find((x) => x.id === id);
      if (!m?.photo_url) throw notFound('Foto não encontrada.');
      return m.photo_url;
    },

    async deleteModel(id) {
      const m = models.find((x) => x.id === id);
      if (!m) throw notFound('Modelo não encontrado.');
      if (assets.some((a) => modelKey(a.brand, a.model) === modelKey(m.brand, m.model))) throw conflict('Existem equipamentos deste modelo. Remova só a foto, se quiser.');
      models.splice(models.indexOf(m), 1);
      return { deleted: true };
    },

    // ---------------------------------------------------------------- manutenção
    async listMaintenances({ status = 'aberto' } = {}) {
      return maintenances
        .filter((x) => status === 'todos' || (status === 'aberto' ? !x.closed_at : Boolean(x.closed_at)))
        .map((x) => {
          const a = assetById(x.asset_id);
          const end = x.closed_at ? Date.parse(x.closed_at) : Date.now();
          return { ...x, asset_tag: a.asset_tag, service_tag: a.service_tag, type: a.type, brand: a.brand, model: a.model, site: a.site,
            days: Math.floor((end - Date.parse(x.opened_at)) / 86400000) };
        })
        .sort((x, y) => Number(Boolean(x.closed_at)) - Number(Boolean(y.closed_at)) || y.opened_at.localeCompare(x.opened_at));
    },

    async listUntrackedMaintenance() {
      return assets.filter((a) => a.status === 'em_manutencao' && !openMaintenance(a.id))
        .map((a) => ({ asset_id: a.id, asset_tag: a.asset_tag, type: a.type, brand: a.brand, model: a.model, site: a.site }));
    },

    async createMaintenance({ asset_id, reason, supplier, ticket, notes }) {
      const a = assetById(asset_id);
      if (!a) throw notFound('Equipamento não encontrado.');
      if (a.status === 'entregue') throw conflict('Equipamento entregue: registre a devolução antes de enviar para manutenção.');
      if (openMaintenance(a.id)) throw conflict('Este equipamento já tem uma manutenção em aberto.');
      const row = { id: nextMaintenance++, asset_id, opened_at: now(), closed_at: null, reason, supplier, ticket, notes, resolution: null };
      maintenances.push(row);
      a.status = 'em_manutencao';
      return row;
    },

    async closeMaintenance(id, { resolution }) {
      const row = maintenances.find((x) => x.id === id);
      if (!row) throw notFound('Manutenção não encontrada.');
      if (row.closed_at) throw conflict('Esta manutenção já foi concluída.');
      row.closed_at = now();
      row.resolution = resolution;
      const a = assetById(row.asset_id);
      if (a.status === 'em_manutencao') a.status = 'disponivel';
      return row;
    },

    // ---------------------------------------------------------------- desligamentos
    async listOffboardings({ status = 'aberto' } = {}) {
      return offboardings
        .filter((o) => status === 'todos' || (status === 'aberto' ? !o.closed_at : Boolean(o.closed_at)))
        .map((o) => {
          const e = employeeById(o.employee_id);
          return {
            id: o.id, employee_id: e.id, employee_name: e.name, email: e.email, department: e.department, site: e.site, job_title: e.job_title ?? null,
            leave_date: o.leave_date, ticket: o.ticket, notes: o.notes, created_at: o.created_at, closed_at: o.closed_at,
            pending: openAssignmentsOf(e.id).map((s) => { const a = assetById(s.asset_id); return { assignment_id: s.id, asset_id: a.id, asset_tag: a.asset_tag, type: a.type, brand: a.brand, model: a.model }; }),
          };
        })
        .sort((x, y) => Number(Boolean(x.closed_at)) - Number(Boolean(y.closed_at)) || String(x.leave_date ?? '9').localeCompare(String(y.leave_date ?? '9')) || y.id - x.id);
    },

    async offboardingCandidates() {
      return employees
        .filter((e) => (!e.active || ['desativando', 'inativo'].includes(e.ad_status)) && !openOffboarding(e.id) && openAssignmentsOf(e.id).length > 0)
        .sort(byName)
        .map((e) => ({ employee_id: e.id, name: e.name, email: e.email, ad_status: e.ad_status ?? null, end_date: e.end_date ?? null, site: e.site ?? null, equipment: openAssignmentsOf(e.id).length }));
    },

    async createOffboarding({ employee_id, leave_date, ticket, notes }) {
      if (!employeeById(employee_id)) throw notFound('Colaborador não encontrado.');
      if (openOffboarding(employee_id)) throw conflict('Este colaborador já tem um desligamento em aberto.');
      const row = { id: nextOffboarding++, employee_id, leave_date, ticket, notes, created_at: now(), closed_at: null };
      offboardings.push(row);
      return { id: row.id };
    },

    async closeOffboarding(id) {
      const o = offboardings.find((x) => x.id === id);
      if (!o) throw notFound('Desligamento não encontrado.');
      if (o.closed_at) throw conflict('Este desligamento já foi concluído.');
      const n = openAssignmentsOf(o.employee_id).length;
      if (n > 0) throw conflict(`Ainda há ${n} equipamento(s) com o colaborador: registre a devolução antes de concluir.`);
      o.closed_at = now();
      const e = employeeById(o.employee_id);
      e.active = false;
      e.end_date = e.end_date ?? o.leave_date;
      return { id, closed: true };
    },

    async deleteOffboarding(id) {
      const o = offboardings.find((x) => x.id === id);
      if (!o) throw notFound('Desligamento não encontrado.');
      if (o.closed_at) throw conflict('Desligamentos concluídos não podem ser cancelados.');
      offboardings.splice(offboardings.indexOf(o), 1);
      return { deleted: true };
    },

    async audit() { return auditData(); },

    async dashboard() {
      const count = (st) => assets.filter((a) => a.status === st).length;
      const byType = ['notebook', 'desktop'].map((type) => ({ type, total: assets.filter((a) => a.type === type).length }));
      const brands = {};
      for (const a of assets) brands[a.brand] = (brands[a.brand] || 0) + 1;
      const byBrand = Object.entries(brands).map(([brand, total]) => ({ brand, total }))
        .sort((x, y) => y.total - x.total || x.brand.localeCompare(y.brand));
      const base = new Date();
      const monthly = [5, 4, 3, 2, 1, 0].map((back) => {
        const m = new Date(base.getFullYear(), base.getMonth() - back, 1);
        const same = (iso) => { const d = new Date(iso); return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth(); };
        return {
          month: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`,
          entregas: assignments.filter((s) => s.source === 'manual' && same(s.delivered_at)).length,
          devolucoes: assignments.filter((s) => s.source === 'manual' && s.returned_at && same(s.returned_at)).length,
        };
      });
      return {
        assets: { total: assets.length, disponivel: count('disponivel'), entregue: count('entregue'), em_manutencao: count('em_manutencao') },
        byType, byBrand, monthly,
        alerts: auditData().summary,
      };
    },
  };
}
