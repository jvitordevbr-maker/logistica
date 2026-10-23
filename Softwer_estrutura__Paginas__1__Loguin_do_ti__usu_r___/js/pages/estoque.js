import { api, state } from '../api.js';
import { esc, fmtDate, toast, openModal, scanBarcode, askPassword } from '../ui.js';
import { bus } from '../bus.js';

/* =================== ESTOQUE =================== */
export function renderEstoque(view) {
  const products = [...state.data.products].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const total = products.reduce((s, p) => s + (p.stock || 0), 0);
  const zeros = products.filter(p => !(p.stock > 0)).length;
  view.innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <div class="stat"><div class="stat-v">${products.length}</div><div class="stat-l">Produtos cadastrados</div></div>
      <div class="stat"><div class="stat-v">${total}</div><div class="stat-l">Itens em estoque</div></div>
      <div class="stat"><div class="stat-v">${zeros}</div><div class="stat-l">Produtos sem saldo</div></div>
      <div class="stat"><div class="stat-v">${state.data.movements.length}</div><div class="stat-l">Movimentações</div></div>
    </div>
    <div class="mb-4"><input id="stk-search" class="input max-w-md" placeholder="Buscar produto ou código…"></div>
    <div class="card overflow-hidden"><div class="overflow-x-auto">
      <table class="data"><thead><tr><th>Código</th><th>Produto</th><th>Categoria</th><th>Saldo atual</th><th>Última movimentação</th><th></th></tr></thead>
      <tbody id="stk-rows"></tbody></table></div></div>
    <p class="text-[12.5px] text-slate-500 mt-3">Clique em um produto para ver todas as entradas e saídas com data, hora, responsável e RT.</p>`;

  const rows = view.querySelector('#stk-rows');
  const lastMov = (id) => state.data.movements.filter(m => m.productId === id).sort((a, b) => b.at - a.at)[0];
  const draw = (list) => {
    if (!list.length) { rows.innerHTML = `<tr><td colspan="6"><div class="empty">Nenhum produto encontrado.</div></td></tr>`; return; }
    rows.innerHTML = list.map(p => {
      const m = lastMov(p.id);
      return `<tr class="clickable" data-id="${p.id}">
        <td class="font-mono text-[12.5px]">${esc(p.code)}</td>
        <td class="font-medium">${esc(p.name)}</td>
        <td class="text-slate-600">${esc(p.category || '—')}</td>
        <td><span class="badge ${p.stock > 0 ? 'badge-green' : 'badge-gray'}">${p.stock || 0} un</span></td>
        <td class="text-slate-500 whitespace-nowrap">${m ? fmtDate(m.at) : '—'}</td>
        <td class="text-right text-slate-400">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="inline"><polyline points="9 18 15 12 9 6"/></svg>
        </td></tr>`;
    }).join('');
    rows.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => movementsModal(tr.dataset.id)));
  };
  draw(products);
  view.querySelector('#stk-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    draw(products.filter(p => [p.code, p.name, p.category].join(' ').toLowerCase().includes(q)));
  });
}

function movementsModal(productId) {
  const p = state.data.products.find(x => x.id === productId);
  if (!p) return;
  const movs = state.data.movements.filter(m => m.productId === productId).sort((a, b) => b.at - a.at);
  const rows = movs.length ? movs.map(m => `
    <div class="flex gap-3 py-3 border-b border-slate-100 last:border-0">
      <div class="timeline-dot ${m.type === 'entrada' ? 'bg-green-500' : 'bg-amber-500'}"></div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center flex-wrap gap-2">
          <span class="badge ${m.type === 'entrada' ? 'badge-green' : 'badge-amber'}">${m.type === 'entrada' ? 'Entrada' : 'Saída para carregamento'}</span>
          <span class="text-[13px] font-medium">${m.type === 'entrada' ? '+' : '−'}${m.qty} un</span>
        </div>
        <div class="text-[13px] text-slate-600 mt-1.5">RT: <span class="font-mono">${esc(m.rt || '—')}</span></div>
        <div class="text-[12.5px] text-slate-500 mt-0.5">${esc(m.user || '—')} • ${fmtDate(m.at)}</div>
        ${m.note ? `<div class="text-[12.5px] text-slate-500 mt-0.5">${esc(m.note)}</div>` : ''}
      </div>
    </div>`).join('') : `<div class="empty">Nenhuma movimentação registrada para este produto.</div>`;

  openModal({
    title: p.name,
    subtitle: `Código ${p.code} • Saldo atual: ${p.stock || 0} un`,
    width: '560px',
    body: `<div class="-my-1">${rows}</div>`,
    footer: `<button data-close class="btn btn-secondary">Fechar</button>`
  });
}

/* =================== FINALIZAÇÃO (ENTRADA) =================== */
export function renderFinalizacao(view) {
  view.innerHTML = `
    <div class="max-w-xl">
      <div class="card p-6">
        <h3 class="text-base font-semibold">Entrada de produto no estoque</h3>
        <p class="text-[13px] text-slate-500 mt-1 mb-5">Leia o código de barras para carregar automaticamente os dados do produto, informe a RT e confirme com a sua senha.</p>
        <button id="fin-scan" class="btn btn-primary w-full h-11">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="11" y1="8" x2="11" y2="16"/><line x1="15" y1="8" x2="15" y2="16"/><line x1="18" y1="8" x2="18" y2="16"/></svg>
          Abrir câmera e ler código de barras
        </button>
        <div id="fin-panel" class="mt-5 hidden"></div>
      </div>
      <div class="mt-5">
        <h4 class="text-[13px] font-semibold text-slate-700 mb-3">Últimas entradas</h4>
        <div class="card overflow-hidden" id="fin-last"></div>
      </div>
    </div>`;

  const lastEl = view.querySelector('#fin-last');
  const last = state.data.movements.filter(m => m.type === 'entrada').sort((a, b) => b.at - a.at).slice(0, 8);
  lastEl.innerHTML = last.length ? `<div class="overflow-x-auto"><table class="data">
    <thead><tr><th>Produto</th><th>Qtd</th><th>RT</th><th>Responsável</th><th>Data/Hora</th></tr></thead><tbody>
    ${last.map(m => {
      const p = state.data.products.find(x => x.id === m.productId);
      return `<tr><td class="font-medium">${esc(p ? p.name : '—')}</td><td>+${m.qty}</td><td class="font-mono text-[12.5px]">${esc(m.rt || '—')}</td><td class="text-slate-600">${esc(m.user)}</td><td class="text-slate-500 whitespace-nowrap">${fmtDate(m.at)}</td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="empty">Nenhuma entrada registrada ainda.</div>`;

  view.querySelector('#fin-scan').addEventListener('click', async () => {
    const code = await scanBarcode({ title: 'Ler código de barras', subtitle: 'Aponte a câmera para o código do produto.' });
    if (!code) return;
    const p = state.data.products.find(x => String(x.code) === String(code).trim());
    const panel = view.querySelector('#fin-panel');
    panel.classList.remove('hidden');
    if (!p) {
      panel.innerHTML = `<div class="p-4 rounded-lg bg-red-50 border border-red-100 text-[13px] text-red-800">
        Produto não encontrado para o código <strong class="font-mono">${esc(code)}</strong>. Cadastre-o em “Cadastro de produtos”.</div>`;
      return;
    }
    panel.innerHTML = `
      <div class="p-4 rounded-xl bg-slate-50 border border-slate-200">
        <div class="text-[12px] uppercase tracking-wide text-slate-500 mb-2">Produto identificado</div>
        <div class="text-[15px] font-semibold">${esc(p.name)}</div>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-[13px]">
          <div><dt class="text-slate-500">Código</dt><dd class="font-mono">${esc(p.code)}</dd></div>
          <div><dt class="text-slate-500">Categoria</dt><dd>${esc(p.category || '—')}</dd></div>
          <div><dt class="text-slate-500">Saldo atual</dt><dd class="font-semibold">${p.stock || 0} un</dd></div>
          <div><dt class="text-slate-500">Cadastro</dt><dd>${fmtDate(p.createdAt)}</dd></div>
          <div class="col-span-2"><dt class="text-slate-500">Observação</dt><dd>${esc(p.note || '—')}</dd></div>
        </dl>
      </div>
      <div class="grid sm:grid-cols-2 gap-4 mt-4">
        <div><label class="label">RT (manual)</label><input id="fin-rt" class="input font-mono" placeholder="Ex.: RT-00123"></div>
        <div><label class="label">Quantidade</label><input id="fin-qty" type="number" min="1" value="1" class="input"></div>
      </div>
      <button id="fin-confirm" class="btn btn-success w-full h-11 mt-4">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Dar entrada no estoque
      </button>
      <p id="fin-err" class="text-sm text-red-600 mt-2 hidden"></p>`;

    panel.querySelector('#fin-confirm').addEventListener('click', async (e) => {
      const rt = panel.querySelector('#fin-rt').value.trim();
      const qty = parseInt(panel.querySelector('#fin-qty').value, 10) || 1;
      const errEl = panel.querySelector('#fin-err');
      if (!rt) { errEl.textContent = 'Informe a RT do produto.'; errEl.classList.remove('hidden'); return; }
      const pass = await askPassword({ title: 'Confirmar entrada', kind: 'self', message: 'Digite a sua senha de acesso para confirmar a entrada.' });
      if (!pass) return;
      e.target.disabled = true; e.target.innerHTML = '<span class="spinner"></span>';
      try {
        await api.entry({ productId: p.id, code: p.code, rt, qty, password: pass });
        toast('Entrada registrada com sucesso.', 'ok');
        bus.reload();
      } catch (err) {
        errEl.textContent = err.message; errEl.classList.remove('hidden');
        e.target.disabled = false; e.target.textContent = 'Dar entrada no estoque';
      }
    });
  });
}
