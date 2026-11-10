import { Router } from 'express';
import { AppError, conflict } from '../errors.js';
import { config } from '../config.js';
import { toCsv } from '../csv.js';
import { parseAssetsCsv, parseEmployeesCsv } from '../importer.js';
import { buildTermPdf } from '../pdf/termo.js';
import {
  idParam, employeeCreate, assetCreate, assetUpdate, assetQuery, searchQuery,
  statusPatch, assignmentCreate, assignmentReturn, termQuery,
  modelUpsert, listStatus, maintenanceCreate, maintenanceClose, offboardingCreate,
} from '../schemas.js';

const statusLabel = { disponivel: 'disponivel', entregue: 'entregue', em_manutencao: 'em_manutencao' };
const today = () => new Date().toISOString().slice(0, 10);
const sendCsv = (res, name, content) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${today()}.csv"`);
  res.send(content);
};

/** Camada de rotas: valida a entrada (Zod) e delega a regra de negócio ao service. */
export function createRouter(service) {
  const r = Router();

  r.get('/health', (req, res) => res.json({ status: 'ok', mode: service.mode }));

  r.get('/employees', async (req, res) => {
    const { search } = searchQuery.parse(req.query);
    res.json(await service.listEmployees({ search }));
  });
  r.post('/employees', async (req, res) => {
    const data = employeeCreate.parse(req.body);
    res.status(201).json(await service.createEmployee(data));
  });

  r.get('/assets', async (req, res) => {
    res.json(await service.listAssets(assetQuery.parse(req.query)));
  });
  r.post('/assets', async (req, res) => {
    const data = assetCreate.parse(req.body);
    res.status(201).json(await service.createAsset(data));
  });
  r.patch('/assets/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    res.json(await service.updateAsset(id, assetUpdate.parse(req.body)));
  });
  r.get('/assets/:id/history', async (req, res) => {
    res.json(await service.assetHistory(idParam.parse(req.params.id)));
  });
  r.patch('/assets/:id/status', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { status } = statusPatch.parse(req.body);
    res.json(await service.updateAssetStatus(id, status));
  });

  r.get('/assignments/open', async (req, res) => {
    res.json(await service.listOpenAssignments());
  });
  r.post('/assignments', async (req, res) => {
    const data = assignmentCreate.parse(req.body);
    res.status(201).json(await service.createAssignment(data));
  });
  r.post('/assignments/:id/return', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const data = assignmentReturn.parse(req.body ?? {});
    res.json(await service.returnAssignment(id, data));
  });

  // ---- Catálogo de modelos (a foto do modelo vale para todos os equipamentos dele) ----
  r.get('/models', async (req, res) => res.json(await service.listModels()));
  r.put('/models', async (req, res) => res.json(await service.upsertModel(modelUpsert.parse(req.body))));
  r.get('/models/:id/photo', async (req, res) => {
    const url = await service.getModelPhoto(idParam.parse(req.params.id));
    const m = url.match(/^data:(image\/[a-z]+);base64,(.*)$/s);
    if (!m) return res.redirect(url);
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // a URL muda (?v=) quando a foto é trocada
    return res.send(Buffer.from(m[2], 'base64'));
  });
  r.delete('/models/:id', async (req, res) => res.json(await service.deleteModel(idParam.parse(req.params.id))));

  // ---- Manutenção ----
  r.get('/maintenances', async (req, res) => res.json(await service.listMaintenances(listStatus.parse(req.query))));
  r.get('/maintenances/untracked', async (req, res) => res.json(await service.listUntrackedMaintenance()));
  r.post('/maintenances', async (req, res) => res.status(201).json(await service.createMaintenance(maintenanceCreate.parse(req.body))));
  r.post('/maintenances/:id/close', async (req, res) => {
    res.json(await service.closeMaintenance(idParam.parse(req.params.id), maintenanceClose.parse(req.body ?? {})));
  });

  // ---- Desligamentos ----
  r.get('/offboardings', async (req, res) => res.json(await service.listOffboardings(listStatus.parse(req.query))));
  r.get('/offboardings/candidates', async (req, res) => res.json(await service.offboardingCandidates()));
  r.post('/offboardings', async (req, res) => res.status(201).json(await service.createOffboarding(offboardingCreate.parse(req.body))));
  r.post('/offboardings/:id/close', async (req, res) => res.json(await service.closeOffboarding(idParam.parse(req.params.id))));
  r.delete('/offboardings/:id', async (req, res) => res.json(await service.deleteOffboarding(idParam.parse(req.params.id))));

  // ---- Termo de responsabilidade (PDF) ----
  r.get('/assignments/:id/term', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { tipo } = termQuery.parse(req.query);
    const data = await service.getTermData(id);
    if (tipo === 'devolucao' && !data.returned_at) throw conflict('Este vínculo ainda não foi devolvido.');
    const pdf = await buildTermPdf(data, tipo, config.companyName);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="termo-${tipo}-${data.asset_tag}.pdf"`);
    res.send(pdf);
  });

  // ---- Importação (CSV no corpo da requisição; ?dry_run=true apenas simula) ----
  r.post('/import/assets', async (req, res) => {
    if (typeof req.body !== 'string' || !req.body.trim()) {
      throw new AppError(400, 'Envie o conteúdo do CSV no corpo da requisição (Content-Type: text/csv).');
    }
    const dryRun = req.query.dry_run === 'true';
    const { total, valid, errors } = parseAssetsCsv(req.body);
    const result = await service.importAssets(valid, { dryRun });
    res.json({
      dry_run: dryRun, total_rows: total, imported: result.imported,
      errors: [...errors, ...result.errors].sort((a, b) => a.line - b.line),
    });
  });

  r.post('/import/employees', async (req, res) => {
    if (typeof req.body !== 'string' || !req.body.trim()) {
      throw new AppError(400, 'Envie o conteúdo do CSV no corpo da requisição (Content-Type: text/csv).');
    }
    const dryRun = req.query.dry_run === 'true';
    const { total, valid, errors } = parseEmployeesCsv(req.body);
    const result = await service.syncEmployees(valid, { dryRun });
    res.json({
      dry_run: dryRun, total_rows: total, updated: result.updated,
      errors: [...errors, ...result.errors].sort((a, b) => a.line - b.line),
    });
  });

  // ---- Exportação (CSV com separador ";" e BOM, abre direto no Excel) ----
  r.get('/export/assets.csv', async (req, res) => {
    const rows = await service.listAssets({});
    sendCsv(res, 'equipamentos', toCsv(rows, [
      { header: 'patrimonio', key: 'asset_tag' }, { header: 'service_tag', key: 'service_tag' }, { header: 'tipo', key: 'type' },
      { header: 'marca', key: 'brand' }, { header: 'modelo', key: 'model' }, { header: 'status', key: (a) => statusLabel[a.status] },
      { header: 'site', key: 'site' }, { header: 'hostname', key: 'hostname' }, { header: 'etiqueta', key: 'barcode' },
      { header: 'observacoes', key: 'notes' }, { header: 'colaborador', key: 'employee_name' },
      { header: 'departamento', key: 'employee_department' }, { header: 'ra', key: 'employee_registration' },
      { header: 'email', key: 'employee_email' },
    ]));
  });
  r.get('/export/employees.csv', async (req, res) => {
    const rows = await service.listEmployees({});
    sendCsv(res, 'colaboradores', toCsv(rows, [
      { header: 'ra', key: 'registration' }, { header: 'nome', key: 'name' }, { header: 'email', key: 'email' },
      { header: 'login_ad', key: 'ad_login' }, { header: 'vinculo', key: 'category' },
      { header: 'situacao_ad', key: 'ad_status' }, { header: 'data_fim', key: 'end_date' },
      { header: 'departamento', key: 'department' }, { header: 'site', key: 'site' },
      { header: 'situacao', key: (e) => (e.active ? 'ativo' : 'inativo') },
      { header: 'possui_notebook', key: (e) => (e.has_notebook ? 'sim' : 'nao') },
    ]));
  });
  r.get('/export/movements.csv', async (req, res) => {
    const rows = await service.listAssignments();
    sendCsv(res, 'movimentacoes', toCsv(rows, [
      { header: 'patrimonio', key: 'asset_tag' }, { header: 'service_tag', key: 'service_tag' },
      { header: 'equipamento', key: (s) => `${s.brand} ${s.model}` }, { header: 'colaborador', key: 'employee_name' },
      { header: 'ra', key: 'registration' }, { header: 'data_entrega', key: 'delivered_at' },
      { header: 'data_devolucao', key: 'returned_at' }, { header: 'obs_entrega', key: 'delivery_notes' },
      { header: 'obs_devolucao', key: 'return_notes' }, { header: 'origem', key: 'source' },
    ]));
  });

  r.get('/audit', async (req, res) => res.json(await service.audit()));
  r.get('/dashboard', async (req, res) => res.json(await service.dashboard()));

  return r;
}
