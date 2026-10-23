import { api, state } from '../api.js';
import { esc, fmtDate, toast, openModal, askPassword } from '../ui.js';
import { SCREENS } from '../screens.js';
import { bus } from '../bus.js';

export function renderFuncionarios(view) {
  if (!state.admin) {
    view.innerHTML = `<div class="card"><div class="empty">Acesso restrito ao administrador do TI.</div></div>`;
    return;
  }
  const emps = state.data.employees;
  view.innerHTML = `
    <div class="flex items-center gap-3 mb-5">
      <div class="flex-1"><p class="text-[13px] text-slate-500">Somente o administrador tem acesso a esta tela.</p></div>
      <button id="emp-add" class="btn btn-primary">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Novo funcionário</button>
    </div>
    <div class="card overflow-hidden"><div class="overflow-x-auto">
      <table class="data"><thead><tr><th>Funcionário</th><th>Usuário</th><th>Função</th><th>Telefone</th><th>Telas liberadas</th><th>Criado em</th><th></th></tr></thead>
      <tbody id="emp-rows"></tbody></table></div></div>`;
  const rows = view.querySelector('#emp-rows');
  if (!emps.length) rows.innerHTML = `<tr><td colspan="7"><div class="empty">Nenhum funcionário cadastrado.</div></td></tr>`;
  else rows.innerHTML = emps.map(e => `
    <tr>
      <td class="font-medium">${esc(e.name)}</td>
      <td class="font-mono text-[12.5px]">${esc(e.username)}</td>
      <td class="text-slate-600">${esc(e.role || '—')}</td>
      <td class="text-slate-600">${esc(e.phone || '—')}</td>
      <td><span class="badge badge-blue">${(e.screens || []).length} de ${SCREENS.length}</span></td>
      <td class="text-slate-500 whitespace-nowrap">${fmtDate(e.createdAt)}</td>
      <td class="text-right whitespace-nowrap">
        <button class="btn btn-ghost h-8 px-2.5 text-[13px]" data-edit="${e.id}">Editar</button>
        <button class="btn btn-ghost h-8 px-2.5 text-[13px] text-red-600" data-del="${e.id}">Excluir</button>
      </td>
    </tr>`).join('');

  rows.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => employeeForm(emps.find(e => e.id === b.dataset.edit))));
  rows.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    const pass = await askPassword({ title: 'Senha do TI', kind: 'admin', message: 'Confirme para excluir o funcionário.' });
    if (!pass) return;
    try { await api.remove('employees', b.dataset.del, pass); toast('Funcionário excluído.', 'ok'); bus.reload(); } catch (e) { toast(e.message, 'err'); }
  }));
  view.querySelector('#emp-add').addEventListener('click', () => employeeForm());
}

function employeeForm(rec = null) {
  const v = rec || {};
  const cur = new Set(v.screens || []);
  const groups = [...new Set(SCREENS.map(s => s.group))];
  openModal({
    title: rec ? 'Editar funcionário' : 'Cadastro de funcionário',
    subtitle: 'Defina os dados de acesso e as telas liberadas.',
    width: '600px',
    body: `
      <div class="space-y-4">
        <div class="grid sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2"><label class="label">Nome completo</label><input data-f="name" class="input" value="${esc(v.name || '')}"></div>
          <div><label class="label">Telefone</label><input data-f="phone" class="input" value="${esc(v.phone || '')}"></div>
          <div><label class="label">Função</label><input data-f="role" class="input" placeholder="Ex.: Estoquista" value="${esc(v.role || '')}"></div>
          <div><label class="label">Nome de usuário</label><input data-f="username" class="input font-mono" placeholder="joao001" value="${esc(v.username || '')}"></div>
          <div><label class="label">Senha de acesso</label><input data-f="password" class="input" placeholder="${rec ? 'Deixe em branco para manter' : '••••••'}"></div>
        </div>
        <div class="pt-3 border-t border-slate-100">
          <p class="text-[12.5px] font-semibold text-slate-700 mb-1 mt-2">Telas de acesso</p>
          <p class="text-[12.5px] text-slate-500 mb-3">Marque as telas que este usuário poderá abrir.</p>
          ${groups.map(g => `
            <div class="mb-3">
              <div class="text-[11px] uppercase tracking-wide text-slate-400 mb-2">${esc(g)}</div>
              <div class="grid sm:grid-cols-2 gap-1.5">
                ${SCREENS.filter(s => s.group === g).map(s => `
                  <label class="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 ${s.adminOnly ? 'opacity-50' : ''}">
                    <input type="checkbox" class="accent-blue-600 w-4 h-4" data-screen="${s.id}" ${cur.has(s.id) ? 'checked' : ''} ${s.adminOnly ? 'disabled' : ''}>
                    <span class="text-[13px]">${esc(s.label)}</span>
                  </label>`).join('')}
              </div>
            </div>`).join('')}
        </div>
        <p data-err class="text-sm text-red-600 hidden"></p>
      </div>`,
    footer: `<button data-close class="btn btn-secondary">Cancelar</button><button data-save class="btn btn-primary">Salvar funcionário</button>`,
    onMount(wrap, close) {
      const errEl = wrap.querySelector('[data-err]');
      wrap.querySelector('[data-save]').addEventListener('click', async (e) => {
        const out = rec ? { id: rec.id } : {};
        wrap.querySelectorAll('[data-f]').forEach(i => out[i.dataset.f] = i.value.trim());
        out.screens = [...wrap.querySelectorAll('[data-screen]')].filter(c => c.checked).map(c => c.dataset.screen);
        if (!out.name || !out.username) { errEl.textContent = 'Informe nome e nome de usuário.'; errEl.classList.remove('hidden'); return; }
        if (!rec && !out.password) { errEl.textContent = 'Informe a senha de acesso.'; errEl.classList.remove('hidden'); return; }
        if (rec && !out.password) delete out.password;
        e.target.disabled = true; e.target.innerHTML = '<span class="spinner"></span>';
        try { await api.save('employees', out); close(); toast('Funcionário salvo.', 'ok'); bus.reload(); }
        catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); e.target.disabled = false; e.target.textContent = 'Salvar funcionário'; }
      });
    }
  });
}
