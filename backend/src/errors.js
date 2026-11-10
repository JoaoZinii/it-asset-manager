export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
// Violações de UNIQUE do PostgreSQL (código 23505) -> mensagem amigável
export const CONSTRAINT_MESSAGES = {
  employees_registration_key: 'Já existe um colaborador com esta matrícula.',
  employees_email_key: 'Já existe um colaborador com este e-mail.',
  assets_asset_tag_key: 'Já existe um equipamento com este patrimônio.',
  assets_service_tag_key: 'Já existe um equipamento com esta Service Tag.',
  employees_ad_login_key: 'Já existe um colaborador com este login do AD.',
  uq_maintenances_open_asset: 'Este equipamento já tem uma manutenção em aberto.',
  uq_offboardings_open_employee: 'Este colaborador já tem um desligamento em aberto.',
  uq_assignments_open_asset: 'Este equipamento já possui um vínculo aberto.',
};

export function dbErrorMessage(err) {
  if (err.code === '23505') return CONSTRAINT_MESSAGES[err.constraint] || 'Registro duplicado.';
  if (err.code === '22001') return 'Algum valor excede o tamanho permitido.';
  return err.message;
}

export const notFound = (msg) => new AppError(404, msg);
export const conflict = (msg) => new AppError(409, msg);
