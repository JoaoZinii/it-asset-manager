import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Search } from 'lucide-react';
import { api, downloadFile } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { ErrorBox, Field, Loading, Modal, Notice, PageHead } from '../components/ui.jsx';
import { TYPE_LABEL, fmtDateTime } from '../format.js';

function DeliveryForm({ assets, employees, onDone, onTerm }) {
  const [form, setForm] = useState({ asset: '', employee: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const asset = assets.find((a) => a.asset_tag.toUpperCase() === form.asset.trim().toUpperCase());
    const matches = employees.filter((x) => x.active && x.name === form.employee.trim());
    if (!asset) { onDone({ type: 'error', text: 'Escolha um equipamento disponível da lista de sugestões.' }); return; }
    if (matches.length !== 1) { onDone({ type: 'error', text: 'Escolha um colaborador ativo da lista de sugestões.' }); return; }
    setSaving(true);
    try {
      const created = await api.deliver({ asset_id: asset.id, employee_id: matches[0].id, notes: form.notes || null });
      setForm({ asset: '', employee: '', notes: '' });
      onDone({ type: 'ok', text: 'Entrega registrada.', action: { label: 'Baixar termo de entrega', onClick: () => onTerm(created.id, 'entrega', asset.asset_tag) } });
    } catch (err) {
      onDone({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel form form-inline">
      <h2>Registrar entrega</h2>
      <Field label="Equipamento disponível (digite para buscar)">
        <input list="equip-entrega" value={form.asset} onChange={set('asset')} placeholder="Patrimônio ou modelo" required />
        <datalist id="equip-entrega">
          {assets.map((a) => <option key={a.id} value={a.asset_tag}>{TYPE_LABEL[a.type]} {a.brand} {a.model}{a.site ? ` · ${a.site}` : ''}</option>)}
        </datalist>
      </Field>
      <Field label="Colaborador ativo (digite para buscar)">
        <input list="colaboradores-ativos" value={form.employee} onChange={set('employee')} placeholder="Nome do colaborador" required />
        <datalist id="colaboradores-ativos">
          {employees.filter((e) => e.active).map((e) => <option key={e.id} value={e.name}>{e.registration ?? e.department}</option>)}
        </datalist>
      </Field>
      <Field label="Observações"><input value={form.notes} onChange={set('notes')} /></Field>
      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Registrando…' : 'Registrar entrega'}</button>
    </form>
  );
}

function ReturnModal({ item, onClose, onDone, onTerm }) {
  const [notes, setNotes] = useState('');
  const [next, setNext] = useState('disponivel');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.returnAsset(item.id, { notes: notes || null, next_status: next });
      onDone({ type: 'ok', text: `Devolução de ${item.asset_tag} registrada.`, action: { label: 'Baixar termo de devolução', onClick: () => onTerm(item.id, 'devolucao', item.asset_tag) } });
    } catch (err) {
      onDone({ type: 'error', text: err.message });
    }
  }

  return (
    <Modal title={`Devolução — ${item.asset_tag}`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <p className="muted">Responsável: {item.employee_name}</p>
        <Field label="Estado após a devolução">
          <select value={next} onChange={(e) => setNext(e.target.value)}>
            <option value="disponivel">Disponível</option>
            <option value="em_manutencao">Em manutenção (registra na tela Manutenção)</option>
          </select>
        </Field>
        <Field label={next === 'em_manutencao' ? 'Observações (viram o motivo da manutenção)' : 'Observações'}><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Confirmar devolução'}</button>
        </div>
      </form>
    </Modal>
  );
}

const PAGE = 50;

export default function Movements() {
  const [params] = useSearchParams();
  const available = useAsync(() => api.assets({ status: 'disponivel' }), []);
  const employees = useAsync(() => api.employees(), []);
  const open = useAsync(() => api.openAssignments(), []);
  const [returning, setReturning] = useState(null);
  const [notice, setNotice] = useState(null);
  const [q, setQ] = useState(params.get('busca') ?? '');
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [q]);

  const openTerm = (id, tipo, tag) => downloadFile(`/assignments/${id}/term?tipo=${tipo}`, `termo-${tipo}-${tag}.pdf`)
    .catch((err) => setNotice({ type: 'error', text: err.message }));
  const reloadAll = () => { available.reload(); employees.reload(); open.reload(); };
  const done = (n) => { setNotice(n); setReturning(null); reloadAll(); };

  const loading = (available.loading && !available.data) || (employees.loading && !employees.data) || (open.loading && !open.data);
  const error = available.error || employees.error || open.error;
  const ready = available.data && employees.data && open.data;

  const term = q.trim().toLowerCase();
  const filtered = (open.data ?? []).filter((o) => !term
    || [o.asset_tag, o.service_tag, o.brand, o.model, o.employee_name, o.registration].some((f) => String(f ?? '').toLowerCase().includes(term)));
  const visible = filtered.slice(0, limit);

  return (
    <>
      <PageHead title="Movimentações" subtitle="Entregas e devoluções de equipamentos." />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {loading && !ready && <Loading />}
      {error && <ErrorBox message={error} onRetry={reloadAll} />}
      {ready && (
        <>
          <DeliveryForm assets={available.data} employees={employees.data} onDone={done} onTerm={openTerm} />
          <h2 className="section-title">Equipamentos em uso</h2>
          <div className="toolbar">
            <div className="search-box">
              <Search size={16} aria-hidden="true" />
              <input type="search" placeholder="Buscar por patrimônio, Service Tag, modelo, colaborador ou RA" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar equipamentos em uso" />
            </div>
          </div>
          <p className="muted count-line">{filtered.length} de {open.data.length} equipamento(s) em uso</p>
          {filtered.length === 0 ? (
            <p className="state">{open.data.length === 0 ? 'Nenhum equipamento entregue no momento.' : 'Nada encontrado para essa busca.'}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Patrimônio</th><th>Equipamento</th><th>Colaborador</th><th>Entregue em</th><th>Ação</th></tr></thead>
                <tbody>
                  {visible.map((o) => (
                    <tr key={o.id}>
                      <td><strong>{o.asset_tag}</strong></td>
                      <td>{TYPE_LABEL[o.type]} {o.brand} {o.model}</td>
                      <td>{o.employee_name} {o.registration && <span className="muted">({o.registration})</span>}</td>
                      <td>{fmtDateTime(o.delivered_at)}</td>
                      <td className="actions">
                        <button className="btn btn-sm" onClick={() => openTerm(o.id, 'entrega', o.asset_tag)}><FileText size={14} /> Termo</button>
                        <button className="btn btn-sm" onClick={() => setReturning(o)}>Devolver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > visible.length && (
            <div className="more"><button className="btn" onClick={() => setLimit(limit + PAGE)}>Mostrar mais ({filtered.length - visible.length} restantes)</button></div>
          )}
        </>
      )}
      {returning && <ReturnModal item={returning} onClose={() => setReturning(null)} onDone={done} onTerm={openTerm} />}
    </>
  );
}
