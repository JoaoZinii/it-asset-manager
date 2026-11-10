// Cliente HTTP simples. O proxy do Vite encaminha /api para o backend (porta 3001).
async function request(path, { method = 'GET', body, contentType } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': contentType ?? 'application/json' } : undefined,
      body: body ? (contentType ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Verifique se o backend está em execução.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* resposta sem JSON */ }
  if (!res.ok) {
    const detalhes = data?.details?.map((d) => `${d.campo}: ${d.mensagem}`).join(' | ');
    throw new Error([data?.error || `Erro ${res.status}`, detalhes].filter(Boolean).join(' '));
  }
  return data;
}

async function fetchBlob(path) {
  let res;
  try { res = await fetch(`/api${path}`); } catch { throw new Error('Não foi possível conectar ao servidor.'); }
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* sem JSON */ }
    throw new Error(msg);
  }
  return res.blob();
}

/** Salva um Blob/texto como arquivo no computador do usuário. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Baixa um arquivo gerado pela API (CSV, PDF) com um nome escolhido. */
export async function downloadFile(path, filename) {
  saveBlob(await fetchBlob(path), filename);
}

// Monta a query string ignorando valores vazios
const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  dashboard: () => request('/dashboard'),
  audit: () => request('/audit'),
  employees: (search) => request(`/employees${qs({ search })}`),
  createEmployee: (body) => request('/employees', { method: 'POST', body }),
  assets: (filters = {}) => request(`/assets${qs(filters)}`),
  createAsset: (body) => request('/assets', { method: 'POST', body }),
  updateAsset: (id, body) => request(`/assets/${id}`, { method: 'PATCH', body }),
  history: (id) => request(`/assets/${id}/history`),
  setStatus: (id, status) => request(`/assets/${id}/status`, { method: 'PATCH', body: { status } }),
  models: () => request('/models'),
  saveModel: (body) => request('/models', { method: 'PUT', body }),
  deleteModel: (id) => request(`/models/${id}`, { method: 'DELETE' }),
  maintenances: (status = 'aberto') => request(`/maintenances?status=${status}`),
  untrackedMaintenance: () => request('/maintenances/untracked'),
  createMaintenance: (body) => request('/maintenances', { method: 'POST', body }),
  closeMaintenance: (id, body) => request(`/maintenances/${id}/close`, { method: 'POST', body }),
  offboardings: (status = 'aberto') => request(`/offboardings?status=${status}`),
  offboardingCandidates: () => request('/offboardings/candidates'),
  createOffboarding: (body) => request('/offboardings', { method: 'POST', body }),
  closeOffboarding: (id) => request(`/offboardings/${id}/close`, { method: 'POST' }),
  deleteOffboarding: (id) => request(`/offboardings/${id}`, { method: 'DELETE' }),
  importEmployees: (text, dryRun) => request(`/import/employees${dryRun ? '?dry_run=true' : ''}`, { method: 'POST', body: text, contentType: 'text/csv' }),
  importCsv: (text, dryRun) => request(`/import/assets${dryRun ? '?dry_run=true' : ''}`, { method: 'POST', body: text, contentType: 'text/csv' }),
  openAssignments: () => request('/assignments/open'),
  deliver: (body) => request('/assignments', { method: 'POST', body }),
  returnAsset: (id, body) => request(`/assignments/${id}/return`, { method: 'POST', body }),
};
