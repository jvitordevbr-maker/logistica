import { api, state, findDriver, findVehicle } from '../api.js';
import { esc, fmtDate, toast, openModal, capturePhoto, photoThumb } from '../ui.js';
import { bus } from '../bus.js';

function myDriver() {
  const u = state.user || {};
  return state.data.drivers.find(d => d.username && d.username === u.username) || null;
}

export function renderEntrega(view) {
  const mine = myDriver();
  const all = state.data.deliveries.filter(d => d.status === 'pendente');
  const list = mine ? all.filter(d => d.driverId === mine.id) : all;
  const drivers = [...new Set(list.map(d => d.driverId))];

  view.innerHTML = `
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <div class="flex-1 min-w-[220px]">
        <p class="text-[13px] text-slate-500">${mine ? `Entregas de <strong>${esc(mine.name)}</strong>, na sequência da rota.` : 'Entregas pendentes por motorista, na sequência da rota.'}</p>
      </div>
      ${!mine && drivers.length > 1 ? `<select id="dlv-filter" class="select max-w-xs"><option value="">Todos os motoristas</option>
        ${drivers.map(id => { const d = findDriver(id); return `<option value="${id}">${esc(d ? d.name : '—')}</option>`; }).join('')}</select>` : ''}
    </div>
    <div id="dlv-list" class="space-y-3"></div>`;

  const cont = view.querySelector('#dlv-list');
  const draw = (filter) => {
    const arr = (filter ? list.filter(d => d.driverId === filter) : list)
      .sort((a, b) => (a.loadCode || '').localeCompare(b.loadCode || '') || (a.seq || 0) - (b.seq || 0));
    if (!arr.length) { cont.innerHTML = `<div class="card"><div class="empty">Nenhuma entrega pendente.</div></div>`; return; }
    cont.innerHTML = arr.map((d, i) => {
      const drv = findDriver(d.driverId), veh = findVehicle(d.vehicleId);
      return `<div class="card p-4">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-semibold text-[13px] shrink-0">${i + 1}</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-[14.5px] font-semibold">Entrega ${i + 1} — ${esc(d.code)}</span>
              <span class="badge badge-amber">Pendente</span>
            </div>
            <div class="text-[13px] text-slate-700 mt-1">${esc(d.client)}</div>
            <div class="text-[12.5px] text-slate-500 mt-0.5">${esc(d.address || d.city || 'Endereço não informado')}</div>
            <div class="text-[12px] text-slate-400 mt-1">Motorista ${esc(drv ? drv.name : '—')} • ${esc(veh ? veh.plate : '—')} • Carga ${esc(d.loadCode)}</div>
            <div class="text-[12.5px] text-slate-600 mt-2">${d.items.map(i2 => esc(i2.name) + ' × ' + i2.qty).join(' • ')}</div>
          </div>
        </div>
        <div class="flex gap-2 mt-4">
          <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d.address || d.city || d.client)}" target="_blank" class="btn btn-secondary flex-1">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            Abrir no Maps</a>
          <button class="btn btn-primary flex-1" data-finish="${d.id}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13"/><path d="m9 13 2 2 4-4"/></svg>
            Descarregamento</button>
        </div>
      </div>`;
    }).join('');
    cont.querySelectorAll('[data-finish]').forEach(b => b.addEventListener('click', () => finishModal(b.dataset.finish)));
  };
  draw('');
  const f = view.querySelector('#dlv-filter');
  if (f) f.addEventListener('change', e => draw(e.target.value));
}

function finishModal(id) {
  const d = state.data.deliveries.find(x => x.id === id);
  if (!d) return;
  let photoProduct = null, photoNota = null;

  openModal({
    title: 'Descarregamento — ' + d.code,
    subtitle: `${d.client} • ${d.city || ''}`,
    width: '520px',
    body: `
      <div class="space-y-4">
        <div class="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[13px] text-slate-700">
          ${d.items.map(i => `${esc(i.name)} × ${i.qty} <span class="text-slate-400">(RT ${esc(i.rt || '—')})</span>`).join('<br>')}
        </div>
        <div>
          <label class="label">Foto do produto descarregado</label>
          <button data-p1 class="btn btn-secondary w-full">Tirar foto do produto</button>
          <img data-i1 class="hidden w-full mt-2 rounded-lg border border-slate-200">
        </div>
        <div>
          <label class="label">Foto da nota assinada</label>
          <button data-p2 class="btn btn-secondary w-full">Tirar foto da nota</button>
          <img data-i2 class="hidden w-full mt-2 rounded-lg border border-slate-200">
        </div>
        <div><label class="label">Recebido por (opcional)</label><input data-receiver class="input" placeholder="Nome de quem recebeu"></div>
        <p data-err class="text-sm text-red-600 hidden"></p>
      </div>`,
    footer: `<button data-close class="btn btn-secondary">Cancelar</button><button data-ok class="btn btn-success">Finalizar entrega</button>`,
    onMount(wrap, close) {
      const errEl = wrap.querySelector('[data-err]');
      wrap.querySelector('[data-p1]').addEventListener('click', async () => {
        const p = await capturePhoto({ title: 'Foto do produto', subtitle: 'Registre o produto descarregado.' });
        if (p) { photoProduct = p; const im = wrap.querySelector('[data-i1]'); im.src = p; im.classList.remove('hidden'); wrap.querySelector('[data-p1]').textContent = 'Refazer foto do produto'; }
      });
      wrap.querySelector('[data-p2]').addEventListener('click', async () => {
        const p = await capturePhoto({ title: 'Foto da nota assinada', subtitle: 'Registre a nota fiscal assinada.' });
        if (p) { photoNota = p; const im = wrap.querySelector('[data-i2]'); im.src = p; im.classList.remove('hidden'); wrap.querySelector('[data-p2]').textContent = 'Refazer foto da nota'; }
      });
      wrap.querySelector('[data-ok]').addEventListener('click', async (e) => {
        if (!photoProduct || !photoNota) { errEl.textContent = 'Envie a foto do produto e da nota assinada.'; errEl.classList.remove('hidden'); return; }
        e.target.disabled = true; e.target.innerHTML = '<span class="spinner"></span>';
        try {
          const [a, b] = await Promise.all([api.photo(photoProduct), api.photo(photoNota)]);
          await api.finishDelivery(d.id, { photoProduct: a.id, photoNota: b.id, receiver: wrap.querySelector('[data-receiver]').value.trim() });
          close(); toast('Entrega finalizada.', 'ok'); bus.reload();
        } catch (err) {
          errEl.textContent = err.message; errEl.classList.remove('hidden');
          e.target.disabled = false; e.target.textContent = 'Finalizar entrega';
        }
      });
    }
  });
}

/* =================== ENTREGAS FINALIZADAS =================== */
export function renderEntregues(view) {
  const list = state.data.deliveries.filter(d => d.status === 'entregue').sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  view.innerHTML = `
    <div class="mb-5 flex flex-wrap gap-3 items-center">
      <div class="flex-1 min-w-[200px]"><input id="fin-search" class="input" placeholder="Buscar por entrega, cliente ou motorista…"></div>
      <span class="badge badge-green">${list.length} entregas concluídas</span>
    </div>
    <div class="card overflow-hidden"><div class="overflow-x-auto">
      <table class="data"><thead><tr><th>Entrega</th><th>Cliente</th><th>Cidade</th><th>Motorista</th><th>Finalizada em</th><th></th></tr></thead>
      <tbody id="fin-rows"></tbody></table></div></div>`;
  const rows = view.querySelector('#fin-rows');
  const draw = (arr) => {
    if (!arr.length) { rows.innerHTML = `<tr><td colspan="6"><div class="empty">Nenhuma entrega finalizada.</div></td></tr>`; return; }
    rows.innerHTML = arr.map(d => {
      const drv = findDriver(d.driverId);
      return `<tr class="clickable" data-id="${d.id}">
        <td class="font-semibold">${esc(d.code)}</td>
        <td>${esc(d.client)}</td>
        <td class="text-slate-600">${esc(d.city || '—')}</td>
        <td class="text-slate-600">${esc(drv ? drv.name : '—')}</td>
        <td class="text-slate-500 whitespace-nowrap">${fmtDate(d.finishedAt)}</td>
        <td class="text-right text-slate-400"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="inline"><polyline points="9 18 15 12 9 6"/></svg></td>
      </tr>`;
    }).join('');
    rows.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => detail(tr.dataset.id)));
  };
  draw(list);
  view.querySelector('#fin-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    draw(list.filter(d => { const drv = findDriver(d.driverId); return [d.code, d.client, d.city, drv && drv.name].join(' ').toLowerCase().includes(q); }));
  });
}

function detail(id) {
  const d = state.data.deliveries.find(x => x.id === id);
  if (!d) return;
  const drv = findDriver(d.driverId);
  openModal({
    title: 'Entrega ' + d.code,
    subtitle: `${d.client} • Finalizada em ${fmtDate(d.finishedAt)}`,
    width: '560px',
    body: `
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] mb-5">
        <div><dt class="text-slate-500">Motorista</dt><dd class="font-medium">${esc(drv ? drv.name : '—')}</dd></div>
        <div><dt class="text-slate-500">Carga</dt><dd class="font-medium">${esc(d.loadCode)}</dd></div>
        <div><dt class="text-slate-500">Recebido por</dt><dd class="font-medium">${esc(d.receiver || '—')}</dd></div>
        <div><dt class="text-slate-500">Finalizado por</dt><dd class="font-medium">${esc(d.finishedBy || '—')}</dd></div>
        <div class="col-span-2"><dt class="text-slate-500">Endereço</dt><dd>${esc(d.address || '—')}</dd></div>
        <div class="col-span-2"><dt class="text-slate-500">Itens</dt><dd>${d.items.map(i => esc(i.name) + ' × ' + i.qty + ' (RT ' + esc(i.rt || '—') + ')').join('<br>')}</dd></div>
      </dl>
      <div class="grid grid-cols-2 gap-3">
        ${photoThumb(d.photoProduct, 'Produto descarregado')}
        ${photoThumb(d.photoNota, 'Nota assinada')}
      </div>`,
    footer: `<button data-close class="btn btn-secondary">Fechar</button>`
  });
}
