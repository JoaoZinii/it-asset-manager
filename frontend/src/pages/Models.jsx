import { useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { fileToDataUrl } from '../imageUtils.js';
import AssetPhoto from '../components/AssetPhoto.jsx';
import { Chip, ErrorBox, Field, Loading, Modal, Notice, PageHead } from '../components/ui.jsx';
import { TYPE_LABEL } from '../format.js';

function ModelForm({ onSaved, onCancel }) {
  const [form, setForm] = useState({ brand: '', model: '', type: 'notebook', photo_url: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { setForm({ ...form, photo_url: await fileToDataUrl(file, 640) }); setError(null); } catch (err) { setError(err.message); }
  }

  async function submit(ev) {
    ev.preventDefault();
    setSaving(true);
    try {
      await api.saveModel({ brand: form.brand, model: form.model, type: form.type, photo_url: form.photo_url || undefined });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="photo-edit">
        <AssetPhoto asset={{ brand: form.brand || 'Marca', model: form.model, type: form.type, photo_url: form.photo_url }} className="photo-preview" />
        <div className="photo-controls">
          <label className="btn btn-sm"><ImagePlus size={15} /> Enviar foto<input type="file" accept="image/*" hidden onChange={pick} /></label>
          {form.photo_url && <button type="button" className="btn btn-sm" onClick={() => setForm({ ...form, photo_url: '' })}><Trash2 size={15} /> Remover</button>}
        </div>
      </div>
      <div className="form-grid">
        <Field label="Marca"><input value={form.brand} onChange={set('brand')} placeholder="Ex.: Dell" required /></Field>
        <Field label="Modelo"><input value={form.model} onChange={set('model')} placeholder="Ex.: Latitude 3420" required /></Field>
        <Field label="Tipo">
          <select value={form.type} onChange={set('type')}><option value="notebook">Notebook</option><option value="desktop">Desktop</option></select>
        </Field>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Cadastrar modelo'}</button>
      </div>
    </form>
  );
}

export default function Models() {
  const { data, loading, error, reload } = useAsync(() => api.models(), []);
  const [search, setSearch] = useState('');
  const [noPhoto, setNoPhoto] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);

  const all = data ?? [];
  const q = search.trim().toLowerCase();
  const shown = all.filter((m) => (!q || `${m.brand} ${m.model}`.toLowerCase().includes(q)) && (!noPhoto || !m.has_photo));
  const withoutPhoto = all.filter((m) => !m.has_photo).length;
  const key = (m) => `${m.brand}|${m.model}`;

  async function savePhoto(m, photo_url, text) {
    setBusy(key(m));
    try {
      await api.saveModel({ brand: m.brand, model: m.model, type: m.type, photo_url });
      setNotice({ type: 'ok', text });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
    setBusy('');
  }

  async function upload(m, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await savePhoto(m, await fileToDataUrl(file, 640), `Foto de ${m.brand} ${m.model} atualizada: vale para ${m.assets} equipamento(s).`);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  async function remove(m) {
    if (!window.confirm(`Excluir o modelo ${m.brand} ${m.model}?`)) return;
    try {
      await api.deleteModel(m.id);
      setNotice({ type: 'ok', text: 'Modelo excluído.' });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  return (
    <>
      <PageHead
        title="Modelos e fotos"
        subtitle="Cadastre a foto uma vez: ela aparece automaticamente em todos os equipamentos do mesmo modelo."
        action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Novo modelo</button>}
      />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <div className="toolbar">
        <input type="search" placeholder="Buscar por marca ou modelo" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar modelos" />
        <Chip active={noPhoto} count={withoutPhoto} onClick={() => setNoPhoto(!noPhoto)}>Sem foto</Chip>
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && <p className="muted count-line">{shown.length} de {all.length} modelo(s) · {withoutPhoto} sem foto</p>}
      {data && shown.length === 0 && <p className="state">Nenhum modelo encontrado.</p>}

      <div className="asset-grid">
        {shown.map((m, i) => (
          <article className="asset-card" key={key(m)} style={{ '--i': Math.min(i, 10) }}>
            <div className="asset-media">
              <AssetPhoto asset={{ brand: m.brand, model: m.model, type: m.type, photo_url: m.photo }} />
              {!m.has_photo && <span className="badge badge-em_manutencao on-photo"><i className="dot" />Sem foto</span>}
            </div>
            <div className="asset-body">
              <h3>{m.brand} {m.model}</h3>
              <p className="muted">{TYPE_LABEL[m.type]} · {m.assets} equipamento(s)</p>
            </div>
            <div className="asset-actions">
              <label className={`btn btn-sm${busy === key(m) ? ' disabled' : ''}`}>
                <ImagePlus size={14} /> {busy === key(m) ? 'Enviando…' : m.has_photo ? 'Trocar foto' : 'Enviar foto'}
                <input type="file" accept="image/*" hidden disabled={busy === key(m)} onChange={(e) => upload(m, e)} />
              </label>
              {m.has_photo && <button className="btn btn-sm" onClick={() => savePhoto(m, null, 'Foto removida.')}><Trash2 size={14} /> Remover foto</button>}
              {m.id && m.assets === 0 && <button className="btn btn-sm" onClick={() => remove(m)}>Excluir</button>}
            </div>
          </article>
        ))}
      </div>

      {creating && (
        <Modal title="Novo modelo" onClose={() => setCreating(false)} wide>
          <ModelForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setNotice({ type: 'ok', text: 'Modelo cadastrado.' }); reload(); }} />
        </Modal>
      )}
    </>
  );
}
