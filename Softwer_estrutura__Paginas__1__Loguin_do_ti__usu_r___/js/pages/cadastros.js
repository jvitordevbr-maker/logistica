import { api, state } from '../api.js';
import { esc, fmtDate, toast, openModal, askPassword, confirmDialog } from '../ui.js';
import { bus } from '../bus.js';

const CATEGORIAS = ['Tanques', 'Caixas d\'água', 'Conexões', 'Acessórios', 'Ferramentas', 'Embalagens', 'Outros'];

/* =================== PRODUTOS =================== */
export function renderProdutos(view) {
  const products = [...state.data.products].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  view.innerHTML = `
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <div class="flex-1 min-w-[200px]">
        <input id="prd-search" class="input" placeholder="Buscar por código, nome ou categoria…">
      </div>
      <button id="prd-add" class="btn btn-primary">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Adicionar produto
      </button>
      <button id="prd-del" class="btn btn-secondary" disabled>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Apagar produto
      </button>
    </div>
    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="data">
          <thead><tr><th style="width:36px"></th><th>Código de barras</th><th>Produto</th><th>Categoria</th><th>Observação</th><th>Saldo</th><th>Criado em</th></tr></thead>
          <tbody id="prd-rows"></tbody>
        </table>
      </div>
    </div>
    <p class="text-[12.5px] text-slate-500 mt-3">Selecione um produto na lista para habilitar a exclusão. A exclusão exige a senha do TI.</p>`;

  let selected = null;
  const rows = view.querySelector('#prd-rows');
  const delBtn = view.querySelector('#prd-del');

  const draw = (list) => {
    if (!list.length) { rows.innerHTML = `<tr><td colspan="7"><div class="empty">Nenhum produto cadastrado.</div></td></tr>`; return; }
    rows.innerHTML = list.map(p => `
      <tr class="clickable ${selected === p.id ? 'selected' : ''}" data-id="${p.id}">
        <td><input type="radio" name="prdsel" ${selected === p.id ? 'checked' : ''} class="accent-blue-600"></td>
        <td class="font-mono text-[12.5px]">${esc(p.code)}</td>
        <td class="font-medium">${esc(p.name)}</td>
        <td><span class="badge badge-gray">${esc(p.category || '—')}</span></td>
        <td class="text-slate-500 max-w-[260px] truncate">${esc(p.note || '—')}</td>
        <td class="font-semibold">${p.stock || 0}</td>
        <td class="text-slate-500 whitespace-nowrap">${fmtDate(p.createdAt)}</td>
      </tr>`).join('');
    rows.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => {
      selected = selected === tr.dataset.id ? null : tr.dataset.id;
      delBtn.disabled = !selected;
      draw(list);
    }));
  };
  draw(products);

  view.querySelector('#prd-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    draw(products.filter(p => [p.code, p.name, p.category, p.note].join(' ').toLowerCase().includes(q)));
  });

  view.querySelector('#prd-add').addEventListener('click', () => productForm());
  delBtn.addEventListener('click', async () => {
    const p = state.data.products.find(x => x.id === selected);
    if (!p) return;
    const okC = await confirmDialog({ title: 'Apagar produto', message: `Deseja realmente apagar "${p.name}"? Esta ação não pode ser desfeita.`, confirmLabel: 'Apagar', danger: true });
    if (!okC) return;
    const pass = await askPassword({ title: 'Senha do TI', kind: 'admin', message: 'Para apagar um produto é necessária a senha do TI.' });
    if (!pass) return;
    try { await api.remove('products', p.id, pass); toast('Produto apagado.', 'ok'); bus.reload(); }
    catch (e) { toast(e.message, 'err'); }
  });
}

function productForm() {
  openModal({
    title: 'Adicionar produto',
    subtitle: 'Preencha os dados do produto.',
    body: `
      <div class="space-y-4">
        <div>
          <label class="label">Código de barras</label>
          <div class="flex gap-2">
            <input data-f="code" class="input font-mono" placeholder="7891234567890" inputmode="numeric">
            <button type="button" data-scan class="btn btn-secondary" title="Ler com a câmera">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="11" y1="8" x2="11" y2="16"/><line x1="15" y1="8" x2="15" y2="16"/><line x1="18" y1="8" x2="18" y2="16"/></svg>
            </button>
          </div>
        </div>
        <div><label class="label">Nome do produto</label><input data-f="name" class="input" placeholder="Tanque 500L AP"></div>
        <div><label class="label">Categoria</label>
          <select data-f="category" class="select"><option value="">Selecione…</option>${CATEGORIAS.map(c => `<option>${c}</option>`).join('')}</select>
        </div>
        <div><label class="label">Observação</label><textarea data-f="note" class="textarea" placeholder="Informações adicionais do produto"></textarea></div>
        <p data-err class="text-sm text-red-600 hidden"></p>
      </div>`,
    footer: `<button data-close class="btn btn-secondary">Cancelar</button><button data-save class="btn btn-primary">Salvar produto</button>`,
    onMount(wrap, close) {
      const g = (k) => wrap.querySelector(`[data-f="${k}"]`);
      const errEl = wrap.querySelector('[data-err]');
      wrap.querySelector('[data-scan]').addEventListener('click', async () => {
        const { scanBarcode } = await import('../ui.js');
        const code = await scanBarcode({ title: 'Ler código de barras', subtitle: 'Aponte para o código do produto.' });
        if (code) g('code').value = code;
      });
      wrap.querySelector('[data-save]').addEventListener('click', async (e) => {
        const rec = { code: g('code').value.trim(), name: g('name').value.trim(), category: g('category').value, note: g('note').value.trim() };
        if (!rec.code || !rec.name) { errEl.textContent = 'Código de barras e nome são obrigatórios.'; errEl.classList.remove('hidden'); return; }
        e.target.disabled = true; e.target.innerHTML = '<span class="spinner"></span>';
        try { await api.save('products', rec); close(); toast('Produto cadastrado.', 'ok'); bus.reload(); }
        catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); e.target.disabled = false; e.target.textContent = 'Salvar produto'; }
      });
    }
  });
}

/* =================== CLIENTES =================== */
export function renderClientes(view) {
  const clients = [...state.data.clients].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  view.innerHTML = `
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <div class="flex-1 min-w-[200px]"><input id="cli-search" class="input" placeholder="Buscar cliente, CNPJ ou cidade…"></div>
      <button id="cli-add" class="btn btn-primary">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Novo cliente</button>
    </div>
    <div class="card overflow-hidden"><div class="overflow-x-auto">
      <table class="data"><thead><tr><th>Cliente</th><th>CNPJ</th><th>Contato</th><th>E-mail</th><th>Cidade / UF</th><th></th></tr></thead>
      <tbody id="cli-rows"></tbody></table></div></div>`;
  const rows = view.querySelector('#cli-rows');
  const draw = (list) => {
    if (!list.length) { rows.innerHTML = `<tr><td colspan="6"><div class="empty">Nenhum cliente cadastrado.</div></td></tr>`; return; }
    rows.innerHTML = list.map(c => `
      <tr>
        <td class="font-medium">${esc(c.name)}</td>
        <td class="font-mono text-[12.5px] text-slate-600">${esc(c.cnpj || '—')}</td>
        <td class="text-slate-600">${esc(c.phone || '—')}</td>
        <td class="text-slate-600">${esc(c.email || '—')}</td>
        <td class="text-slate-600">${esc([c.city, c.state].filter(Boolean).join(' / ') || '—')}</td>
        <td class="text-right"><button class="btn btn-ghost h-8 px-2.5 text-[13px]" data-edit="${c.id}">Editar</button></td>
      </tr>`).join('');
    rows.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => clientForm(state.data.clients.find(x => x.id === b.dataset.edit))));
  };
  draw(clients);
  view.querySelector('#cli-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    draw(clients.filter(c => [c.name, c.cnpj, c.city, c.email].join(' ').toLowerCase().includes(q)));
  });
  view.querySelector('#cli-add').addEventListener('click', () => clientForm());
}

function clientForm(rec = null) {
  const v = rec || {};
  openModal({
    title: rec ? 'Editar cliente' : 'Cadastro de cliente',
    subtitle: 'Dados cadastrais e endereço completo.',
    width: '600px',
    body: `
      <div class="space-y-4">
        <div class="grid sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2"><label class="label">Nome / Razão social</label><input data-f="name" class="input" value="${esc(v.name || '')}"></div>
          <div><label class="label">CNPJ</label><input data-f="cnpj" class="input" placeholder="00.000.000/0000-00" value="${esc(v.cnpj || '')}"></div>
          <div><label class="label">Contato</label><input data-f="phone" class="input" placeholder="(16) 99999-0000" value="${esc(v.phone || '')}"></div>
          <div class="sm:col-span-2"><label class="label">E-mail</label><input data-f="email" type="email" class="input" value="${esc(v.email || '')}"></div>
        </div>
        <div class="pt-2 border-t border-slate-100">
          <p class="text-[12.5px] font-semibold text-slate-700 mb-3 mt-3">Endereço completo</p>
          <div class="grid sm:grid-cols-6 gap-4">
            <div class="sm:col-span-4"><label class="label">Rua / Logradouro</label><input data-f="street" class="input" value="${esc(v.street || '')}"></div>
            <div class="sm:col-span-2"><label class="label">Número</label><input data-f="number" class="input" value="${esc(v.number || '')}"></div>
            <div class="sm:col-span-3"><label class="label">Bairro</label><input data-f="district" class="input" value="${esc(v.district || '')}"></div>
            <div class="sm:col-span-3"><label class="label">CEP</label><input data-f="cep" class="input" value="${esc(v.cep || '')}"></div>
            <div class="sm:col-span-4"><label class="label">Cidade</label><input data-f="city" class="input" value="${esc(v.city || '')}"></div>
            <div class="sm:col-span-2"><label class="label">UF</label><input data-f="state" class="input" maxlength="2" placeholder="SP" value="${esc(v.state || '')}"></div>
            <div class="sm:col-span-6"><label class="label">Referência / observação</label><input data-f="ref" class="input" value="${esc(v.ref || '')}"></div>
          </div>
        </div>
        <p data-err class="text-sm text-red-600 hidden"></p>
      </div>`,
    footer: `<button data-close class="btn btn-secondary">Cancelar</button><button data-save class="btn btn-primary">Salvar cliente</button>`,
    onMount(wrap, close) {
      const errEl = wrap.querySelector('[data-err]');
      wrap.querySelector('[data-save]').addEventListener('click', async (e) => {
        const out = rec ? { id: rec.id } : {};
        wrap.querySelectorAll('[data-f]').forEach(i => out[i.dataset.f] = i.value.trim());
        if (!out.name) { errEl.textContent = 'Informe o nome do cliente.'; errEl.classList.remove('hidden'); return; }
        out.state = (out.state || '').toUpperCase();
        e.target.disabled = true; e.target.innerHTML = '<span class="spinner"></span>';
        try { await api.save('clients', out); close(); toast('Cliente salvo.', 'ok'); bus.reload(); }
        catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); e.target.disabled = false; e.target.textContent = 'Salvar cliente'; }
      });
    }
  });
}

/* =================== FROTA =================== */
export function renderFrota(view) {
  const fleet = state.data.fleet;
  view.innerHTML = `
    <div class="flex items-center gap-3 mb-5">
      <div class="flex-1"><p class="text-[13px] text-slate-500">Veículos disponíveis para roteirização e carregamento.</p></div>
      <button id="veh-add" class="btn btn-primary">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Novo veículo</button>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" id="veh-grid"></div>`;
  const grid = view.querySelector('#veh-grid');
  if (!fleet.length) grid.innerHTML = `<div class="card col-span-full"><div class="empty">Nenhum veículo cadastrado.</div></div>`;
  else grid.innerHTML = fleet.map(f => `
    <div class="card p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="font-semibold text-[15px] truncate">${esc(f.model)}</div>
          <div class="font-mono text-[13px] text-slate-500 mt-0.5">${esc(f.plate)}</div>
        </div>
        <span class="badge badge-blue">${esc(f.type || 'Caminhão')}</span>
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[13px]">
        <span class="text-slate-500">Lotação máxima</span><span class="font-medium">${esc(f.capacity || '—')}</span>
      </div>
      <div class="mt-3 flex gap-2">
        <button class="btn btn-secondary h-8 px-3 text-[13px] flex-1" data-edit="${f.id}">Editar</button>
        <button class="btn btn-ghost h-8 px-3 text-[13px] text-red-600" data-del="${f.id}">Excluir</button>
      </div>
    </div>`).join('');

  grid.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => vehicleForm(fleet.find(f => f.id === b.dataset.edit))));
  grid.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    const pass = await askPassword({ title: 'Senha do TI', kind: 'admin', message: 'Confirme para excluir o veículo.' });
    if (!pass) return;
    try { await api.remove('fleet', b.dataset.del, pass); toast('Veículo excluído.', 'ok'); bus.reload(); } catch (e) { toast(e.message, 'err'); }
  }));
  view.querySelector('#veh-add').addEventListener('click', () => vehicleForm());
}

function vehicleForm(rec = null) {
  const v = rec || {};
  openModal({
    title: rec ? 'Editar veículo' : 'Cadastro de frota',
    subtitle: 'Ex.: Iveco — placa RTD6548 — lotação 12 t',
    body: `
      <div class="space-y-4">
        <div><label class="label">Modelo / descrição</label><input data-f="model" class="input" placeholder="Iveco Daily" value="${esc(v.model || '')}"></div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div><label class="label">Placa</label><input data-f="plate" class="input font-mono uppercase" placeholder="RTD6548" value="${esc(v.plate || '')}"></div>
          <div><label class="label">Tipo</label>
            <select data-f="type" class="select">${['Caminhão', 'Carro', 'Van', 'Carreta'].map(t => `<option ${v.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          </div>
        </div>
        <div><label class="label">Lotação máxima</label><input data-f="capacity" class="input" placeholder="Ex.: 12 toneladas / 40 tanques" value="${esc(v.capacity || '')}"></div>
        <div><label class="label">Observação</label><input data-f="note" class="input" value="${esc(v.note || '')}"></div>
        <p data-err class="text-sm text-red-600 hidden"></p>
      </div>`,
    footer: `<button data-close class="btn btn-secondary">Cancelar</button><button data-save class="btn btn-primary">Salvar veículo</button>`,
    onMount(wrap, close) {
      const errEl = wrap.querySelector('[data-err]');
      wrap.querySelector('[data-save]').addEventListener('click', async (e) => {
        const out = rec ? { id: rec.id } : {};
        wrap.querySelectorAll('[data-f]').forEach(i => out[i.dataset.f] = i.value.trim());
        out.plate = (out.plate || '').toUpperCase();
        if (!out.model || !out.plate) { errEl.textContent = 'Informe modelo e placa.'; errEl.classList.remove('hidden'); return; }
        e.target.disabled = true; e.target.innerHTML = '<span class="spinner"></span>';
        try { await api.save('fleet', out); close(); toast('Veículo salvo.', 'ok'); bus.reload(); }
        catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); e.target.disabled = false; e.target.textContent = 'Salvar veículo'; }
      });
    }
  });
}

/* =================== MOTORISTAS =================== */
export function renderMotoristas(view) {
  const drivers = state.data.drivers;
  view.innerHTML = `
    <div class="flex items-center gap-3 mb-5">
      <div class="flex-1"><p class="text-[13px] text-slate-500">Motoristas disponíveis para as viagens.</p></div>
      <button id="drv-add" class="btn btn-primary">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Novo motorista</button>
    </div>
    <div class="card overflow-hidden"><div class="overflow-x-auto">
      <table class="data"><thead><tr><th>Motorista</th><th>CNH</th><th>Categoria</th><th>Telefone</th><th>Usuário vinculado</th><th></th></tr></thead>
      <tbody id="drv-rows"></tbody></table></div></div>`;
  const rows = view.querySelector('#drv-rows');
  if (!drivers.length) rows.innerHTML = `<tr><td colspan="6"><div class="empty">Nenhum motorista cadastrado.</div></td></tr>`;
  else rows.innerHTML = drivers.map(d => `
    <tr>
      <td class="font-medium">${esc(d.name)}</td>
      <td class="font-mono text-[12.5px] text-slate-600">${esc(d.cnh || '—')}</td>
      <td><span class="badge badge-gray">${esc(d.category || '—')}</span></td>
      <td class="text-slate-600">${esc(d.phone || '—')}</td>
      <td class="text-slate-600">${esc(d.username || '—')}</td>
      <td class="text-right whitespace-nowrap">
        <button class="btn btn-ghost h-8 px-2.5 text-[13px]" data-edit="${d.id}">Editar</button>
        <button class="btn btn-ghost h-8 px-2.5 text-[13px] text-red-600" data-del="${d.id}">Excluir</button>
      </td>
    </tr>`).join('');
  rows.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => driverForm(drivers.find(d => d.id === b.dataset.edit))));
  rows.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    const pass = await askPassword({ title: 'Senha do TI', kind: 'admin', message: 'Confirme para excluir o motorista.' });
    if (!pass) return;
    try { await api.remove('drivers', b.dataset.del, pass); toast('Motorista excluído.', 'ok'); bus.reload(); } catch (e) { toast(e.message, 'err'); }
  }));
  view.querySelector('#drv-add').addEventListener('click', () => driverForm());
}

function driverForm(rec = null) {
  const v = rec || {};
  const emps = state.data.employees;
  openModal({
    title: rec ? 'Editar motorista' : 'Cadastro de motorista',
    subtitle: 'Ex.: Rafael Eduardo dos Santos',
    body: `
      <div class="space-y-4">
        <div><label class="label">Nome completo</label><input data-f="name" class="input" value="${esc(v.name || '')}"></div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div><label class="label">CNH</label><input data-f="cnh" class="input" value="${esc(v.cnh || '')}"></div>
          <div><label class="label">Categoria</label>
            <select data-f="category" class="select">${['', 'A', 'B', 'C', 'D', 'E', 'AB', 'AD', 'AE'].map(c => `<option ${v.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div><label class="label">Telefone</label><input data-f="phone" class="input" value="${esc(v.phone || '')}"></div>
          <div><label class="label">Usuário de acesso</label>
            <select data-f="username" class="select">
              <option value="">Nenhum</option>
              ${emps.map(e => `<option value="${esc(e.username)}" ${v.username === e.username ? 'selected' : ''}>${esc(e.name)} (${esc(e.username)})</option>`).join('')}
            </select>
            <p class="text-[12px] text-slate-500 mt-1.5">Vincule o login que o motorista usa para ver suas entregas.</p>
          </div>
        </div>
        <p data-err class="text-sm text-red-600 hidden"></p>
      </div>`,
    footer: `<button data-close class="btn btn-secondary">Cancelar</button><button data-save class="btn btn-primary">Salvar motorista</button>`,
    onMount(wrap, close) {
      const errEl = wrap.querySelector('[data-err]');
      wrap.querySelector('[data-save]').addEventListener('click', async (e) => {
        const out = rec ? { id: rec.id } : {};
        wrap.querySelectorAll('[data-f]').forEach(i => out[i.dataset.f] = i.value.trim());
        if (!out.name) { errEl.textContent = 'Informe o nome do motorista.'; errEl.classList.remove('hidden'); return; }
        e.target.disabled = true; e.target.innerHTML = '<span class="spinner"></span>';
        try { await api.save('drivers', out); close(); toast('Motorista salvo.', 'ok'); bus.reload(); }
        catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); e.target.disabled = false; e.target.textContent = 'Salvar motorista'; }
      });
    }
  });
}
