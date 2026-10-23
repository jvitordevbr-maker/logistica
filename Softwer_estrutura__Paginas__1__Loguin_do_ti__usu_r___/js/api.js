const BASE = 'https://logisys-rota-01.puter.work';

export const state = {
  token: null,
  user: null,
  admin: false,
  screens: [],
  data: {
    products: [], clients: [], employees: [], fleet: [], drivers: [],
    movements: [], tripmaps: [], loads: [], deliveries: []
  }
};

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['x-token'] = state.token;
  let res;
  try {
    res = await fetch(BASE + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  } catch (e) {
    throw new Error('Sem conexão com o servidor. Tente novamente.');
  }
  const ct = res.headers.get('content-type') || '';
  const payload = ct.includes('json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw new Error((payload && payload.error) || 'Erro na operação.');
  return payload;
}

export const api = {
  photoUrl: (id) => BASE + '/photo/' + id,
  login: (username, password) => req('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => req('/logout', { method: 'POST', body: '{}' }),
  verify: (payload) => req('/verify', { method: 'POST', body: JSON.stringify(payload) }),
  state: () => req('/state'),
  save: (col, record) => req('/col/' + col, { method: 'POST', body: JSON.stringify({ record }) }),
  remove: (col, id, adminPassword) => req('/col/' + col + '/delete', { method: 'POST', body: JSON.stringify({ id, adminPassword }) }),
  entry: (payload) => req('/entry', { method: 'POST', body: JSON.stringify(payload) }),
  photo: (dataUrl) => req('/photo', { method: 'POST', body: JSON.stringify({ dataUrl }) }),
  saveMap: (record) => req('/tripmap', { method: 'POST', body: JSON.stringify({ record }) }),
  planMap: (id) => req('/tripmap/' + id + '/plan', { method: 'POST', body: '{}' }),
  approveMap: (id) => req('/tripmap/' + id + '/approve', { method: 'POST', body: '{}' }),
  loadItem: (id, payload) => req('/load/' + id + '/item', { method: 'POST', body: JSON.stringify(payload) }),
  releaseLoad: (id) => req('/load/' + id + '/release', { method: 'POST', body: '{}' }),
  finishDelivery: (id, payload) => req('/delivery/' + id + '/finish', { method: 'POST', body: JSON.stringify(payload) })
};

export async function refresh() {
  const s = await api.state();
  state.data = {
    products: s.products || [], clients: s.clients || [], employees: s.employees || [],
    fleet: s.fleet || [], drivers: s.drivers || [], movements: s.movements || [],
    tripmaps: s.tripmaps || [], loads: s.loads || [], deliveries: s.deliveries || []
  };
  state.user = s.me;
  state.admin = !!s.admin;
  state.screens = s.screens || [];
  return state;
}

export function findProduct(id) { return state.data.products.find(p => p.id === id); }
export function findClient(id) { return state.data.clients.find(c => c.id === id); }
export function findDriver(id) { return state.data.drivers.find(d => d.id === id); }
export function findVehicle(id) { return state.data.fleet.find(f => f.id === id); }
