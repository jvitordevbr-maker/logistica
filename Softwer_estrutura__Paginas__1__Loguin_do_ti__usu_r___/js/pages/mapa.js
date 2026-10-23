import { api, state, findClient, findDriver, findVehicle } from '../api.js';
import { esc, fmtDate, toast, openModal, confirmDialog } from '../ui.js';
import { bus } from '../bus.js';

const statusBadge = (s) => ({
  rascunho: '<span class="badge badge-gray">Rascunho</span>',
  planejado: '<span class="badge badge-amber">Rota gerada</span>',
  aprovado: '<span class="badge badge-green">Aprovado</span>'
}[s] || '<span class="badge badge-gray">—</span>');

export function renderMapa(view) {
  const maps = [...state.data.tripmaps].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  view.innerHTML = `
    <div class="flex items-center gap-3 mb-5">
      <div class="flex-1"><p class="text-[13px] text-slate-500">Lance os pedidos, gere a rota otimizada com IA e libere para o carregamento.</p></div>
      <button id="map-new" class="btn btn-primary">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Novo mapa de viagem</button>
    </div>
    <div class="card overflow-hidden"><div class="overflow-x-auto">
      <table class="data"><thead><tr><th>Mapa</th><th>Pedidos</th><th>Viagens</th><th>Status</th><th>Criado por</th><th>Data</th><th></th></tr></thead>
      <tbody id="map-rows"></tbody></table></div></div>`;
  const rows = view.querySelector('#map-rows');
  if (!maps.length) rows.innerHTML = `<tr><td colspan="7"><div class="empty">Nenhum mapa de viagem criado.</div></td></tr>`;
  else rows.innerHTML = maps.map(m => `
    <tr class="clickable" data-id="${m.id}">
      <td class="font-semibold">${esc(m.code)}</td>
      <td>${(m.items || []).length} itens</td>
      <td>${m.plan ? m.plan.viagens.length : '—'}</td>
      <td>${statusBadge(m.status)}</td>
      <td class="text-slate-600">${esc(m.createdBy || '—')}</td>
      <td class="text-slate-500 whitespace-nowrap">${fmtDate(m.createdAt)}</td>
      <td class="text-right text-slate-400"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="inline"><polyline points="9 18 15 12 9 6"/></svg></td>
    </tr>`).join('');
  rows.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => openMap(maps.find(m => m.id === tr.dataset.id))));
  view.querySelector('#map-new').addEventListener('click', () => openMap(null));
}

function openMap(existing) {
  let record = existing ? JSON.parse(JSON.stringify(existing)) : { items: [], status: 'rascunho' };
  const locked = record.status === 'aprovado';

  const modal = openModal({
    title: existing ? 'Mapa de viagem ' + existing.code : 'Novo mapa de viagem',
    subtitle: locked ? 'Mapa aprovado — as cargas já foram geradas.' : 'Informe o cliente e os itens pedidos.',
    width: '760px',
    body: `<div id="map-content"></div>`,
    footer: `<button data-close class="btn btn-secondary">Fechar</button>
             <button data-plan class="btn btn-primary ${locked ? 'hidden' : ''}">Fazer mapa (IA)</button>
             <button data-approve class="btn btn-success hidden">Dar OK e enviar ao carregamento</button>`,
    onMount(wrap, close) {
      const content = wrap.querySelector('#map-content');
      const planBtn = wrap.querySelector('[data-plan]');
      const approveBtn = wrap.querySelector('[data-approve]');

      const draw = () => {
        const clients = [...state.data.clients].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const products = [...state.data.products].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        content.innerHTML = `
          ${locked ? '' : `
          <div class="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <div class="grid sm:grid-cols-12 gap-3 items-end">
              <div class="sm:col-span-5"><label class="label">Cliente</label>
                <select id="it-client" class="select"><option value="">Selecione…</option>
                ${clients.map(c => `<option value="${c.id}">${esc(c.name)}${c.city ? ' — ' + esc(c.city) : ''}</option>`).join('')}</select></div>
              <div class="sm:col-span-5"><label class="label">Produto pedido</label>
                <select id="it-product" class="select"><option value="">Selecione…</option>
                ${products.map(p => `<option value="${p.id}">${esc(p.code)} - ${esc(p.name)}</option>`).join('')}</select></div>
              <div class="sm:col-span-2"><label class="label">Qtd</label><input id="it-qty" type="number" min="1" value="1" class="input"></div>
            </div>
            <div id="it-info" class="text-[12.5px] text-slate-500 mt-3 hidden"></div>
            <button id="it-add" class="btn btn-secondary mt-3">Adicionar à lista</button>
          </div>`}

          <div class="mt-4">
            <div class="text-[12.5px] font-semibold text-slate-700 mb-2">Pedidos lançados (${record.items.length})</div>
            <div class="card overflow-hidden">
              ${record.items.length ? `<div class="overflow-x-auto"><table class="data">
                <thead><tr><th>Cliente</th><th>Cidade</th><th>Produto</th><th>Qtd</th>${locked ? '' : '<th></th>'}</tr></thead><tbody>
                ${record.items.map((it, i) => {
                  const c = findClient(it.clientId); const p = state.data.products.find(x => x.id === it.productId);
                  return `<tr>
                    <td class="font-medium">${esc(c ? c.name : '—')}</td>
                    <td class="text-slate-600">${esc(c ? (c.city || '—') : '—')}</td>
                    <td>${esc(p ? p.code + ' - ' + p.name : it.desc || '—')}</td>
                    <td>${it.qty}</td>
                    ${locked ? '' : `<td class="text-right"><button class="btn btn-ghost h-7 px-2 text-[12.5px] text-red-600" data-rm="${i}">Remover</button></td>`}
                  </tr>`;
                }).join('')}</tbody></table></div>` : `<div class="empty">Nenhum pedido lançado ainda.</div>`}
            </div>
          </div>
          ${record.plan ? planHtml(record) : ''}`;

        if (!locked) {
          const info = content.querySelector('#it-info');
          content.querySelector('#it-client').addEventListener('change', e => {
            const c = findClient(e.target.value);
            if (!c) { info.classList.add('hidden'); return; }
            info.classList.remove('hidden');
            info.innerHTML = `<strong>${esc(c.name)}</strong> • CNPJ ${esc(c.cnpj || '—')} • ${esc(c.phone || '—')}<br>${esc([c.street, c.number, c.district, c.city, c.state].filter(Boolean).join(', ') || 'Sem endereço cadastrado')}`;
          });
          content.querySelector('#it-add').addEventListener('click', () => {
            const clientId = content.querySelector('#it-client').value;
            const productId = content.querySelector('#it-product').value;
            const qty = parseInt(content.querySelector('#it-qty').value, 10) || 1;
            if (!clientId || !productId) { toast('Selecione cliente e produto.', 'err'); return; }
            const p = state.data.products.find(x => x.id === productId);
            record.items.push({ clientId, productId, qty, desc: p ? p.code + ' - ' + p.name : '' });
            save().then(draw);
          });
          content.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
            record.items.splice(Number(b.dataset.rm), 1);
            save().then(draw);
          }));
        }
        approveBtn.classList.toggle('hidden', !record.plan || locked);
        planBtn.classList.toggle('hidden', locked);
        planBtn.textContent = record.plan ? 'Refazer mapa (IA)' : 'Fazer mapa (IA)';
      };

      const save = async () => {
        try { const r = await api.saveMap(record); record = { ...record, ...r.record }; }
        catch (e) { toast(e.message, 'err'); }
      };

      planBtn.addEventListener('click', async () => {
        if (!record.items.length) { toast('Lance ao menos um pedido.', 'err'); return; }
        await save();
        planBtn.disabled = true; planBtn.innerHTML = '<span class="spinner"></span> Analisando rotas…';
        try {
          const r = await api.planMap(record.id);
          record = r.record;
          toast('Rota otimizada gerada.', 'ok');
          draw();
        } catch (e) { toast(e.message, 'err'); }
        planBtn.disabled = false; planBtn.textContent = 'Refazer mapa (IA)';
      });

      approveBtn.addEventListener('click', async () => {
        const okC = await confirmDialog({ title: 'Aprovar mapa', message: 'Ao dar OK, as cargas serão criadas na tela de Carregamento. Continuar?', confirmLabel: 'Dar OK' });
        if (!okC) return;
        approveBtn.disabled = true; approveBtn.innerHTML = '<span class="spinner"></span>';
        try {
          await api.approveMap(record.id);
          toast('Mapa aprovado. Cargas enviadas ao carregamento.', 'ok');
          close(); bus.reload();
        } catch (e) { toast(e.message, 'err'); approveBtn.disabled = false; approveBtn.textContent = 'Dar OK e enviar ao carregamento'; }
      });

      (async () => { if (!record.id) await save(); draw(); })();
    }
  });
  void modal;
}

function planHtml(record) {
  return `
  <div class="mt-5">
    <div class="text-[12.5px] font-semibold text-slate-700 mb-2">Roteirização sugerida</div>
    <div class="space-y-3">
      ${record.plan.viagens.map((v, i) => {
        const d = findDriver(v.motoristaId); const f = findVehicle(v.veiculoId);
        return `<div class="card p-4">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div class="text-[13px] font-semibold">Viagem ${i + 1}${v.regiao ? ' — ' + esc(v.regiao) : ''}</div>
              <div class="text-[12.5px] text-slate-500 mt-1">Motorista: <strong>${esc(d ? d.name : '—')}</strong> • Veículo: <strong>${esc(f ? f.model + ' (' + f.plate + ')' : '—')}</strong></div>
            </div>
            <span class="badge badge-blue">${(v.paradas || []).length} paradas</span>
          </div>
          ${v.observacao ? `<p class="text-[12.5px] text-slate-600 mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-100">${esc(v.observacao)}</p>` : ''}
          <ol class="mt-3 space-y-1.5">
            ${(v.paradas || []).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(p => {
              const c = findClient(p.clientId);
              const its = record.items.filter(it => it.clientId === p.clientId);
              return `<li class="flex gap-2.5 text-[13px]">
                <span class="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[11px] flex items-center justify-center shrink-0 mt-0.5">${p.ordem}</span>
                <span><strong>${esc(c ? c.name : '—')}</strong> <span class="text-slate-500">— ${esc(c ? (c.city || '') : '')}</span>
                <span class="block text-slate-500 text-[12.5px]">${its.map(it => esc(it.desc) + ' × ' + it.qty).join(' • ')}</span></span>
              </li>`;
            }).join('')}
          </ol>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}
