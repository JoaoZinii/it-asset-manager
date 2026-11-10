import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { Avatar, ErrorBox, Field, Loading, Modal, Notice, PageHead } from '../components/ui.jsx';

function Situacao({ e }) {
  if (!e.active || e.ad_status === 'inativo') return <span className="badge badge-danger"><i className="dot" />Inativo</span>;
  if (e.ad_status === 'desativando') {
    return <span className="badge badge-em_manutencao"><i className="dot" />Em desligamento{e.end_date ? ` · ${e.end_date.split('-').reverse().join('/')}` : ''}</span>;
  }
  return <span className="badge badge-disponivel"><i className="dot" />Ativo</span>;
}

function EmployeeForm({ onSaved, onCancel }) {
  const [form, setForm] = useState({ registration: '', name: '', email: '', department: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createEmployee(form);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <Field label="RA"><input value={form.registration} onChange={set('registration')} placeholder="E009" required /></Field>
      <Field label="Nome completo"><input value={form.name} onChange={set('name')} required /></Field>
      <Field label="E-mail"><input type="email" value={form.email} onChange={set('email')} required /></Field>
      <Field label="Departamento"><input value={form.department} onChange={set('department')} required /></Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Cadastrar colaborador'}</button>
      </div>
    </form>
  );
}

export default function Employees() {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null);
  const debounced = useDebounce(search);
  const { data, loading, error, reload } = useAsync(() => api.employees(debounced), [debounced]);

  return (
    <>
      <PageHead
        title="Colaboradores"
        subtitle="Pessoas que podem receber equipamentos."
        action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Novo colaborador</button>}
      />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <div className="toolbar">
        <input type="search" placeholder="Buscar por nome, RA, e-mail, cargo, departamento ou site"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar colaboradores" />
        {loading && data && <span className="muted">Atualizando…</span>}
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (data.length === 0 ? (
        <p className="state">Nenhum colaborador encontrado.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>RA</th><th>Nome</th><th>E-mail</th><th>Cargo</th><th>Departamento</th><th>Site</th><th>Vínculo</th><th>Situação</th><th>Notebook</th></tr></thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id}>
                  <td>{e.registration ?? '—'}</td>
                  <td><span className="person"><Avatar name={e.name} /><strong>{e.name}</strong></span></td>
                  <td>{e.email ?? '—'}</td>
                  <td>{e.job_title ?? '—'}</td>
                  <td>{e.department}</td>
                  <td>{e.site ?? '—'}</td>
                  <td>{e.category ?? '—'}</td>
                  <td><Situacao e={e} /></td>
                  <td>
                    {e.has_notebook
                      ? <span className="badge badge-disponivel">Com notebook</span>
                      : <span className="badge badge-em_manutencao">Sem notebook</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {creating && (
        <Modal title="Novo colaborador" onClose={() => setCreating(false)}>
          <EmployeeForm
            onCancel={() => setCreating(false)}
            onSaved={() => { setCreating(false); setNotice({ type: 'ok', text: 'Colaborador cadastrado.' }); reload(); }}
          />
        </Modal>
      )}
    </>
  );
}
