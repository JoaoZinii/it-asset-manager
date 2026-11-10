import { z } from 'zod';

export const ASSET_STATUSES = ['disponivel', 'entregue', 'em_manutencao'];
export const ASSET_TYPES = ['notebook', 'desktop'];

// Mensagens de validação em português
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' ? 'Campo obrigatório.' : 'Tipo de dado inválido.' };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `Valor inválido. Use: ${issue.options.join(', ')}.` };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: issue.minimum <= 1 ? 'Campo obrigatório.' : `Mínimo de ${issue.minimum} caracteres.` };
      return { message: 'Informe um número positivo.' };
    case z.ZodIssueCode.too_big:
      return { message: issue.type === 'string' ? `Máximo de ${issue.maximum} caracteres.` : 'Valor muito alto.' };
    case z.ZodIssueCode.invalid_string:
      return { message: issue.validation === 'email' ? 'E-mail inválido.' : 'Texto inválido.' };
    default:
      return { message: ctx.defaultError };
  }
});

const text = (max) => z.string().trim().min(1).max(max);
const upper = (max) => text(max).transform((s) => s.toUpperCase());
const optionalNotes = z.string().trim().max(500).nullish().transform((v) => v || null);
const id = z.coerce.number().int().positive();

// Foto: URL http(s), caminho local (/fotos/x.jpg) ou data URL de imagem (upload redimensionado no navegador)
const PHOTO_PREFIXES = ['https://', 'http://', '/', 'data:image/jpeg;base64,', 'data:image/png;base64,', 'data:image/webp;base64,'];
const optionalPhoto = z.string().trim().max(400000)
  .refine((v) => v === '' || PHOTO_PREFIXES.some((p) => v.startsWith(p)), { message: 'Foto inválida: use uma URL http(s) ou envie uma imagem.' })
  .nullish().transform((v) => v || null);

export const idParam = id;

const optionalText = (max) => z.string().trim().max(max).nullish().transform((v) => v || null);
const optionalUpper = (max) => z.string().trim().max(max).nullish().transform((v) => (v ? v.toUpperCase() : null));
export const termQuery = z.object({ tipo: z.enum(['entrega', 'devolucao']).default('entrega') });

export const employeeCreate = z.object({
  registration: text(30),
  name: text(120),
  email: z.string().trim().toLowerCase().email().max(160),
  department: text(80),
});

export const assetCreate = z.object({
  asset_tag: upper(40),
  service_tag: upper(40),
  type: z.enum(ASSET_TYPES),
  brand: text(60),
  model: text(80),
  notes: optionalNotes,
  photo_url: optionalPhoto,
  site: optionalText(80),
  hostname: optionalText(80),
  barcode: optionalUpper(40),
});

// Edição parcial: só os campos enviados são alterados
export const assetUpdate = assetCreate.partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Informe ao menos um campo para alterar.' });

export const assetQuery = z.object({
  status: z.enum(ASSET_STATUSES).optional(),
  type: z.enum(ASSET_TYPES).optional(),
  search: z.string().trim().max(100).optional(),
});

export const searchQuery = z.object({ search: z.string().trim().max(100).optional() });

// Manualmente só é possível alternar entre disponível e em manutenção
const photoKeep = z.string().trim().max(400000)
  .refine((v) => v === '' || PHOTO_PREFIXES.some((p) => v.startsWith(p)), { message: 'Foto inválida: use uma URL http(s) ou envie uma imagem.' })
  .nullish().transform((v) => (v === undefined ? undefined : v || null)); // undefined = manter, null = remover
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida: use AAAA-MM-DD.').nullish().transform((v) => v || null);

export const modelUpsert = z.object({ brand: text(60), model: text(80), type: z.enum(ASSET_TYPES).default('notebook'), photo_url: photoKeep });
export const listStatus = z.object({ status: z.enum(['aberto', 'concluido', 'todos']).default('aberto') });
export const maintenanceCreate = z.object({
  asset_id: id, reason: text(200), supplier: optionalText(120), ticket: optionalText(40), notes: optionalNotes,
});
export const maintenanceClose = z.object({ resolution: optionalText(300) });
export const offboardingCreate = z.object({ employee_id: id, leave_date: isoDate, ticket: optionalText(40), notes: optionalNotes });

export const statusPatch = z.object({ status: z.enum(['disponivel', 'em_manutencao']) });

export const assignmentCreate = z.object({
  asset_id: id,
  employee_id: id,
  notes: optionalNotes,
});

export const assignmentReturn = z.object({
  notes: optionalNotes,
  next_status: z.enum(['disponivel', 'em_manutencao']).default('disponivel'),
});
