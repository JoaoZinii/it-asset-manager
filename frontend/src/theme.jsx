import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'light', setTheme: () => {} });

function initialTheme() {
  try {
    const saved = localStorage.getItem('itam-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* localStorage indisponível */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('itam-theme', theme); } catch { /* ignora */ }
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// Cores usadas nos gráficos (SVG do Recharts não lê variáveis CSS de forma confiável)
export const CHART_COLORS = {
  light: { text: '#5b6b80', grid: '#e1e7ef', tipBg: '#ffffff', tipText: '#14233a' },
  dark: { text: '#93a4bb', grid: '#243450', tipBg: '#17233a', tipText: '#e6edf7' },
};
