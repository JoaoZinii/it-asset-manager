import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Plus, UserMinus } from 'lucide-react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { Avatar, ErrorBox, Field, Loading, Modal, Notice, PageHead, Segmented } from '../components/ui.jsx';
import { TYPE_LABEL, daysUntil, fmtDay } from '../format.js';

/** Registra um desligamento. `preset` pré-preenche (sugestões do AD). */
function OffboardingForm({ employees, preset, onSaved, onCancel }) {
  const [form, setForm] = useState({ employee: preset?.name ?? '', leave_date: preset?.end_date ?? '', ticket: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const matches = employees.filter((x) => x.name === form.employee.trim());
    if (matches.length !== 1) { setError('Escolha um colaborador da lista de sugestões.'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.createOffboarding({ employee_id: matches[0].id, leave_date: form.leave_date || null, ticket: form.ticket || null, notes: form.notes || null });
      onSaved(matches[0].name);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <Field label="Colaborador (digite para buscar)">
        <input list="colaboradores-desligamento" value={form.employee} onChange={set('employee')} placeholder="Nome do colaborador" required autoFocus />
        <datalist id="colaboradores-desligamento">
          {employees.map((x) => <option key={x.id} value={x.name}>{[x.job_title, x.site].filter(Boolean).join(' · ')}</option>)}
        </datalist>
      </Field>
      <div className="form-grid">
        <Field label="Data do desligamento"><input type="date" value={form.leave_date} onChange={set('leave_date')} /></Field>
        <Field label="Nº do chamado"><input value={form.ticket} onChange={set('ticket')} placeholder="Ex.: CH-1050" /></Field>
      </div>
      <Field label="Observações"><textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Registrando…' : 'Registrar desligamento'}</button>
      </div>
    </form>
  );
}

function DateBadge({ day }) {
  const n = daysUntil(day);
  if (n === null) return <span className="muted">sem data</span>;
  if (n < 0) return <span className="badge badge-danger"><i className="dot" />{fmtDay(day)} · {-n} dia(s) atrás</span>;
  if (n === 0) return <span className="badge badge-em_manutencao"><i className="dot" />Hoje</span>;
  return <span className={`badge ${n <= 7 ? 'badge-em_manutencao' : 'badge-entregue'}`}><i className="dot" />{fmtDay(day)} · em {n} dia(s)</span>;
}

export default function Offboardings() {
  const [tab, setTab] = useState('aberto');
  const list = useAsync(() => api.offboardings(tab), [tab]);
  const candidates = useAsync(() => api.offboardingCandidates(), []);
  const people = useAsync(() => api.employees(), []);
  const [creating, setCreating] = useState(null); // true | sugestão
  const [notice, setNotice] = useState(null);

  const reloadAll = () => { list.reload(); candidates.reload(); };
  const rows = list.data ?? [];

  async function act(fn, okText) {
    try { await fn(); setNotice({ type: 'ok', text: okText }); reloadAll(); } catch (err) { setNotice({ type: 'error', text: err.message }); }
  }
  const cancel = (o) => window.confirm(`Cancelar o desligamento de ${o.employee_name}?`)
    && act(() => api.deleteOffboarding(o.id), 'Desligamento cancelado.');

  return (
    <>
      <PageHead
        title="Desligamentos"
        subtitle="Acompanhe quem está saindo e se os equipamentos foram devolvidos."
        action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Registrar desligamento</button>}
      />
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {candidates.data?.length > 0 && (
        <div className="panel banner-warn-panel">
          <h2><UserMinus size={18} aria-hidden="true" /> Sugestões do AD: {candidates.data.length} colaborador(es) inativos ou em desligamento ainda com equipamento</h2>
          <p className="muted">Ainda não têm registro de desligamento. Registre para acompanhar a devolução.</p>
          <ul className="plain-list">
            {candidates.data.slice(0, 8).map((c) => (
              <li key={c.employee_id}>
                <span><strong>{c.name}</strong> <span className="muted">· {c.equipment} equipamento(s){c.end_date ? ` · fim ${fmtDay(c.end_date)}` : ''}</span></span>
                <button className="btn btn-sm" onClick={() => setCreating(c)}>Registrar</button>
              </li>
            ))}
          </ul>
          {candidates.data.length > 8 && <p className="muted">E mais {candidates.data.length - 8}. Veja todos na Auditoria.</p>}
        </div>
      )}

      <div className="toolbar">
        <Segmented label="Situação" value={tab} onChange={setTab}
          options={[{ value: 'aberto', label: 'Em andamento', dot: 'em_manutencao', count: tab === 'aberto' ? rows.length : '·' }, { value: 'concluido', label: 'Concluídos', dot: 'disponivel', count: tab === 'concluido' ? rows.length : '·' }]} />
      </div>

      {list.loading && !list.data && <Loading />}
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.data && rows.length === 0 && <p className="state">{tab === 'aberto' ? 'Nenhum desligamento em andamento.' : 'Nenhum desligamento concluído.'}</p>}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Colaborador</th><th>Data</th><th>Chamado</th><th>Equipamentos com o colaborador</th><th>Ações</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <span className="person"><Avatar name={o.employee_name} /><span><strong>{o.employee_name}</strong><br /><span className="muted">{[o.job_title, o.site].filter(Boolean).join(' · ') || o.department}</span></span></span>
                  </td>
                  <td>{tab === 'aberto' ? <DateBadge day={o.leave_date} /> : <>{fmtDay(o.leave_date)}<br /><span className="muted">concluído em {fmtDay(o.closed_at)}</span></>}</td>
                  <td>{o.ticket ?? '—'}</td>
                  <td>
                    {o.pending.length === 0
                      ? <span className="badge badge-disponivel"><i className="dot" />Tudo devolvido</span>
                      : o.pending.map((p) => <span key={p.assignment_id} className="badge badge-em_manutencao pend"><i className="dot" />{p.asset_tag} · {TYPE_LABEL[p.type]} {p.brand}</span>)}
                  </td>
                  <td className="actions">
                    {tab === 'aberto' && (
                      <>
                        {o.pending.length > 0 && <Link className="btn btn-sm" to={`/movimentacoes?busca=${encodeURIComponent(o.employee_name)}`}>Registrar devolução</Link>}
                        <button className="btn btn-sm" disabled={o.pending.length > 0} title={o.pending.length ? 'Devolva os equipamentos antes de concluir' : 'Concluir e inativar o colaborador'}
                          onClick={() => act(() => api.closeOffboarding(o.id), `Desligamento de ${o.employee_name} concluído.`)}><CheckCircle2 size={14} /> Concluir</button>
                        <button className="btn btn-sm" onClick={() => cancel(o)}>Cancelar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'aberto' && rows.length > 0 && <p className="muted">Ao concluir, o colaborador é marcado como inativo. Só é possível concluir depois que todos os equipamentos forem devolvidos.</p>}

      {creating && (
        <Modal title="Registrar desligamento" onClose={() => setCreating(null)}>
          {people.loading && !people.data ? <Loading /> : (
            <OffboardingForm employees={people.data ?? []} preset={creating === true ? null : creating} onCancel={() => setCreating(null)}
              onSaved={(name) => { setCreating(null); setNotice({ type: 'ok', text: `Desligamento de ${name} registrado.` }); reloadAll(); }} />
          )}
        </Modal>
      )}
    </>
  );
}
