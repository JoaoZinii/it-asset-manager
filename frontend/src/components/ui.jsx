import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, X } from 'lucide-react';
import { STATUS_LABEL } from '../format.js';

export function StatusBadge({ status, className = '' }) {
  return (
    <span className={`badge badge-${status} ${className}`}>
      <i className="dot" aria-hidden="true" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Abas de seleção única com contador (ex.: status). options: [{ value, label, count, dot? }] */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={`tab${value === o.value ? ' on' : ''}`} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.dot && <i className={`dot dot-${o.dot}`} aria-hidden="true" />}
          {o.label}
          <span className="tab-count">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

/** Lista suspensa com várias escolhas e contador. options: [{ value, count }] */
export function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const shown = options.filter((o) => o.value.toLowerCase().includes(q.toLowerCase()));
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="ms" ref={ref}>
      <button type="button" className={`ms-btn${selected.length ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
        {selected.length > 0 && <span className="ms-badge">{selected.length}</span>}
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="ms-pop">
          {options.length > 8 && <input className="ms-search" placeholder={`Buscar ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />}
          <ul>
            {shown.length === 0 && <li className="muted ms-empty">Nada encontrado</li>}
            {shown.map((o) => (
              <li key={o.value}>
                <label className="ms-opt">
                  <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                  <span>{o.value}</span>
                  <span className="tab-count">{o.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Chip({ active, count, onClick, children }) {
  return (
    <button type="button" className={`chip${active ? ' chip-on' : ''}`} aria-pressed={active} onClick={onClick}>
      {children}
      {count != null && <span className="chip-count">{count}</span>}
    </button>
  );
}

const initials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};
const hueOfName = (name = '') => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 11);

export function Avatar({ name, size = 28 }) {
  return (
    <span className="avatar" style={{ '--h': hueOfName(name), width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Loading({ text = 'Carregando…' }) {
  return <div className="state" role="status"><span className="spinner" aria-hidden="true" />{text}</div>;
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <p>{message}</p>
      {onRetry && <button className="btn" onClick={onRetry}>Tentar novamente</button>}
    </div>
  );
}

export function Notice({ notice, onClose }) {
  if (!notice) return null;
  const Icon = notice.type === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div className={`notice notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <span>{notice.text}</span>
      {notice.action && <button className="btn btn-sm" onClick={notice.action.onClick}>{notice.action.label}</button>}
      <button className="icon-btn" onClick={onClose} aria-label="Fechar aviso"><X size={16} /></button>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function PageHead({ title, subtitle, action }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
