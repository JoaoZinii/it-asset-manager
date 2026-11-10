import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, FileDown, FileSpreadsheet, FileUp, Upload } from 'lucide-react';
import { api, downloadFile, saveBlob } from '../api.js';
import { Notice, PageHead } from '../components/ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const EXPORTS = [
  { path: '/export/assets.csv', file: 'equipamentos', title: 'Equipamentos', text: 'Todos os equipamentos com status, responsável, site, hostname e etiqueta. No mesmo formato da importação.' },
  { path: '/export/employees.csv', file: 'colaboradores', title: 'Colaboradores', text: 'Colaboradores com RA, e-mail, login do AD, vínculo, situação e se possuem notebook.' },
  { path: '/export/movements.csv', file: 'movimentacoes', title: 'Movimentações', text: 'Histórico completo de entregas e devoluções, com datas e observações.' },
];

const TEMPLATE_ASSETS = [
  'patrimonio;service_tag;tipo;marca;modelo;status;site;hostname;etiqueta;observacoes;colaborador;departamento;ra;email',
  '0100;ST123ABC;notebook;Dell;Latitude 5440;entregue;Matriz;LAPTOP0100;C000100;Exemplo de observação;Maria Exemplo;TI;12345;maria.exemplo@empresa.com',
  '0101;ST456DEF;notebook;HP;ProBook 440 G11;disponivel;Matriz;;C000101;;;;;',
].join('\r\n');
const TEMPLATE_EMPLOYEES = [
  'colaborador;login_ad;email;ra;situacao;vinculo;data_fim;cargo;gestor;departamento;site',
  'Maria Exemplo;u123456;maria.exemplo@empresa.com;u123456;ativo;Employee;;Analista de Suporte;Chefe Exemplo;TI;Matriz',
  'João Exemplo;u654321;joao.exemplo@empresa.com;u654321;desativando;Employee;2026-12-31;;;;',
].join('\r\n');

// Excel em português costuma salvar CSV em ANSI (Windows-1252); tenta UTF-8 primeiro e cai para ele
async function readCsv(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Fluxo comum: escolher CSV -> simulação (nada é gravado) -> confirmar. */
function ImportPanel({ title, intro, template, templateName, run, stats, count, confirmLabel, doneText, refLabel, doneLink }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [fileName, setFileName] = useState('');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);

  async function pickFile(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    setNotice(null); setDone(null); setPreview(null); setFileName(file.name); setBusy('preview');
    try {
      const content = await readCsv(file);
      setText(content);
      setPreview(await run(content, true));
    } catch (err) {
      setText('');
      setNotice({ type: 'error', text: err.message });
    }
    setBusy('');
  }

  async function confirm() {
    setBusy('import');
    try {
      setDone(await run(text, false));
      setPreview(null); setText(''); setFileName('');
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
    setBusy('');
  }

  function errorReport(errors) {
    const rows = ['linha;referencia;motivo', ...errors.map((e) => [e.line, e.ref, e.motivo].map(csvCell).join(';'))];
    saveBlob(new Blob([`\uFEFF${rows.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), `erros-importacao-${today()}.csv`);
  }

  const shown = preview?.errors.slice(0, 100) ?? [];
  return (
    <>
      <h2 className="section-title">{title}</h2>
      <div className="panel">
        <p>{intro}</p>
        <Notice notice={notice} onClose={() => setNotice(null)} />
        <div className="import-actions">
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={pickFile} hidden />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy !== ''}>
            <FileUp size={16} /> {busy === 'preview' ? 'Analisando…' : 'Escolher arquivo CSV'}
          </button>
          <button className="btn" onClick={() => saveBlob(new Blob([`\uFEFF${template}\r\n`], { type: 'text/csv;charset=utf-8' }), templateName)}>
            <FileDown size={16} /> Baixar modelo
          </button>
          {fileName && <span className="muted">{fileName}</span>}
        </div>
      </div>

      {preview && (
        <div className="panel">
          <h2>Simulação — nada foi gravado ainda</h2>
          <div className="stats">
            {stats(preview).map((s) => (
              <div key={s.label} className={s.tone ? `stat-${s.tone}` : ''}><strong>{s.value}</strong><span className="muted">{s.label}</span></div>
            ))}
          </div>
          {preview.errors.length > 0 && (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Linha</th><th>{refLabel}</th><th>Motivo</th></tr></thead>
                  <tbody>{shown.map((e, i) => <tr key={i}><td>{e.line}</td><td>{e.ref || '—'}</td><td>{e.motivo}</td></tr>)}</tbody>
                </table>
              </div>
              {preview.errors.length > shown.length && <p className="muted">Mostrando {shown.length} de {preview.errors.length}. Baixe o relatório para ver todos.</p>}
            </>
          )}
          <div className="form-actions">
            {preview.errors.length > 0 && <button className="btn" onClick={() => errorReport(preview.errors)}><Download size={16} /> Relatório de problemas</button>}
            <button className="btn btn-primary" onClick={confirm} disabled={busy === 'import' || count(preview) === 0}>
              <Upload size={16} /> {busy === 'import' ? 'Gravando…' : confirmLabel(preview)}
            </button>
          </div>
          <p className="muted">As linhas com problema são ignoradas; as demais são gravadas.</p>
        </div>
      )}

      {done && (
        <div className="panel banner-ok-panel" role="status">
          <h2><CheckCircle2 size={20} aria-hidden="true" /> Concluído</h2>
          <p>{doneText(done)}{done.errors.length > 0 && ` ${done.errors.length} linha(s) foram ignoradas.`}</p>
          <Link to={doneLink.to} className="btn btn-primary">{doneLink.label}</Link>
        </div>
      )}
    </>
  );
}

export default function Data() {
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');

  async function exportFile(e) {
    setBusy(e.file);
    try { await downloadFile(e.path, `${e.file}-${today()}.csv`); } catch (err) { setNotice({ type: 'error', text: err.message }); }
    setBusy('');
  }

  return (
    <>
      <PageHead title="Importar / Exportar" subtitle="Carregue dados em massa e exporte relatórios em CSV (abre direto no Excel)." />
      <Notice notice={notice} onClose={() => setNotice(null)} />

      <h2 className="section-title">Exportar</h2>
      <div className="export-grid">
        {EXPORTS.map((e) => (
          <div className="panel export-card" key={e.file}>
            <span className="mini-icon mini-blue"><FileSpreadsheet size={22} aria-hidden="true" /></span>
            <div><h3>{e.title}</h3><p className="muted">{e.text}</p></div>
            <button className="btn" onClick={() => exportFile(e)} disabled={busy === e.file}>
              <Download size={16} /> {busy === e.file ? 'Gerando…' : 'Baixar CSV'}
            </button>
          </div>
        ))}
      </div>

      <ImportPanel
        title="Importar equipamentos"
        intro={<>Um equipamento por linha. Obrigatórias: <strong>patrimonio, service_tag, tipo, marca, modelo</strong>. Com <strong>colaborador</strong> e status <strong>entregue</strong>, o colaborador é criado (se não existir) e o vínculo é registrado.</>}
        template={TEMPLATE_ASSETS} templateName="modelo-equipamentos.csv" refLabel="Patrimônio"
        run={(text, dry) => api.importCsv(text, dry)}
        stats={(p) => [
          { label: 'linhas lidas', value: p.total_rows },
          { label: 'equipamentos a importar', value: p.imported.assets, tone: 'ok' },
          { label: 'colaboradores novos', value: p.imported.employees },
          { label: 'vínculos a registrar', value: p.imported.assignments },
          { label: 'linhas com problema', value: p.errors.length, tone: p.errors.length ? 'bad' : '' },
        ]}
        count={(p) => p.imported.assets}
        confirmLabel={(p) => `Confirmar importação de ${p.imported.assets} equipamento(s)`}
        doneText={(d) => `${d.imported.assets} equipamento(s), ${d.imported.employees} colaborador(es) novo(s) e ${d.imported.assignments} vínculo(s) registrados.`}
        doneLink={{ to: '/equipamentos', label: 'Ver equipamentos' }}
      />

      <ImportPanel
        title="Sincronizar colaboradores (AD)"
        intro={<>Atualiza colaboradores <strong>que já existem</strong> com dados do AD: <strong>ra, email, login_ad, situacao</strong> (ativo, desativando ou inativo), <strong>vinculo, data_fim, cargo, gestor, departamento</strong> e <strong>site</strong>. Só as colunas preenchidas são atualizadas. O colaborador é localizado por login, e-mail, RA ou nome. Ninguém é criado. Quem ficar inativo ou em desligamento e ainda tiver equipamento aparece na <strong>Auditoria</strong>.</>}
        template={TEMPLATE_EMPLOYEES} templateName="modelo-colaboradores-ad.csv" refLabel="Colaborador"
        run={(text, dry) => api.importEmployees(text, dry)}
        stats={(p) => [
          { label: 'linhas lidas', value: p.total_rows },
          { label: 'colaboradores a atualizar', value: p.updated, tone: 'ok' },
          { label: 'linhas com problema', value: p.errors.length, tone: p.errors.length ? 'bad' : '' },
        ]}
        count={(p) => p.updated}
        confirmLabel={(p) => `Confirmar atualização de ${p.updated} colaborador(es)`}
        doneText={(d) => `${d.updated} colaborador(es) atualizado(s).`}
        doneLink={{ to: '/auditoria', label: 'Ver auditoria' }}
      />
    </>
  );
}
