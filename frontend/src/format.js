export const STATUS_LABEL = { disponivel: 'Disponível', entregue: 'Entregue', em_manutencao: 'Em manutenção' };
export const TYPE_LABEL = { notebook: 'Notebook', desktop: 'Desktop' };
export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—');
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('pt-BR') : '—');
// Datas puras (AAAA-MM-DD) não passam por fuso horário: evita mostrar o dia anterior
export const fmtDay = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
export function daysUntil(day) {
  if (!day) return null;
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const [y, m, d] = String(day).slice(0, 10).split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}
