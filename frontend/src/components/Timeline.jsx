import { CornerDownLeft, FileText, PackagePlus, UserCheck } from 'lucide-react';
import { fmtDate } from '../format.js';

const ICONS = { created: PackagePlus, delivered: UserCheck, returned: CornerDownLeft };

/** Monta a linha do tempo (cadastro + entregas + devoluções) a partir do histórico de vínculos. */
export function buildEvents(asset, history) {
  const events = [{ key: 'c', type: 'created', date: asset.created_at, title: 'Equipamento cadastrado' }];
  for (const h of history) {
    events.push({ key: `d${h.id}`, type: 'delivered', assignmentId: h.id, date: h.delivered_at, title: `Entregue para ${h.employee_name}`, note: h.delivery_notes });
    if (h.returned_at) {
      events.push({ key: `r${h.id}`, type: 'returned', assignmentId: h.id, date: h.returned_at, title: `Devolvido por ${h.employee_name}`, note: h.return_notes });
    }
  }
  return events.sort((a, b) => new Date(a.date) - new Date(b.date));
}

export default function Timeline({ events, onTerm }) {
  return (
    <ol className="timeline">
      {events.map((ev, i) => {
        const Icon = ICONS[ev.type];
        const last = i === events.length - 1;
        return (
          <li key={ev.key} className={`tl-item tl-${ev.type}${last ? ' tl-last' : ''}`}>
            <span className="tl-dot"><Icon size={15} aria-hidden="true" /></span>
            <div>
              <time className="tl-date">{fmtDate(ev.date)}</time>
              <p className="tl-title">{ev.title}</p>
              {ev.note && <p className="muted">{ev.note}</p>}
              {onTerm && ev.assignmentId && (
                <button type="button" className="link" onClick={() => onTerm(ev.assignmentId, ev.type === 'returned' ? 'devolucao' : 'entrega')}>
                  <FileText size={13} aria-hidden="true" /> Termo em PDF
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
