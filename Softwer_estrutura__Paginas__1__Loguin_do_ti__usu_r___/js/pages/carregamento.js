import { api, state, findDriver, findVehicle } from '../api.js';
import { esc, fmtDate, toast, openModal, confirmDialog, scanBarcode, capturePhoto, photoThumb } from '../ui.js';
import { bus } from '../bus.js';

export function renderCarregamento(view) {
  const loads = [...state.data.loads].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const open = loads.filter(l => l.status === 'aberto');
  const done = loads.filter(l => l.status !== 'aberto');

  view.innerHTML = `
    <div class="flex items-center gap-2 mb-5">
      <button class="tab active" data-tab="abertas">Cargas abertas (${open.length})</button>
      <button class="tab" data-tab="liberadas">Liberadas (${done.length})</button>
    </div>
    <div id="cg-list" class="space-y-4"></div>`;

  const list = view.querySelector('#cg-list');
  const card = (l) => {
    const d = findDriver(l.driverId), f = findVehicle(l.vehicleId);
    const items = l.stops.flatMap(s => s.items);
    const okN = items.filter(i => i.status === 'ok').length;
    const cancel = items.filter(i => i.status === 'cancelado').length;
    return `<div class="card p-4 sm:p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[15px] font-semibold">${esc(f ? f.model : 'Veículo')} — placa <span class="font-mono">${esc(f ? f.plate : '—')}</span></span>
            ${l.status === 'aberto' ? '<span class="badge badge-amber">Em conferência</span>' : '<span class="badge badge-green">Liberada</span>'}
          </div>
          <div class="text-[13px] text-slate-600 mt-1">Motorista da viagem: <strong>${esc(d ? d.name : '—')}</strong></div>
          <div class="text-[12.5px] text-slate-500 mt-0.5">Carga ${esc(l.code)} • Mapa ${esc(l.mapCode || '—')} • ${l.stops.length} cidades/paradas • ${items.length} itens</div>
          ${l.note ? `<div class="text-[12.5px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">${esc(l.note)}</div>` : ''}
        </div>
        <div class="flex items-center gap-2">
          <span class="badge badge-gray">${okN}/${items.length} conferidos${cancel ? ' • ' + cancel + ' cancelados' : ''}</span>
          <button class="btn btn-primary h-9 px-3.5 text-[13px]" data-open="${l.id}">Abrir</button>
        </div>
      </div>
    </div>`;
  };

  const draw = (tab) => {
    const arr = tab === 'abertas' ? open : done;
    list.innerHTML = arr.length ? arr.map(card).join('') : `<div class="card"><div class="empty">Nenhuma carga ${tab === 'abertas' ? 'aberta' : 'liberada'}.</div></div>`;
    list.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openLoad(b.dataset.open)));
  };
  draw('abertas');
  view.querySelectorAll('[data-tab]').forEach(t => t.addEventListener('click', () => {
    view.querySelectorAll('[data-tab]').forEach(x => x.classList.remove('active'));
    t.classList.add('active'); draw(t.dataset.tab);
  }));
}

function openLoad(loadId) {
  let load = state.data.loads.find(l => l.id === loadId);
  if (!load) return;
  const d = findDriver(load.driverId), f = findVehicle(load.vehicleId);

  openModal({
    title: `${f ? f.model + ' — placa ' + f.plate : 'Carga'}`,
    subtitle: `Motorista da viagem: ${d ? d.name : '—'} • Carga ${load.code}`,
    width: '720px',
    body: `<div id="cg-body"></div>`,
    footer: `<button data-close class="btn btn-secondary">Fechar</button>
             <button data-release class="btn btn-success">Liberar carga</button>`,
    onMount(wrap, close) {
      const body = wrap.querySelector('#cg-body');
      const relBtn = wrap.querySelector('[data-release]');
      let openStop = load.stops[0] ? load.stops[0].id : null;

      const draw = () => {
        load = state.data.loads.find(l => l.id === loadId) || load;
        const locked = load.status !== 'aberto';
        body.innerHTML = load.stops.map(s => {
          const okN = s.items.filter(i => i.status === 'ok').length;
          const isOpen = openStop === s.id;
          return `<div class="card mb-3 overflow-hidden">
            <button class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" data-stop="${s.id}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}"><polyline points="9 18 15 12 9 6"/></svg>
              <div class="flex-1 min-w-0">
                <div class="text-[14px] font-semibold truncate">${esc(s.city || 'Sem cidade')}</div>
                <div class="text-[12.5px] text-slate-500 truncate">${esc(s.client)}</div>
              </div>
              <span class="badge ${okN === s.items.length ? 'badge-green' : 'badge-gray'}">${okN}/${s.items.length}</span>
            </button>
            ${isOpen ? `<div class="border-t border-slate-100 divide-y divide-slate-100">
              ${s.items.map(i => itemRow(i, locked)).join('')}
            </div>` : ''}
          </div>`;
        }).join('');

        body.querySelectorAll('[data-stop]').forEach(b => b.addEventListener('click', () => {
          openStop = openStop === b.dataset.stop ? null : b.dataset.stop; draw();
        }));
        body.querySelectorAll('[data-conf]').forEach(b => b.addEventListener('click', () => confirmItem(b.dataset.conf)));
        body.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => cancelItem(b.dataset.cancel)));
        relBtn.classList.toggle('hidden', locked);
      };

      const itemRow = (i, locked) => {
        const green = i.status === 'ok';
        const cancelled = i.status === 'cancelado';
        return `<div class="px-4 py-3 ${green ? 'bg-green-50' : cancelled ? 'bg-red-50' : ''}">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="min-w-0">
              <div class="text-[13.5px] font-medium">${esc(i.name || i.desc)}</div>
              <div class="text-[12.5px] text-slate-500 mt-0.5">Código ${esc(i.code || '—')} • Qtd ${i.qty} • RT <span class="font-mono">${esc(i.rt || '—')}</span></div>
              ${green ? `<div class="text-[12px] text-green-700 mt-1">Conferido por ${esc(i.by)} • ${fmtDate(i.at)}</div>` : ''}
              ${cancelled ? `<div class="text-[12px] text-red-700 mt-1">Cancelado: ${esc(i.cancelReason)} — ${esc(i.by)}</div>` : ''}
            </div>
            <div class="flex items-center gap-2">
              ${green ? `<span class="badge badge-green">Conferido</span>` : cancelled ? `<span class="badge badge-red">Cancelado</span>` : ''}
              ${!locked && !green && !cancelled ? `<button class="btn btn-primary h-8 px-3 text-[12.5px]" data-conf="${i.id}">Conferir</button>` : ''}
              ${!locked && !cancelled ? `<button class="btn btn-ghost h-8 px-2.5 text-[12.5px] text-red-600" data-cancel="${i.id}">Cancelar</button>` : ''}
            </div>
          </div>
          ${i.photoId ? `<div class="mt-2 w-40">${photoThumb(i.photoId, 'Foto da RT')}</div>` : ''}
        </div>`;
      };

      const findItem = (id) => { for (const s of load.stops) { const f2 = s.items.find(i => i.id === id); if (f2) return f2; } return null; };

      const confirmItem = async (itemId) => {
        const item = findItem(itemId);
        if (!item) return;
        const code = await scanBarcode({
          title: 'Conferir produto', expect: item.rt,
          subtitle: `${item.name} — leia o código de barras do produto.`
        });
        if (!code) return;
        if (item.code && String(code).trim() !== String(item.code)) {
          const go = await confirmDialog({
            title: 'Código divergente',
            message: `O código lido (${code}) é diferente do esperado (${item.code}). Deseja continuar mesmo assim?`,
            confirmLabel: 'Continuar', danger: true
          });
          if (!go) return;
        }
        const photo = await capturePhoto({ title: 'Foto da RT', subtitle: `Bata a foto da RT ${item.rt || ''} do produto.` });
        if (!photo) { toast('Foto da RT é obrigatória.', 'err'); return; }
        try {
          const up = await api.photo(photo);
          await api.loadItem(load.id, { itemId, action: 'confirm', photoId: up.id, scanCode: String(code).trim() });
          toast('Produto conferido.', 'ok');
          await bus.reloadSilent();
          draw();
        } catch (e) { toast(e.message, 'err'); }
      };

      const cancelItem = (itemId) => {
        openModal({
          title: 'Cancelar produto',
          subtitle: 'Informe o motivo do cancelamento.',
          width: '420px',
          body: `<textarea data-reason class="textarea" placeholder="Ex.: produto avariado, saldo insuficiente…"></textarea>`,
          footer: `<button data-close class="btn btn-secondary">Voltar</button><button data-ok class="btn btn-danger">Cancelar produto</button>`,
          onMount(w2, c2) {
            w2.querySelector('[data-ok]').addEventListener('click', async (e) => {
              const reason = w2.querySelector('[data-reason]').value.trim();
              if (!reason) { toast('Informe o motivo.', 'err'); return; }
              e.target.disabled = true; e.target.innerHTML = '<span class="spinner"></span>';
              try {
                await api.loadItem(load.id, { itemId, action: 'cancel', reason });
                c2(); toast('Produto cancelado.', 'ok');
                await bus.reloadSilent(); draw();
              } catch (err) { toast(err.message, 'err'); e.target.disabled = false; e.target.textContent = 'Cancelar produto'; }
            });
          }
        });
      };

      relBtn.addEventListener('click', async () => {
        const okC = await confirmDialog({ title: 'Liberar carga', message: 'A carga será liberada, o saldo do estoque será baixado e as entregas irão para o motorista. Continuar?', confirmLabel: 'Liberar carga' });
        if (!okC) return;
        relBtn.disabled = true; relBtn.innerHTML = '<span class="spinner"></span>';
        try { await api.releaseLoad(load.id); toast('Carga liberada. Entregas geradas.', 'ok'); close(); bus.reload(); }
        catch (e) { toast(e.message, 'err'); relBtn.disabled = false; relBtn.textContent = 'Liberar carga'; }
      });

      draw();
    }
  });
}
