import { ZodError } from 'zod';
import { AppError, dbErrorMessage } from '../errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Rota não encontrada.' });
}

// Express 5 identifica handlers de erro pelos 4 parâmetros
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Dados inválidos.',
      details: err.issues.map((i) => ({ campo: i.path.join('.') || 'corpo', mensagem: i.message })),
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON malformado.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Arquivo muito grande (máximo de 5 MB).' });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: dbErrorMessage(err) });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referência inválida a outro registro.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
}
