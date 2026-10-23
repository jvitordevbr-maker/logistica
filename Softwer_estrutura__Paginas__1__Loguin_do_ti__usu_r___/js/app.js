import { api, state, refresh } from './api.js';
import { esc, initials, toast } from './ui.js';
import { SCREENS, icon } from './screens.js';
import { bus } from './bus.js';
import { renderProdutos, renderClientes, renderFrota, renderMotoristas } from './pages/cadastros.js';
import { renderEstoque, renderFinalizacao } from './pages/estoque.js';
import { renderFuncionarios } from './pages/funcionarios.js';
import { renderMapa } from './pages/mapa.js';
import { renderCarregamento } from './pages/carregamento.js';
import { renderEntrega, renderEntregues } from './pages/entrega.js';

const RENDERERS = {
  estoque: renderEstoque,
  finalizacao: renderFinalizacao,
  mapa: renderMapa,
  carregamento: renderCarregamento,
  entrega: renderEntrega,
  entregues: renderEntregues,
  produtos: renderProdutos,
  clientes: renderClientes,
  frota: renderFrota,
  motoristas: renderMotoristas,
  funcionarios: renderFuncionarios
};

const el = (id) => document.getElementById(id);
let current = null;

/* ---------- LOGIN ---------- */
function showLogin() {
  el('boot').classList.add('hidden');
  el('app-screen').classList.add('hidden');
  el('login-screen').classList.remove('hidden');
  el('login-user').focus();
}

el('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = el('login-btn'), errEl = el('login-error');
  errEl.classList.add('hidden');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const r = await api.login(el('login-user').value.trim(), el('login-pass').value);
    state.token = r.token;
    sessionStorage.setItem('logisys_token', r.token);
    el('login-pass').value = '';
    await enterApp();
  } catch (err) {
    errEl.textContent = err.message; errEl.classList.remove('hidden');
  }
  btn.disabled = false; btn.textContent = 'Entrar';
});

el('logout-btn').addEventListener('click', async () => {
  try { await api.logout(); } catch (e) {}
  state.token = null;
  sessionStorage.removeItem('logisys_token');
  showLogin();
});

/* ---------- APP ---------- */
function allowed() {
  if (state.admin) return SCREENS;
  const set = new Set(state.screens || []);
  return SCREENS.filter(s => !s.adminOnly && set.has(s.id));
}

function buildNav() {
  const nav = el('nav');
  const list = allowed();
  const groups = [...new Set(list.map(s => s.group))];
  nav.innerHTML = groups.map(g => `
    <div class="nav-section">${esc(g)}</div>
    ${list.filter(s => s.group === g).map(s => `
      <button class="nav-item ${current === s.id ? 'active' : ''}" data-nav="${s.id}">${icon(s.icon)}<span class="truncate">${esc(s.label)}</span></button>`).join('')}
  `).join('');
  nav.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { go(b.dataset.nav); closeSidebar(); }));
}

function go(id) {
  const list = allowed();
  if (!list.some(s => s.id === id)) { if (!list.length) return renderNoAccess(); id = list[0].id; }
  current = id;
  const screen = SCREENS.find(s => s.id === id);
  el('page-title').textContent = screen.label;
  buildNav();
  const view = el('view');
  view.innerHTML = '';
  try { RENDERERS[id](view); }
  catch (e) { view.innerHTML = `<div class="card"><div class="empty">Erro ao carregar a tela.</div></div>`; console.error(e); }
  window.scrollTo(0, 0);
}

function renderNoAccess() {
  el('page-title').textContent = 'Sem acesso';
  el('view').innerHTML = `<div class="card"><div class="empty">Nenhuma tela liberada para este usuário. Procure o administrador do TI.</div></div>`;
}

async function enterApp() {
  el('boot').classList.add('hidden');
  el('login-screen').classList.add('hidden');
  el('app-screen').classList.remove('hidden');
  await refresh();
  el('user-name').textContent = state.user ? state.user.name : '';
  el('user-role').textContent = state.admin ? 'Administrador TI' : (state.user && state.user.role) || 'Colaborador';
  el('user-avatar').textContent = initials(state.user ? state.user.name : '');
  buildNav();
  const list = allowed();
  go(current && list.some(s => s.id === current) ? current : (list[0] ? list[0].id : null));
}

bus.go = go;
bus.render = () => current && go(current);
bus.reload = async () => { try { await refresh(); go(current); } catch (e) { toast(e.message, 'err'); } };
bus.reloadSilent = async () => { try { await refresh(); } catch (e) {} };

el('refresh-btn').addEventListener('click', async () => {
  const btn = el('refresh-btn');
  if (!btn) return;
  btn.disabled = true;
  try { await bus.reload(); toast('Dados atualizados.'); }
  finally { const b = el('refresh-btn'); if (b) b.disabled = false; }
});

/* ---------- SIDEBAR MOBILE ---------- */
const sidebar = el('sidebar'), backdrop = el('sidebar-backdrop');
function closeSidebar() { sidebar.classList.remove('open'); backdrop.classList.add('hidden'); }
el('menu-btn').addEventListener('click', () => { sidebar.classList.add('open'); backdrop.classList.remove('hidden'); });
backdrop.addEventListener('click', closeSidebar);

/* ---------- BOOT ---------- */
(async () => {
  const t = sessionStorage.getItem('logisys_token');
  if (t) {
    state.token = t;
    try { await enterApp(); return; } catch (e) { state.token = null; sessionStorage.removeItem('logisys_token'); }
  }
  showLogin();
})();
