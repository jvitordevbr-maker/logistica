import { api } from './api.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
export function fmtDateShort(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR');
}
export function initials(n) {
  return String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .2s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 220); }, 3200);
}

let modalStack = [];
export function openModal({ title, subtitle = '', body, footer = '', width = '540px', onMount }) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal" style="max-width:${width}">
      <div class="modal-head">
        <div class="flex-1 min-w-0">
          <h3 class="text-base font-semibold tracking-tight">${esc(title)}</h3>
          ${subtitle ? `<p class="text-[13px] text-slate-500 mt-0.5">${esc(subtitle)}</p>` : ''}
        </div>
        <button data-close class="p-1.5 -m-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  root.appendChild(wrap);
  const close = () => { wrap.remove(); modalStack = modalStack.filter(m => m !== wrap); };
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  modalStack.push(wrap);
  if (onMount) onMount(wrap, close);
  return { el: wrap, close };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    const m = openModal({
      title,
      body: `<p class="text-sm text-slate-600 leading-relaxed">${esc(message)}</p>`,
      footer: `<button data-close class="btn btn-secondary">Cancelar</button><button data-yes class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(confirmLabel)}</button>`,
      width: '420px',
      onMount(wrap, close) {
        wrap.querySelector('[data-yes]').addEventListener('click', () => { close(); resolve(true); });
        wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => resolve(false)));
        wrap.addEventListener('click', e => { if (e.target === wrap) resolve(false); });
      }
    });
    void m;
  });
}

/** Pede senha (kind: 'admin' | 'self') e valida no servidor. Resolve com a senha ou null. */
export function askPassword({ title = 'Confirmação de senha', kind = 'admin', message = '' }) {
  return new Promise(resolve => {
    openModal({
      title,
      subtitle: message || (kind === 'admin' ? 'Esta ação exige a senha do TI.' : 'Confirme com a sua senha de acesso.'),
      body: `
        <label class="label">Senha</label>
        <input type="password" data-pass class="input" placeholder="••••••" autocomplete="current-password">
        <p data-err class="text-sm text-red-600 mt-2 hidden"></p>`,
      footer: `<button data-close class="btn btn-secondary">Cancelar</button><button data-ok class="btn btn-primary">Confirmar</button>`,
      width: '400px',
      onMount(wrap, close) {
        const input = wrap.querySelector('[data-pass]');
        const errEl = wrap.querySelector('[data-err]');
        const okBtn = wrap.querySelector('[data-ok]');
        setTimeout(() => input.focus(), 50);
        let done = false;
        const submit = async () => {
          const pass = input.value;
          if (!pass) { errEl.textContent = 'Informe a senha.'; errEl.classList.remove('hidden'); return; }
          okBtn.disabled = true; okBtn.innerHTML = '<span class="spinner"></span>';
          try {
            const r = await api.verify({ kind, password: pass });
            if (!r.valid) throw new Error('Senha incorreta.');
            done = true; close(); resolve(pass);
          } catch (e) {
            errEl.textContent = e.message; errEl.classList.remove('hidden');
            okBtn.disabled = false; okBtn.textContent = 'Confirmar';
          }
        };
        okBtn.addEventListener('click', submit);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
        wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { if (!done) resolve(null); }));
        wrap.addEventListener('click', e => { if (e.target === wrap && !done) resolve(null); });
      }
    });
  });
}

/* ---------- CÂMERA ---------- */
async function startStream(video, facing = 'environment') {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}
function stopStream(stream) { if (stream) stream.getTracks().forEach(t => t.stop()); }

function grabFrame(video, maxW = 900) {
  const w = video.videoWidth || 640, h = video.videoHeight || 480;
  const scale = Math.min(1, maxW / w);
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

/** Tira uma foto pela câmera. Resolve com dataURL ou null. */
export function capturePhoto({ title = 'Tirar foto', subtitle = '' } = {}) {
  return new Promise(resolve => {
    let stream = null, settled = false;
    openModal({
      title, subtitle,
      body: `
        <div class="scanner-box mb-3"><video data-video playsinline muted></video></div>
        <img data-preview class="hidden w-full rounded-xl border border-slate-200 mb-3" alt="Prévia">
        <p data-err class="text-sm text-red-600 hidden"></p>
        <input type="file" accept="image/*" capture="environment" data-file class="hidden">`,
      footer: `<button data-close class="btn btn-secondary">Cancelar</button>
               <button data-file-btn class="btn btn-secondary">Galeria</button>
               <button data-shot class="btn btn-primary">Capturar</button>
               <button data-use class="btn btn-success hidden">Usar foto</button>
               <button data-retry class="btn btn-secondary hidden">Repetir</button>`,
      width: '520px',
      onMount(wrap, close) {
        const video = wrap.querySelector('[data-video]');
        const prev = wrap.querySelector('[data-preview]');
        const errEl = wrap.querySelector('[data-err]');
        const shot = wrap.querySelector('[data-shot]');
        const useB = wrap.querySelector('[data-use]');
        const retry = wrap.querySelector('[data-retry]');
        const fileInput = wrap.querySelector('[data-file]');
        let dataUrl = null;

        startStream(video).then(s => { stream = s; }).catch(() => {
          errEl.textContent = 'Não foi possível abrir a câmera. Use o botão Galeria.';
          errEl.classList.remove('hidden');
          shot.disabled = true;
        });

        const showPreview = (url) => {
          dataUrl = url; prev.src = url; prev.classList.remove('hidden');
          wrap.querySelector('.scanner-box').classList.add('hidden');
          shot.classList.add('hidden'); wrap.querySelector('[data-file-btn]').classList.add('hidden');
          useB.classList.remove('hidden'); retry.classList.remove('hidden');
        };
        shot.addEventListener('click', () => showPreview(grabFrame(video)));
        retry.addEventListener('click', () => {
          dataUrl = null; prev.classList.add('hidden');
          wrap.querySelector('.scanner-box').classList.remove('hidden');
          shot.classList.remove('hidden'); wrap.querySelector('[data-file-btn]').classList.remove('hidden');
          useB.classList.add('hidden'); retry.classList.add('hidden');
        });
        wrap.querySelector('[data-file-btn]').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
          const f = fileInput.files[0]; if (!f) return;
          const r = new FileReader();
          r.onload = () => showPreview(r.result);
          r.readAsDataURL(f);
        });
        useB.addEventListener('click', () => { settled = true; stopStream(stream); close(); resolve(dataUrl); });
        const cancel = () => { if (!settled) { settled = true; stopStream(stream); resolve(null); } };
        wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', cancel));
        wrap.addEventListener('click', e => { if (e.target === wrap) cancel(); });
      }
    });
  });
}

/** Leitor de código de barras. Resolve com o código (string) ou null. */
export function scanBarcode({ title = 'Ler código de barras', subtitle = '', expect = '' } = {}) {
  return new Promise(resolve => {
    let stream = null, raf = null, settled = false, zxReader = null;
    openModal({
      title, subtitle,
      body: `
        ${expect ? `<div class="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-100 text-[13px] text-blue-900">Procure a RT <strong>${esc(expect)}</strong></div>` : ''}
        <div class="scanner-box mb-3"><video data-video playsinline muted></video><div class="scan-frame"></div></div>
        <p data-status class="text-[13px] text-slate-500 mb-3">Iniciando câmera…</p>
        <label class="label">Ou digite o código manualmente</label>
        <div class="flex gap-2">
          <input data-manual class="input" placeholder="Código de barras" inputmode="numeric">
          <button data-manual-btn class="btn btn-secondary">OK</button>
        </div>`,
      footer: `<button data-close class="btn btn-secondary">Cancelar</button>`,
      width: '520px',
      onMount(wrap, close) {
        const video = wrap.querySelector('[data-video]');
        const status = wrap.querySelector('[data-status]');
        const finish = (code) => {
          if (settled) return;
          settled = true;
          if (raf) cancelAnimationFrame(raf);
          if (zxReader && zxReader.reset) { try { zxReader.reset(); } catch (e) {} }
          stopStream(stream); close(); resolve(code);
        };
        wrap.querySelector('[data-manual-btn]').addEventListener('click', () => {
          const v = wrap.querySelector('[data-manual]').value.trim();
          if (v) finish(v);
        });
        wrap.querySelector('[data-manual]').addEventListener('keydown', e => {
          if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) finish(v); }
        });
        const cancel = () => { if (!settled) { settled = true; if (raf) cancelAnimationFrame(raf); if (zxReader && zxReader.reset) { try { zxReader.reset(); } catch (e) {} } stopStream(stream); resolve(null); } };
        wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', cancel));
        wrap.addEventListener('click', e => { if (e.target === wrap) cancel(); });

        (async () => {
          try { stream = await startStream(video); }
          catch (e) { status.textContent = 'Câmera indisponível. Digite o código manualmente.'; return; }
          status.textContent = 'Aponte a câmera para o código de barras…';
          if ('BarcodeDetector' in window) {
            try {
              const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'qr_code', 'codabar'] });
              const tick = async () => {
                if (settled) return;
                try {
                  const codes = await det.detect(video);
                  if (codes && codes.length) { finish(codes[0].rawValue); return; }
                } catch (e) {}
                raf = requestAnimationFrame(tick);
              };
              raf = requestAnimationFrame(tick);
              return;
            } catch (e) {}
          }
          try {
            const zx = await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm');
            zxReader = new zx.BrowserMultiFormatReader();
            zxReader.decodeFromVideoElement(video, (result) => {
              if (result && !settled) finish(result.getText());
            });
          } catch (e) {
            status.textContent = 'Leitura automática indisponível neste dispositivo. Digite o código manualmente.';
          }
        })();
      }
    });
  });
}

export function photoThumb(id, label) {
  if (!id) return '';
  const url = api.photoUrl(id);
  return `<a href="${url}" target="_blank" class="block">
    <img src="${url}" alt="${esc(label || '')}" class="w-full h-36 object-cover rounded-lg border border-slate-200">
    <span class="block text-[12px] text-slate-500 mt-1.5">${esc(label || '')}</span></a>`;
}
