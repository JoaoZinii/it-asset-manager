import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, History, ImagePlus, LayoutGrid, Laptop, MapPin, Monitor, Pencil, Plus, Rows3, ScanBarcode, Trash2, UserRound, Wrench, X } from 'lucide-react';
import { api, downloadFile } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { fileToDataUrl } from '../imageUtils.js';
import AssetPhoto from '../components/AssetPhoto.jsx';
import Timeline, { buildEvents } from '../components/Timeline.jsx';
import { Avatar, ErrorBox, Field, Loading, Modal, MultiSelect, Notice, PageHead, Segmented, StatusBadge } from '../components/ui.jsx';
import { STATUS_LABEL, TYPE_LABEL } from '../format.js';

const EMPTY = { asset_tag: '', service_tag: '', type: 'notebook', brand: '', model: '', notes: '', photo_url: '', site: '', hostname: '', barcode: '' };

/** Cadastro e edição (quando `asset` é informado). A foto do equipamento é opcional: sem ela vale a foto do modelo. */
function AssetForm({ asset, onSaved, onCancel }) {
  const [form, setForm] = useState(asset ? {
    ...EMPTY, ...asset, notes: asset.notes ?? '', photo_url: asset.photo_url ?? '', site: asset.site ?? '', hostname: asset.hostname ?? '', barcode: asset.barcode ?? '',
  } : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isUpload = form.photo_url.startsWith('data:');
  const usingModelPhoto = !form.photo_url && asset?.model_photo_url;

  async function pickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setForm({ ...form, photo_url: await fileToDataUrl(file) });
      setError(null);
    } catch (err) {
      setError(err.message);
    }
    e.target.value = '';
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      asset_tag: form.asset_tag, service_tag: form.service_tag, type: form.type, brand: form.brand, model: form.model,
      notes: form.notes || null, photo_url: form.photo_url || null,
      site: form.site || null, hostname: form.hostname || null, barcode: form.barcode || null,
    };
    try {
      if (asset) await api.updateAsset(asset.id, payload);
      else await api.createAsset(payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="photo-edit">
        <AssetPhoto asset={{ brand: form.brand || 'Marca', model: form.model, type: form.type, photo_url: form.photo_url, model_photo_url: asset?.model_photo_url }} className="photo-preview" />
        <div className="photo-controls">
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} hidden />
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> Foto só deste equipamento</button>
          {form.photo_url && (
            <button type="button" className="btn btn-sm" onClick={() => setForm({ ...form, photo_url: '' })}><Trash2 size={15} /> Remover</button>
          )}
          {isUpload ? (
            <p className="muted">Foto enviada do computador.</p>
          ) : (
            <input value={form.photo_url} onChange={set('photo_url')} placeholder="ou cole a URL de uma imagem (https://…)" aria-label="URL da foto" />
          )}
          <p className="muted photo-hint">
            {usingModelPhoto
              ? 'Usando a foto do modelo (cadastrada em "Modelos e fotos"). Envie uma foto aqui só se este equipamento for diferente.'
              : 'Dica: cadastre a foto uma vez em "Modelos e fotos" e ela vale para todos os equipamentos do mesmo modelo.'}
          </p>
        </div>
      </div>
      <div className="form-grid">
        <Field label="Patrimônio"><input value={form.asset_tag} onChange={set('asset_tag')} placeholder="Ex.: 1810" required /></Field>
        <Field label="Service Tag"><input value={form.service_tag} onChange={set('service_tag')} required /></Field>
        <Field label="Tipo">
          <select value={form.type} onChange={set('type')}>
            <option value="notebook">Notebook</option>
            <option value="desktop">Desktop</option>
          </select>
        </Field>
        <Field label="Marca"><input value={form.brand} onChange={set('brand')} required /></Field>
        <Field label="Modelo"><input value={form.model} onChange={set('model')} required /></Field>
        <Field label="Site"><input value={form.site} onChange={set('site')} placeholder="Ex.: Matriz" /></Field>
        <Field label="Etiqueta (código de barras)"><input value={form.barcode} onChange={set('barcode')} placeholder="Ex.: C006759" /></Field>
        <Field label="Hostname"><input value={form.hostname} onChange={set('hostname')} /></Field>
      </div>
      <Field label="Observações"><textarea value={form.notes} onChange={set('notes')} rows={2} /></Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : asset ? 'Salvar alterações' : 'Cadastrar equipamento'}
        </button>
      </div>
    </form>
  );
}

/** Envia o equipamento para manutenção registrando o motivo. */
export function MaintenanceForm({ asset, onSaved, onCancel }) {
  const [form, setForm] = useState({ reason: '', supplier: '', ticket: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createMaintenance({
        asset_id: asset.id, reason: form.reason, supplier: form.supplier || null, ticket: form.ticket || null, notes: form.notes || null,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <p className="muted">{asset.asset_tag} — {asset.brand} {asset.model}</p>
      <Field label="Motivo"><input value={form.reason} onChange={set('reason')} placeholder="Ex.: tela com defeito" required autoFocus /></Field>
      <div className="form-grid">
        <Field label="Fornecedor / assistência"><input value={form.supplier} onChange={set('supplier')} /></Field>
        <Field label="Nº do chamado"><input value={form.ticket} onChange={set('ticket')} /></Field>
      </div>
      <Field label="Observações"><textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Registrando…' : 'Enviar para manutenção'}</button>
      </div>
    </form>
  );
}

function HistoryModal({ asset, onClose }) {
  const { data, loading, error, reload } = useAsync(() => api.history(asset.id), [asset.id]);
  const [termError, setTermError] = useState(null);
  const openTerm = (id, tipo) => downloadFile(`/assignments/${id}/term?tipo=${tipo}`, `termo-${tipo}-${asset.asset_tag}.pdf`)
    .then(() => setTermError(null)).catch((e) => setTermError(e.message));
  return (
    <Modal title={`Histórico — ${asset.asset_tag}`} onClose={onClose}>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {termError && <p className="form-error" role="alert">{termError}</p>}
      {data && <Timeline events={buildEvents(asset, data)} onTerm={openTerm} />}
    </Modal>
  );
}

export default function Assets() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [sites, setSites] = useState([]);
  const [brands, setBrands] = useState([]);
  const [view, setView] = useState('cards');
  const [limit, setLimit] = useState(48);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [historyOf, setHistoryOf] = useState(null);
  const [maintaining, setMaintaining] = useState(null);
  const [notice, setNotice] = useState(null);
  const debounced = useDebounce(search);

  // A busca vai para o servidor; os filtros trabalham no navegador (resposta instantânea)
  const { data, loading, error, reload } = useAsync(() => api.assets({ search: debounced }), [debounced]);
  useEffect(() => setLimit(48), [debounced, status, type, sites, brands]);

  const all = data ?? [];
  // `skip` ignora um filtro para que os contadores das opções mostrem o que aconteceria ao escolhê-las
  const matches = (a, skip) => (skip === 'status' || !status || a.status === status)
    && (skip === 'type' || !type || a.type === type)
    && (skip === 'sites' || !sites.length || sites.includes(a.site))
    && (skip === 'brands' || !brands.length || brands.includes(a.brand));
  const count = (skip, pred) => all.filter((a) => matches(a, skip) && pred(a)).length;
  const optionsOf = (key, selected, skip) => [...new Set([...all.map((a) => a[key]).filter(Boolean), ...selected])]
    .sort((a, b) => a.localeCompare(b, 'pt-BR')).map((value) => ({ value, count: count(skip, (a) => a[key] === value) }));

  const statusTabs = [{ value: '', label: 'Todos', count: count('status', () => true) },
    ...Object.entries(STATUS_LABEL).map(([k, label]) => ({ value: k, label, dot: k, count: count('status', (a) => a.status === k) }))];
  const typeTabs = [{ value: '', label: 'Todos', count: count('type', () => true) },
    ...Object.entries(TYPE_LABEL).map(([k, label]) => ({ value: k, label, count: count('type', (a) => a.type === k) }))];

  const filtered = all.filter((a) => matches(a));
  const visible = filtered.slice(0, limit);
  const hasFilters = Boolean(status || type || sites.length || brands.length);
  const clear = () => { setStatus(''); setType(''); setSites([]); setBrands([]); };

  async function release(asset) {
    try {
      await api.setStatus(asset.id, 'disponivel');
      setNotice({ type: 'ok', text: `${asset.asset_tag} liberado e manutenção concluída.` });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }
  const saved = (text) => { setCreating(false); setEditing(null); setMaintaining(null); setNotice({ type: 'ok', text }); reload(); };

  const actions = (a) => (
    <>
      <button className="btn btn-sm" onClick={() => setEditing(a)}><Pencil size={14} /> Editar</button>
      <button className="btn btn-sm" onClick={() => setHistoryOf(a)}><History size={14} /> Histórico</button>
      {a.status === 'disponivel' && (
        <button className="btn btn-sm" title="Enviar para manutenção" onClick={() => setMaintaining(a)}><Wrench size={14} /> Manutenção</button>
      )}
      {a.status === 'em_manutencao' && (
        <button className="btn btn-sm" title="Concluir a manutenção e liberar" onClick={() => release(a)}><CheckCircle2 size={14} /> Liberar</button>
      )}
    </>
  );

  return (
    <>
      <PageHead
        title="Equipamentos"
        subtitle="Notebooks e desktops cadastrados."
        action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Novo equipamento</button>}
      />
      <Notice notice={notice} onClose={() => setNotice(null)} />

      <div className="toolbar">
        <input type="search" placeholder="Buscar por patrimônio, Service Tag, etiqueta, hostname, modelo ou responsável"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar equipamentos" />
        <div className="seg" role="group" aria-label="Modo de visualização">
          <button type="button" className={view === 'cards' ? 'on' : ''} aria-pressed={view === 'cards'} onClick={() => setView('cards')}><LayoutGrid size={16} /> Cards</button>
          <button type="button" className={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => setView('table')}><Rows3 size={16} /> Tabela</button>
        </div>
      </div>

      <div className="filter-panel">
        <Segmented label="Status" options={statusTabs} value={status} onChange={setStatus} />
        <div className="filter-row">
          <div className="filter-group"><span className="filter-label">Tipo</span><Segmented label="Tipo" options={typeTabs} value={type} onChange={setType} /></div>
          <div className="filter-group">
            <span className="filter-label">Filtrar por</span>
            <MultiSelect label="Site" options={optionsOf('site', sites, 'sites')} selected={sites} onChange={setSites} />
            <MultiSelect label="Marca" options={optionsOf('brand', brands, 'brands')} selected={brands} onChange={setBrands} />
          </div>
        </div>
        {(sites.length > 0 || brands.length > 0) && (
          <div className="active-filters">
            {sites.map((s) => <button key={`s${s}`} type="button" className="chip chip-on" onClick={() => setSites(sites.filter((x) => x !== s))}><MapPin size={13} /> {s} <X size={13} /></button>)}
            {brands.map((b) => <button key={`b${b}`} type="button" className="chip chip-on" onClick={() => setBrands(brands.filter((x) => x !== b))}>{b} <X size={13} /></button>)}
          </div>
        )}
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <p className="muted count-line">
          {filtered.length} de {all.length} equipamento(s){loading ? ' · atualizando…' : ''}
          {hasFilters && <button type="button" className="link" onClick={clear}><X size={14} /> Limpar filtros</button>}
        </p>
      )}
      {data && filtered.length === 0 && <p className="state">Nenhum equipamento encontrado com esses filtros.</p>}

      {data && filtered.length > 0 && view === 'cards' && (
        <div className="asset-grid">
          {visible.map((a, i) => (
            <article className="asset-card" key={a.id} style={{ '--i': Math.min(i, 10) }}>
              <div className="asset-media">
                <AssetPhoto asset={a} />
                <StatusBadge status={a.status} className="on-photo" />
                <span className="type-pill">{a.type === 'notebook' ? <Laptop size={14} /> : <Monitor size={14} />} {TYPE_LABEL[a.type]}</span>
              </div>
              <div className="asset-body">
                <h3>{a.brand} {a.model}</h3>
                {(a.site || a.barcode) && (
                  <p className="asset-sub muted">
                    {a.site && <span><MapPin size={13} aria-hidden="true" /> {a.site}</span>}
                    {a.barcode && <span><ScanBarcode size={13} aria-hidden="true" /> {a.barcode}</span>}
                  </p>
                )}
                <dl className="asset-meta">
                  <div><dt>Patrimônio</dt><dd>{a.asset_tag}</dd></div>
                  <div><dt>Service Tag</dt><dd>{a.service_tag}</dd></div>
                </dl>
                <div className="asset-user">
                  {a.employee_name
                    ? (<><Avatar name={a.employee_name} /><span>{a.employee_name}</span></>)
                    : (<span className="muted"><UserRound size={16} /> Sem responsável</span>)}
                </div>
              </div>
              <div className="asset-actions">{actions(a)}</div>
            </article>
          ))}
        </div>
      )}

      {data && filtered.length > 0 && view === 'table' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Foto</th><th>Patrimônio</th><th>Service Tag</th><th>Etiqueta</th><th>Site</th><th>Tipo</th><th>Equipamento</th><th>Status</th><th>Responsável</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id}>
                  <td><AssetPhoto asset={a} className="thumb" /></td>
                  <td><strong>{a.asset_tag}</strong></td>
                  <td>{a.service_tag}</td>
                  <td>{a.barcode ?? '—'}</td>
                  <td>{a.site ?? '—'}</td>
                  <td>{TYPE_LABEL[a.type]}</td>
                  <td>{a.brand} {a.model}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>{a.employee_name ?? '—'}</td>
                  <td className="actions">{actions(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && filtered.length > visible.length && (
        <div className="more">
          <button className="btn" onClick={() => setLimit(limit + 48)}>Mostrar mais ({filtered.length - visible.length} restantes)</button>
        </div>
      )}

      {creating && (
        <Modal title="Novo equipamento" onClose={() => setCreating(false)} wide>
          <AssetForm onCancel={() => setCreating(false)} onSaved={() => saved('Equipamento cadastrado.')} />
        </Modal>
      )}
      {editing && (
        <Modal title={`Editar — ${editing.asset_tag}`} onClose={() => setEditing(null)} wide>
          <AssetForm asset={editing} onCancel={() => setEditing(null)} onSaved={() => saved('Equipamento atualizado.')} />
        </Modal>
      )}
      {maintaining && (
        <Modal title="Enviar para manutenção" onClose={() => setMaintaining(null)}>
          <MaintenanceForm asset={maintaining} onCancel={() => setMaintaining(null)} onSaved={() => saved(`${maintaining.asset_tag} enviado para manutenção.`)} />
        </Modal>
      )}
      {historyOf && <HistoryModal asset={historyOf} onClose={() => setHistoryOf(null)} />}
    </>
  );
}
