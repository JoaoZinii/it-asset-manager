import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { ErrorBox, Loading, PageHead, StatusBadge } from '../components/ui.jsx';
import { TYPE_LABEL } from '../format.js';

function Section({ title, description, items, empty, neutral, children }) {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        <span className={`counter ${neutral ? "counter-info" : items.length > 0 ? "counter-warn" : "counter-ok"}`} aria-label={`${items.length} itens`}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? <p className="ok-text">{empty}</p> : <div className="table-wrap">{children}</div>}
    </section>
  );
}

const assetCols = (a) => (
  <>
    <td><strong>{a.asset_tag}</strong></td>
    <td>{a.service_tag}</td>
    <td>{TYPE_LABEL[a.type]} {a.brand} {a.model}</td>
  </>
);

export default function Audit() {
  const { data, loading, error, reload } = useAsync(() => api.audit(), []);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;

  const { summary: s } = data;
  const leavers = data.leaversWithEquipment ?? [];
  const missing = s.employeesWithoutNotebook - s.availableNotebooks;

  return (
    <>
      <PageHead title="Auditoria" subtitle="Inconsistências entre cadastro, status e vínculos." />

      <div className={`banner ${s.stockCoversDemand ? 'banner-ok' : 'banner-warn'}`} role="status">
        {s.stockCoversDemand
          ? `O estoque cobre a demanda: ${s.availableNotebooks} notebook(s) disponível(is) para ${s.employeesWithoutNotebook} colaborador(es) sem notebook.`
          : `O estoque não cobre a demanda: faltam ${missing} notebook(s) (${s.availableNotebooks} disponível(is) para ${s.employeesWithoutNotebook} colaborador(es) sem notebook).`}
      </div>

      <Section title="Desligados com equipamento" description="Colaboradores inativos ou em desligamento no AD que ainda estão com equipamento. Programe a devolução."
        items={leavers} empty="Nenhum desligado com equipamento.">
        <table>
          <thead><tr><th>Colaborador</th><th>Situação</th><th>Fim</th><th>Chamado</th><th>Patrimônio</th><th>Equipamento</th><th>Site</th></tr></thead>
          <tbody>
            {leavers.map((l) => (
              <tr key={l.assignment_id}>
                <td><strong>{l.employee_name}</strong></td>
                <td>{l.ad_status === 'inativo' || (!l.active && !l.offboarding_id) ? <span className="badge badge-danger"><i className="dot" />Inativo</span> : <span className="badge badge-em_manutencao"><i className="dot" />Em desligamento</span>}</td>
                <td>{l.end_date ? l.end_date.slice(0, 10).split('-').reverse().join('/') : '—'}</td>
                <td>{l.ticket ?? '—'}</td>
                <td><strong>{l.asset_tag}</strong></td>
                <td>{TYPE_LABEL[l.type]} {l.brand} {l.model}</td>
                <td>{l.site ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Link to="/desligamentos" className="link section-link">Acompanhar em Desligamentos</Link>
      </Section>

      <Section title="Colaboradores sem notebook" description="Colaboradores ativos sem nenhum notebook em uso."
        items={data.employeesWithoutNotebook} empty="Todos os colaboradores ativos têm notebook.">
        <table>
          <thead><tr><th>RA</th><th>Nome</th><th>Departamento</th><th>E-mail</th></tr></thead>
          <tbody>
            {data.employeesWithoutNotebook.map((e) => (
              <tr key={e.id}><td>{e.registration ?? '—'}</td><td><strong>{e.name}</strong></td><td>{e.department}</td><td>{e.email ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Entregues sem responsável" description='Status "entregue", mas nenhum vínculo aberto. Verifique quem está com o equipamento.'
        items={data.deliveredWithoutOwner} empty="Nenhuma inconsistência encontrada.">
        <table>
          <thead><tr><th>Patrimônio</th><th>Service Tag</th><th>Equipamento</th><th>Status</th></tr></thead>
          <tbody>
            {data.deliveredWithoutOwner.map((a) => (
              <tr key={a.id}>{assetCols(a)}<td><StatusBadge status={a.status} /></td></tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Com responsável, mas sem status “entregue”" description="Existe vínculo aberto, porém o status do equipamento é outro."
        items={data.ownedButNotDelivered} empty="Nenhuma inconsistência encontrada.">
        <table>
          <thead><tr><th>Patrimônio</th><th>Service Tag</th><th>Equipamento</th><th>Status atual</th><th>Responsável</th></tr></thead>
          <tbody>
            {data.ownedButNotDelivered.map((a) => (
              <tr key={a.id}>{assetCols(a)}<td><StatusBadge status={a.status} /></td><td>{a.employee_name}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section neutral title="Notebooks disponíveis" description="Disponíveis e sem vínculo aberto: prontos para entrega."
        items={data.availableNotebooks} empty="Nenhum notebook disponível no estoque.">
        <table>
          <thead><tr><th>Patrimônio</th><th>Service Tag</th><th>Equipamento</th></tr></thead>
          <tbody>
            {data.availableNotebooks.map((a) => <tr key={a.id}>{assetCols(a)}</tr>)}
          </tbody>
        </table>
      </Section>
    </>
  );
}
