import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Activity, ArrowRight, Boxes, CheckCircle2, Laptop, PackageCheck, ShieldAlert, TrendingDown, Unlink, UserMinus, UserX, Wrench, BellRing,
} from 'lucide-react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { useCountUp } from '../hooks/useCountUp.js';
import { CHART_COLORS, useTheme } from '../theme.jsx';
import { ErrorBox, Loading, PageHead } from '../components/ui.jsx';
import { STATUS_LABEL, TYPE_LABEL } from '../format.js';

const STATUS_COLORS = { disponivel: '#1e9e66', entregue: '#2a6fdb', em_manutencao: '#e08a12' };

function Kpi({ index, tone, icon: Icon, label, value, suffix = '', sub, progress }) {
  const shown = useCountUp(value);
  return (
    <div className={`kpi kpi-${tone}`} style={{ '--i': index }}>
      <div className="kpi-icon"><Icon size={34} strokeWidth={1.7} aria-hidden="true" /></div>
      <div className="kpi-body">
        <span className="kpi-label">{label}</span>
        <strong className="kpi-value">{shown}{suffix}</strong>
        <span className="kpi-sub">{sub}</span>
      </div>
      {progress != null && <div className="kpi-bar" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>}
    </div>
  );
}

function MiniKpi({ index, tone, icon: Icon, label, value, hint }) {
  const shown = useCountUp(value, 700);
  return (
    <div className="mini" style={{ '--i': index }}>
      <span className={`mini-icon mini-${tone}`}><Icon size={22} aria-hidden="true" /></span>
      <div>
        <span className="muted">{label}</span>
        <strong>{shown}</strong>
        <span className="muted">{hint}</span>
      </div>
    </div>
  );
}

const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
};

export default function Dashboard() {
  const { data, loading, error, reload } = useAsync(() => api.dashboard(), []);
  const { theme } = useTheme();
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;

  const c = CHART_COLORS[theme];
  const { assets, byType, byBrand, monthly, alerts } = data;
  const occupancy = assets.total ? Math.round((assets.entregue / assets.total) * 100) : 0;
  const leavers = alerts.leaversWithEquipment ?? 0;
  const issues = alerts.employeesWithoutNotebook + alerts.deliveredWithoutOwner + alerts.ownedButNotDelivered + leavers;
  const deficit = Math.max(0, alerts.employeesWithoutNotebook - alerts.availableNotebooks);
  const typeText = byType.map((t) => `${t.total} ${TYPE_LABEL[t.type].toLowerCase()}${t.total === 1 ? '' : 's'}`).join(' · ');

  const donut = ['disponivel', 'entregue', 'em_manutencao']
    .map((s) => ({ key: s, name: STATUS_LABEL[s], value: assets[s] })).filter((d) => d.value > 0);
  const months = monthly.map((m) => ({ ...m, label: monthLabel(m.month) }));

  const tooltip = {
    contentStyle: { background: c.tipBg, border: `1px solid ${c.grid}`, borderRadius: 10, color: c.tipText, boxShadow: '0 8px 24px rgba(0,0,0,.18)' },
    itemStyle: { color: c.tipText },
    labelStyle: { color: c.tipText, fontWeight: 600 },
  };

  const alertItems = [
    { icon: UserMinus, n: leavers, text: 'desligados (ou em desligamento) com equipamento', tone: 'danger' },
    { icon: UserX, n: alerts.employeesWithoutNotebook, text: 'colaboradores ativos sem notebook', tone: 'warn' },
    { icon: Unlink, n: alerts.deliveredWithoutOwner, text: 'equipamentos “entregues” sem responsável', tone: 'danger' },
    { icon: ShieldAlert, n: alerts.ownedButNotDelivered, text: 'com responsável, mas sem status “entregue”', tone: 'danger' },
    { icon: PackageCheck, n: alerts.availableNotebooks, text: 'notebooks realmente disponíveis', tone: 'info' },
  ];

  return (
    <>
      <PageHead title="Dashboard" subtitle="Visão geral do parque de equipamentos." />

      <section className="kpis" aria-label="Indicadores principais">
        <Kpi index={0} tone="blue" icon={Boxes} label="Total de equipamentos" value={assets.total} sub={typeText} />
        <Kpi index={1} tone="teal" icon={Activity} label="Taxa de ocupação" value={occupancy} suffix="%" progress={occupancy}
          sub={`${assets.entregue} de ${assets.total} em uso`} />
        <Kpi index={2} tone="violet" icon={PackageCheck} label="Estoque livre" value={assets.disponivel}
          sub={`${alerts.availableNotebooks} notebook(s) prontos para entrega`} />
        <Kpi index={3} tone="orange" icon={BellRing} label="Alertas" value={issues}
          sub={`${leavers} desligado(s) c/ equipamento · ${alerts.employeesWithoutNotebook} sem notebook`} />
      </section>

      <section className="minis" aria-label="Indicadores de estoque">
        <MiniKpi index={4} tone="amber" icon={Wrench} label="Em manutenção" value={assets.em_manutencao} hint="fora de operação" />
        <MiniKpi index={5} tone={deficit > 0 ? 'red' : 'green'} icon={TrendingDown} label="Estoque crítico" value={deficit}
          hint={deficit > 0 ? 'notebooks faltando para a demanda' : 'estoque cobre a demanda'} />
        <MiniKpi index={6} tone="blue" icon={Laptop} label="Notebooks livres" value={alerts.availableNotebooks} hint="sem vínculo aberto" />
      </section>

      <section className="grid-3">
        <div className="panel rise" style={{ '--i': 7 }}>
          <h2>Distribuição por status</h2>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={68} outerRadius={100} paddingAngle={3} cornerRadius={6} stroke="none">
                  {donut.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key]} />)}
                </Pie>
                <Tooltip {...tooltip} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center"><strong>{assets.total}</strong><span>equipamentos</span></div>
          </div>
          <ul className="legend">
            {donut.map((d) => (
              <li key={d.key}>
                <i style={{ background: STATUS_COLORS[d.key] }} aria-hidden="true" />
                <span>{d.name}</span>
                <strong>{d.value}</strong>
                <span className="muted">{Math.round((d.value / assets.total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel rise" style={{ '--i': 8 }}>
          <h2>Distribuição por marca</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, byBrand.length * 54)}>
            <BarChart data={byBrand} layout="vertical" margin={{ left: 0, right: 28, top: 8, bottom: 8 }}>
              <defs>
                <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#2a6fdb" />
                  <stop offset="1" stopColor="#7a5af5" />
                </linearGradient>
              </defs>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="brand" width={70} axisLine={false} tickLine={false} tick={{ fill: c.text, fontSize: 13 }} />
              <Tooltip {...tooltip} cursor={{ fill: c.grid, opacity: 0.4 }} formatter={(v) => [v, 'Equipamentos']} />
              <Bar dataKey="total" fill="url(#brandGrad)" radius={[0, 8, 8, 0]} barSize={26}>
                <LabelList dataKey="total" position="right" style={{ fill: c.text, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel rise" style={{ '--i': 9 }}>
          <h2>Alertas da auditoria</h2>
          <ul className="alert-list">
            {alertItems.map((a) => {
              const Icon = a.n === 0 && a.tone !== 'info' ? CheckCircle2 : a.icon;
              const tone = a.n === 0 && a.tone !== 'info' ? 'ok' : a.tone;
              return (
                <li key={a.text}>
                  <span className={`alert-ico tone-${tone}`}><Icon size={18} aria-hidden="true" /></span>
                  <span className="alert-text">{a.text}</span>
                  <strong className={`pill tone-${tone}`}>{a.n}</strong>
                </li>
              );
            })}
          </ul>
          <p className={alerts.stockCoversDemand ? 'ok-text' : 'warn-text'}>
            {alerts.stockCoversDemand ? 'O estoque cobre a demanda de notebooks.' : 'O estoque NÃO cobre a demanda de notebooks.'}
          </p>
          <Link to="/auditoria" className="btn btn-primary">Ver auditoria completa <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="panel rise" style={{ '--i': 10 }}>
        <h2>Evolução mensal <span className="muted">· entregas e devoluções nos últimos 6 meses</span></h2>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={months} margin={{ left: -18, right: 12, top: 12, bottom: 0 }}>
            <defs>
              <linearGradient id="gEntregas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2a6fdb" stopOpacity={0.5} />
                <stop offset="1" stopColor="#2a6fdb" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gDevol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#1e9e66" stopOpacity={0.45} />
                <stop offset="1" stopColor="#1e9e66" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={c.grid} strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: c.text, fontSize: 13 }} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: c.text, fontSize: 13 }} />
            <Tooltip {...tooltip} />
            <Area type="monotone" dataKey="entregas" name="Entregas" stroke="#2a6fdb" strokeWidth={3} fill="url(#gEntregas)" dot={{ r: 4 }} />
            <Area type="monotone" dataKey="devolucoes" name="Devoluções" stroke="#1e9e66" strokeWidth={3} fill="url(#gDevol)" dot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
        <ul className="legend legend-row">
          <li><i style={{ background: '#2a6fdb' }} aria-hidden="true" /> Entregas</li>
          <li><i style={{ background: '#1e9e66' }} aria-hidden="true" /> Devoluções</li>
        </ul>
      </section>
    </>
  );
}
