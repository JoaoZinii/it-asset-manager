import { useState } from 'react';
import { CheckCircle2, Plus, Wrench } from 'lucide-react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { ErrorBox, Field, Loading, Modal, Notice, PageHead, Segmented } from '../components/ui.jsx';
import { TYPE_LABEL, fmtDate } from '../format.js';
import { MaintenanceForm } from './Assets.jsx';

/** Escolhe o equipamento (busca por patrimônio) e registra o motivo. */
function SendModal({ onClose, onSaved, preset }) {
  const available = useAsync(() => api.assets({ status: 'disponivel' }), []);
  const [tag, setTag] = useState(preset?.asset_tag ?? '');
  const list = preset ? [{ ...preset, id: preset.asset_id }] : available.data ?? [];
  const asset = list.find((a) => a.asset_tag.toUpperCase() === tag.trim().toUpperCase());
  return (
    <Modal title="Enviar para manutenção" onClose={onClose}>
      {!preset && (
        <div className="form">
          <Field label="Equipamento disponível (digite o patrimônio ou o modelo)">
            <input list="equip-disponiveis" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Ex.: 1818" autoFocus />
            <datalist id="equip-disponiveis">
              {list.map((a) => <option key={a.id} value={a.asset_tag}>{a.brand} {a.model}{a.site ? ` · ${a.site}` : ''}</option>)}
            </datalist>
          </Field>
          {available.loading && !available.data && <p className="muted">Carregando equipamentos…</p>}
          {available.error && <p className="form-error">{available.error}</p>}
          {tag && !asset && <p className="muted">Escolha um equipamento da lista. Só aparecem os que estão disponíveis (os entregues precisam ser devolvidos antes).</p>}
        </div>
      )}
      {asset && <MaintenanceForm key={asset.id} asset={asset} onCancel={onClose} onSaved={() => onSaved(asset)} />}
    </Modal>
  );
}

function CloseModal({ item, onClose, onSaved }) {
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try { await api.closeMaintenance(item.id, { resolution: resolution || null }); onSaved(); } catch (err) { setError(err.message); setSaving(false); }
  }
  return (
    <Modal title={`Concluir manutenção — ${item.asset_tag}`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <p className="muted">{item.brand} {item.model} · motivo: {item.reason}</p>
        <Field label="Resultado / o que foi feito"><textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Ex.: tela trocada" autoFocus /></Field>
        <p className="muted">O equipamento volta para o status "Disponível".</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Concluindo…' : 'Concluir e liberar'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Maintenance() {
  const [tab, setTab] = useState('aberto');
  const list = useAsync(() => api.maintenances(tab), [tab]);
  const untracked = useAsync(() => api.untrackedMaintenance(), []);
  const [sending, setSending] = useState(null);   // true | equipamento sem registro
  const [closing, setClosing] = useState(null);
  const [notice, setNotice] = useState(null);

  const reloadAll = () => { list.reload(); untracked.reload(); };
  const done = (text) => { setSending(null); setClosing(null); setNotice({ type: 'ok', text }); reloadAll(); };
  const rows = list.data ?? [];

  return (
    <>
      <PageHead
        title="Manutenção"
        subtitle="Equipamentos enviados para conserto: motivo, fornecedor, chamado e tempo parado."
        action={<button className="btn btn-primary" onClick={() => setSending(true)}><Plus size={16} /> Enviar para manutenção</button>}
      />
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {untracked.data?.length > 0 && (
        <div className="panel banner-warn-panel">
          <h2><Wrench size={18} aria-hidden="true" /> {untracked.data.length} equipamento(s) em manutenção sem registro</h2>
          <p className="muted">O status está como "em manutenção", mas falta o motivo. Registre para acompanhar o prazo.</p>
          <ul className="plain-list">
            {untracked.data.map((u) => (
              <li key={u.asset_id}>
                <span><strong>{u.asset_tag}</strong> — {u.brand} {u.model}</span>
                <button className="btn btn-sm" onClick={() => setSending(u)}>Registrar motivo</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="toolbar">
        <Segmented label="Situação" value={tab} onChange={setTab}
          options={[{ value: 'aberto', label: 'Em manutenção', dot: 'em_manutencao', count: tab === 'aberto' ? rows.length : '·' }, { value: 'concluido', label: 'Concluídas', dot: 'disponivel', count: tab === 'concluido' ? rows.length : '·' }]} />
      </div>

      {list.loading && !list.data && <Loading />}
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.data && rows.length === 0 && <p className="state">{tab === 'aberto' ? 'Nenhum equipamento em manutenção.' : 'Nenhuma manutenção concluída ainda.'}</p>}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Equipamento</th><th>Site</th><th>Motivo</th><th>Fornecedor</th><th>Chamado</th><th>Aberta em</th><th>{tab === 'aberto' ? 'Parado há' : 'Duração'}</th>{tab === 'concluido' ? <th>Resultado</th> : <th>Ação</th>}</tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.asset_tag}</strong> <span className="muted">{TYPE_LABEL[m.type]} {m.brand} {m.model}</span></td>
                  <td>{m.site ?? '—'}</td>
                  <td>{m.reason}</td>
                  <td>{m.supplier ?? '—'}</td>
                  <td>{m.ticket ?? '—'}</td>
                  <td>{fmtDate(m.opened_at)}</td>
                  <td><span className={`badge ${m.days > 30 && tab === 'aberto' ? 'badge-danger' : 'badge-entregue'}`}>{m.days} dia(s)</span></td>
                  {tab === 'concluido'
                    ? <td>{m.resolution ?? '—'}</td>
                    : <td><button className="btn btn-sm" onClick={() => setClosing(m)}><CheckCircle2 size={14} /> Concluir</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sending && <SendModal preset={sending === true ? null : sending} onClose={() => setSending(null)} onSaved={(a) => done(`${a.asset_tag} enviado para manutenção.`)} />}
      {closing && <CloseModal item={closing} onClose={() => setClosing(null)} onSaved={() => done(`${closing.asset_tag} liberado.`)} />}
    </>
  );
}
