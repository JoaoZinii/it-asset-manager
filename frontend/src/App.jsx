import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowLeftRight, Boxes, ClipboardCheck, FileSpreadsheet, Images, Laptop, LayoutDashboard, Moon, Sun, UserMinus, Users, Wrench } from 'lucide-react';
import { useTheme } from './theme.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Assets from './pages/Assets.jsx';
import Employees from './pages/Employees.jsx';
import Movements from './pages/Movements.jsx';
import Audit from './pages/Audit.jsx';
import Data from './pages/Data.jsx';
import Models from './pages/Models.jsx';
import Maintenance from './pages/Maintenance.jsx';
import Offboardings from './pages/Offboardings.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/equipamentos', label: 'Equipamentos', icon: Laptop },
  { to: '/modelos', label: 'Modelos e fotos', icon: Images },
  { to: '/colaboradores', label: 'Colaboradores', icon: Users },
  { to: '/movimentacoes', label: 'Movimentações', icon: ArrowLeftRight },
  { to: '/manutencao', label: 'Manutenção', icon: Wrench },
  { to: '/desligamentos', label: 'Desligamentos', icon: UserMinus },
  { to: '/auditoria', label: 'Auditoria', icon: ClipboardCheck },
  { to: '/dados', label: 'Importar / Exportar', icon: FileSpreadsheet },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Tema da interface">
      <button type="button" className={theme === 'light' ? 'on' : ''} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
        <Sun size={16} aria-hidden="true" /> Light
      </button>
      <button type="button" className={theme === 'dark' ? 'on' : ''} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
        <Moon size={16} aria-hidden="true" /> Dark
      </button>
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const current = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo"><Boxes size={22} aria-hidden="true" /></span>
          <div>
            <strong>IT Asset Manager</strong>
            <span>Gestão de ativos de TI</span>
          </div>
        </div>
        <nav aria-label="Principal">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={19} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-foot">Uso interno de TI</p>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="crumb">{current?.label ?? 'IT Asset Manager'}</span>
          <ThemeToggle />
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/equipamentos" element={<Assets />} />
            <Route path="/modelos" element={<Models />} />
            <Route path="/colaboradores" element={<Employees />} />
            <Route path="/manutencao" element={<Maintenance />} />
            <Route path="/desligamentos" element={<Offboardings />} />
            <Route path="/movimentacoes" element={<Movements />} />
            <Route path="/auditoria" element={<Audit />} />
            <Route path="/dados" element={<Data />} />
            <Route path="*" element={<p>Página não encontrada.</p>} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
