import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { AppError } from './errors.js';

export const ASSET_CSV_COLUMNS = ['patrimonio', 'service_tag', 'tipo', 'marca', 'modelo', 'status', 'site', 'hostname',
  'etiqueta', 'observacoes', 'colaborador', 'departamento', 'ra', 'email'];
const REQUIRED = ['patrimonio', 'service_tag', 'tipo', 'marca', 'modelo'];
const MAX_ROWS = 5000;

const key = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Normaliza nomes para comparar pessoas (sem acento, minúsculas, espaços únicos). */
export const normalizeName = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Cabeçalhos aceitos (já normalizados) -> nome interno
const ALIASES = {
  patrimonio: 'patrimonio', assettag: 'patrimonio', tag: 'patrimonio',
  servicetag: 'service_tag',
  tipo: 'tipo', categoria: 'tipo', type: 'tipo',
  marca: 'marca', brand: 'marca', fabricante: 'marca',
  modelo: 'modelo', model: 'modelo',
  status: 'status', situacao: 'status',
  site: 'site', unidade: 'site', local: 'site',
  hostname: 'hostname',
  etiqueta: 'etiqueta', barcode: 'etiqueta', codigodebarras: 'etiqueta',
  observacoes: 'observacoes', observacao: 'observacoes', obs: 'observacoes', notas: 'observacoes', notes: 'observacoes',
  colaborador: 'colaborador', usuario: 'colaborador', responsavel: 'colaborador',
  departamento: 'departamento', area: 'departamento', setor: 'departamento',
  ra: 'ra', matricula: 'ra', registro: 'ra', corpid: 'ra',
  email: 'email', emailcorporativo: 'email',
};

const TIPOS = { notebook: 'notebook', laptop: 'notebook', desktop: 'desktop', computador: 'desktop' };
const STATUS = {
  disponivel: 'disponivel', emestoque: 'disponivel', estoque: 'disponivel',
  entregue: 'entregue', emuso: 'entregue', uso: 'entregue',
  emmanutencao: 'em_manutencao', manutencao: 'em_manutencao',
};

/** Descobre o separador pelo cabeçalho (nunca aceita vários ao mesmo tempo: vírgulas dentro de textos quebrariam as linhas). */
function detectDelimiter(content) {
  const first = content.replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => l.trim()) ?? '';
  let best = ';';
  let max = 0;
  for (const d of [';', ',', '\t']) {
    const n = first.split(d).length - 1;
    if (n > max) { max = n; best = d; }
  }
  return best;
}

const blank = (v) => (v === '' || v === null ? undefined : v);
const text = (max) => z.preprocess(blank, z.string().trim().max(max).optional());
const upper = (s) => s.toUpperCase();

const rowSchema = z.object({
  patrimonio: z.string().trim().min(1).max(40).transform(upper),
  service_tag: z.string().trim().min(1).max(40).transform(upper),
  tipo: z.string().trim().min(1).transform((v) => TIPOS[key(v)]).refine(Boolean, { message: 'Tipo inválido: use notebook ou desktop.' }),
  marca: z.string().trim().min(1).max(60),
  modelo: z.string().trim().min(1).max(80),
  status: z.preprocess(blank, z.string().trim().optional()).transform((v) => (v ? (STATUS[key(v)] ?? 'invalido') : undefined))
    .refine((v) => v !== 'invalido', { message: 'Status inválido: use disponivel, entregue ou em_manutencao.' }),
  site: text(80), hostname: text(80), etiqueta: z.preprocess(blank, z.string().trim().max(40).optional()).transform((v) => v?.toUpperCase()),
  observacoes: text(500), colaborador: text(120), departamento: text(80), ra: text(30),
  email: z.preprocess(blank, z.string().trim().toLowerCase().email().max(160).optional()),
});

/**
 * Lê o CSV e devolve { total, valid, errors }.
 * valid: [{ line, asset, employee|null }] | errors: [{ line, patrimonio, motivo }]
 */
export function parseAssetsCsv(text) {
  let records;
  try {
    records = parse(text, {
      columns: (header) => header.map((h) => ALIASES[key(h)] ?? `_${key(h)}`),
      delimiter: detectDelimiter(text), bom: true, skip_empty_lines: true, trim: true, relax_column_count: true, info: true,
    });
  } catch (err) {
    throw new AppError(400, `CSV inválido: ${err.message}`);
  }
  if (records.length === 0) throw new AppError(400, 'O CSV não tem linhas de dados.');
  if (records.length > MAX_ROWS) throw new AppError(400, `O CSV tem mais de ${MAX_ROWS} linhas. Divida o arquivo.`);
  const present = new Set(Object.keys(records[0].record));
  const missing = REQUIRED.filter((c) => !present.has(c));
  if (missing.length) throw new AppError(400, `Colunas obrigatórias ausentes: ${missing.join(', ')}.`);

  const valid = [];
  const errors = [];
  const seenTag = new Map();
  const seenService = new Map();

  for (const { record, info } of records) {
    const line = info.lines;
    const parsed = rowSchema.safeParse(record);
    const label = record.patrimonio || '';
    if (!parsed.success) {
      errors.push({ line, ref: label, motivo: parsed.error.issues.map((i) => `${i.path[0]}: ${i.message}`).join(' | ') });
      continue;
    }
    const d = parsed.data;
    const problems = [];
    if (seenTag.has(d.patrimonio)) problems.push(`patrimônio repetido no arquivo (linha ${seenTag.get(d.patrimonio)})`);
    if (seenService.has(d.service_tag)) problems.push(`Service Tag repetida no arquivo (linha ${seenService.get(d.service_tag)})`);
    let status = d.status;
    if (d.colaborador && !status) status = 'entregue';
    if (d.colaborador && status !== 'entregue') problems.push('colaborador informado, mas o status não é "entregue"');
    if (status === 'entregue' && !d.colaborador) problems.push('status "entregue" exige o nome do colaborador');
    if (problems.length) {
      errors.push({ line, ref: d.patrimonio, motivo: problems.join(' | ') });
      continue;
    }
    seenTag.set(d.patrimonio, line);
    seenService.set(d.service_tag, line);
    valid.push({
      line,
      asset: {
        asset_tag: d.patrimonio, service_tag: d.service_tag, type: d.tipo, brand: d.marca, model: d.modelo,
        status: status ?? 'disponivel', site: d.site ?? null, hostname: d.hostname ?? null,
        barcode: d.etiqueta ?? null, notes: d.observacoes ?? null,
      },
      employee: d.colaborador
        ? { name: d.colaborador, department: d.departamento ?? 'Não informado', site: d.site ?? null, registration: d.ra ?? null, email: d.email ?? null }
        : null,
    });
  }
  return { total: records.length, valid, errors };
}


// ---------------------------------------------------------------------------------------------
// Sincronização de colaboradores (dados do AD): atualiza quem já existe; não cria ninguém.
// Colunas: colaborador (obrigatória), login_ad, email, ra, situacao, vinculo, data_fim
// ---------------------------------------------------------------------------------------------
const EMP_ALIASES = {
  colaborador: 'colaborador', nome: 'colaborador', fullname: 'colaborador', usuario: 'colaborador',
  loginad: 'login_ad', adlogin: 'login_ad', login: 'login_ad',
  email: 'email', emailcorporativo: 'email',
  ra: 'ra', matricula: 'ra', registro: 'ra', corpid: 'ra',
  situacao: 'situacao', status: 'situacao', userstatus: 'situacao',
  vinculo: 'vinculo', categoria: 'vinculo', category: 'vinculo',
  datafim: 'data_fim', fim: 'data_fim', enddate: 'data_fim', isenddate: 'data_fim',
  cargo: 'cargo', funcao: 'cargo', jobtitle: 'cargo', cargofuncao: 'cargo',
  gestor: 'gestor', manager: 'gestor', hierarchical: 'gestor', gestorimediato: 'gestor',
  departamento: 'departamento', area: 'departamento', setor: 'departamento',
  site: 'site', unidade: 'site', local: 'site',
};
const SITUACAO = {
  ativo: 'ativo', active: 'ativo',
  desativando: 'desativando', beingdeactivated: 'desativando',
  inativo: 'inativo', desactive: 'inativo', deactivated: 'inativo', desativado: 'inativo',
};

function parseDate(v) {
  const s = String(v).trim().slice(0, 10);
  let y; let m; let d;
  let mt = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mt) [, y, m, d] = mt;
  else if ((mt = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) [, d, m, y] = mt;
  else return 'invalida';
  const date = new Date(Date.UTC(+y, +m - 1, +d));
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +m - 1 || date.getUTCDate() !== +d) return 'invalida';
  return +y >= 2050 ? null : `${y}-${m}-${d}`; // 2060-01-01 e similares = "sem data de fim" no AD
}

const empRowSchema = z.object({
  colaborador: z.string().trim().min(1).max(120),
  login_ad: text(40),
  email: z.preprocess(blank, z.string().trim().toLowerCase().email().max(160).optional()),
  ra: text(30),
  situacao: z.preprocess(blank, z.string().trim().optional()).transform((v) => (v ? (SITUACAO[key(v)] ?? 'invalida') : undefined))
    .refine((v) => v !== 'invalida', { message: 'Situação inválida: use ativo, desativando ou inativo.' }),
  vinculo: text(40),
  cargo: text(120), gestor: text(120), departamento: text(80), site: text(80),
  data_fim: z.preprocess(blank, z.string().trim().optional()).transform((v) => (v ? parseDate(v) : undefined))
    .refine((v) => v !== 'invalida', { message: 'Data inválida: use AAAA-MM-DD ou DD/MM/AAAA.' }),
});

/** Devolve { total, valid, errors }. valid: [{ line, match: {name, login_ad, email, ra}, set: {coluna: valor} }] */
export function parseEmployeesCsv(content) {
  let records;
  try {
    records = parse(content, {
      columns: (header) => header.map((h) => EMP_ALIASES[key(h)] ?? `_${key(h)}`),
      delimiter: detectDelimiter(content), bom: true, skip_empty_lines: true, trim: true, relax_column_count: true, info: true,
    });
  } catch (err) {
    throw new AppError(400, `CSV inválido: ${err.message}`);
  }
  if (records.length === 0) throw new AppError(400, 'O CSV não tem linhas de dados.');
  if (records.length > MAX_ROWS) throw new AppError(400, `O CSV tem mais de ${MAX_ROWS} linhas. Divida o arquivo.`);
  if (!Object.keys(records[0].record).includes('colaborador')) throw new AppError(400, 'Coluna obrigatória ausente: colaborador.');

  const valid = [];
  const errors = [];
  for (const { record, info } of records) {
    const line = info.lines;
    const parsed = empRowSchema.safeParse(record);
    if (!parsed.success) {
      errors.push({ line, ref: record.colaborador || '', motivo: parsed.error.issues.map((i) => `${i.path[0]}: ${i.message}`).join(' | ') });
      continue;
    }
    const d = parsed.data;
    const set = {};
    if (d.login_ad) set.ad_login = d.login_ad.toLowerCase();
    if (d.email) set.email = d.email;
    if (d.ra) set.registration = d.ra;
    if (d.vinculo) set.category = d.vinculo;
    if (d.cargo) set.job_title = d.cargo;
    if (d.gestor) set.manager_name = d.gestor;
    if (d.departamento) set.department = d.departamento;
    if (d.site) set.site = d.site;
    if (d.data_fim !== undefined) set.end_date = d.data_fim;
    if (d.situacao) { set.ad_status = d.situacao; set.active = d.situacao !== 'inativo'; }
    if (Object.keys(set).length === 0) {
      errors.push({ line, ref: d.colaborador, motivo: 'nenhum dado para atualizar (informe login_ad, email, ra, situacao, vinculo, cargo, gestor, departamento, site ou data_fim)' });
      continue;
    }
    valid.push({ line, match: { name: d.colaborador, login_ad: d.login_ad?.toLowerCase(), email: d.email, ra: d.ra }, set });
  }
  return { total: records.length, valid, errors };
}
