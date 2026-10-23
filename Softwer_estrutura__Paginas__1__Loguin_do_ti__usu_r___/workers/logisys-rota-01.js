// LogiSys backend worker — shared data for all app users
const JSONH = { 'Content-Type': 'application/json; charset=utf-8' };
const ok = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSONH });
const err = (m, s = 400) => new Response(JSON.stringify({ error: m }), { status: s, headers: JSONH });

const SCREENS = ['produtos','clientes','estoque','finalizacao','funcionarios','frota','motoristas','mapa','carregamento','entrega','entregues'];

function uid(p) {
  return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function pad(n, l = 3) { return String(n).padStart(l, '0'); }

async function kvGet(k) {
  try {
    const v = await me.puter.kv.get(k);
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } }
    return v;
  } catch (e) { return null; }
}
async function kvSet(k, v) { await me.puter.kv.set(k, JSON.stringify(v)); }
async function getCol(n) { return (await kvGet('col:' + n)) || []; }
async function setCol(n, arr) { await kvSet('col:' + n, arr); }
async function nextSeq(n) {
  try { const v = await me.puter.kv.incr('seq:' + n); return Number(v) || 1; }
  catch (e) { const c = (await kvGet('seq:' + n)) || 0; await kvSet('seq:' + n, c + 1); return c + 1; }
}

async function getAdmin() {
  let a = await kvGet('admin_user');
  if (!a) {
    a = { id: 'admin', name: 'Administrador TI', username: 'admin', password: '102030', role: 'TI', screens: '*' };
    await kvSet('admin_user', a);
  }
  return a;
}

async function findUser(username) {
  const u = String(username || '').trim().toLowerCase();
  const admin = await getAdmin();
  if (u === String(admin.username).toLowerCase()) return admin;
  const emps = await getCol('employees');
  return emps.find(e => String(e.username || '').toLowerCase() === u) || null;
}

function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}

async function auth(request) {
  const t = request.headers.get('x-token');
  if (!t) return null;
  const s = await kvGet('tok:' + t);
  if (!s) return null;
  if (s.exp && Date.now() > s.exp) return null;
  const u = await findUser(s.u);
  if (!u) return null;
  return u;
}
function isAdmin(u) { return u && (u.screens === '*' || u.id === 'admin'); }

async function requireAuth(request) {
  const u = await auth(request);
  if (!u) throw new Response(JSON.stringify({ error: 'Sessão expirada. Faça login novamente.' }), { status: 401, headers: JSONH });
  return u;
}
async function body(request) { try { return await request.json(); } catch (e) { return {}; } }

// ---------- AUTH ----------
router.post('/login', async ({ request }) => {
  const b = await body(request);
  const u = await findUser(b.username);
  if (!u || String(u.password) !== String(b.password || '')) return err('Usuário ou senha inválidos.', 401);
  const token = uid('tk') + Math.random().toString(36).slice(2, 10);
  await kvSet('tok:' + token, { u: u.username, exp: Date.now() + 1000 * 60 * 60 * 12 });
  return ok({ token, user: publicUser(u), screens: u.screens === '*' ? SCREENS : (u.screens || []), admin: isAdmin(u) });
});

router.post('/verify', async ({ request }) => {
  const b = await body(request);
  const me_ = await auth(request);
  if (b.kind === 'admin') {
    const a = await getAdmin();
    return ok({ valid: String(a.password) === String(b.password || '') });
  }
  if (b.kind === 'self') {
    if (!me_) return ok({ valid: false });
    return ok({ valid: String(me_.password) === String(b.password || '') });
  }
  const u = await findUser(b.username);
  return ok({ valid: !!u && String(u.password) === String(b.password || '') });
});

router.post('/logout', async ({ request }) => {
  const t = request.headers.get('x-token');
  if (t) { try { await me.puter.kv.del('tok:' + t); } catch (e) {} }
  return ok({ done: true });
});

// ---------- STATE ----------
router.get('/state', async ({ request }) => {
  const u = await auth(request);
  if (!u) return err('Sessão expirada.', 401);
  const [products, clients, employees, fleet, drivers, movements, tripmaps, loads, deliveries] = await Promise.all(
    ['products','clients','employees','fleet','drivers','movements','tripmaps','loads','deliveries'].map(getCol)
  );
  return ok({
    products, clients, fleet, drivers, movements, tripmaps, loads, deliveries,
    employees: employees.map(e => isAdmin(u) ? e : publicUser(e)),
    me: publicUser(u), admin: isAdmin(u),
    screens: u.screens === '*' ? SCREENS : (u.screens || [])
  });
});

// ---------- GENERIC CRUD ----------
const CRUD = { products: 'prd', clients: 'cli', fleet: 'veh', drivers: 'drv', employees: 'emp' };

router.post('/col/:name', async ({ request, params }) => {
  const u = await auth(request); if (!u) return err('Sessão expirada.', 401);
  const name = params.name;
  if (!CRUD[name]) return err('Coleção inválida');
  if (name === 'employees' && !isAdmin(u)) return err('Apenas o administrador pode cadastrar funcionários.', 403);
  const b = await body(request);
  const arr = await getCol(name);
  const rec = b.record || {};
  if (name === 'products' && rec.code) {
    if (arr.some(p => String(p.code) === String(rec.code) && p.id !== rec.id)) return err('Já existe um produto com este código de barras.');
  }
  if (name === 'employees' && rec.username) {
    const admin = await getAdmin();
    if (String(rec.username).toLowerCase() === String(admin.username).toLowerCase()) return err('Nome de usuário reservado.');
    if (arr.some(e => String(e.username).toLowerCase() === String(rec.username).toLowerCase() && e.id !== rec.id)) return err('Nome de usuário já utilizado.');
  }
  if (rec.id) {
    const i = arr.findIndex(x => x.id === rec.id);
    if (i < 0) return err('Registro não encontrado', 404);
    arr[i] = { ...arr[i], ...rec, updatedAt: Date.now() };
  } else {
    rec.id = uid(CRUD[name]);
    rec.createdAt = Date.now();
    rec.createdBy = u.name;
    if (name === 'products') rec.stock = 0;
    arr.push(rec);
  }
  await setCol(name, arr);
  return ok({ record: rec });
});

router.post('/col/:name/delete', async ({ request, params }) => {
  const u = await auth(request); if (!u) return err('Sessão expirada.', 401);
  const name = params.name;
  if (!CRUD[name]) return err('Coleção inválida');
  const b = await body(request);
  const admin = await getAdmin();
  if (String(admin.password) !== String(b.adminPassword || '')) return err('Senha do TI incorreta.', 403);
  const arr = await getCol(name);
  const i = arr.findIndex(x => x.id === b.id);
  if (i < 0) return err('Registro não encontrado', 404);
  arr.splice(i, 1);
  await setCol(name, arr);
  return ok({ done: true });
});

// ---------- ENTRADA (finalização) ----------
router.post('/entry', async ({ request }) => {
  const u = await requireAuth(request).catch(r => r);
  if (u instanceof Response) return u;
  const b = await body(request);
  if (String(u.password) !== String(b.password || '')) return err('Senha do funcionário incorreta.', 403);
  const products = await getCol('products');
  const p = products.find(x => x.id === b.productId || String(x.code) === String(b.code));
  if (!p) return err('Produto não encontrado.', 404);
  const qty = Math.max(1, parseInt(b.qty || 1, 10));
  p.stock = (p.stock || 0) + qty;
  const mov = {
    id: uid('mov'), productId: p.id, type: 'entrada', qty, rt: b.rt || '',
    user: u.name, username: u.username, at: Date.now(), note: b.note || ''
  };
  const movs = await getCol('movements');
  movs.push(mov);
  await Promise.all([setCol('products', products), setCol('movements', movs)]);
  return ok({ product: p, movement: mov });
});

// ---------- FOTOS ----------
router.post('/photo', async ({ request }) => {
  const b = await body(request);
  const dataUrl = b.dataUrl || '';
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return err('Imagem inválida');
  const id = uid('ph');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  try {
    const blob = new Blob([bytes], { type: m[1] });
    await me.puter.fs.write('logisys_photos/' + id + '.jpg', blob, { createMissingParents: true, overwrite: true });
    await kvSet('phm:' + id, { store: 'fs', type: m[1] });
  } catch (e) {
    await kvSet('phm:' + id, { store: 'kv', type: m[1] });
    await kvSet('phd:' + id, m[2]);
  }
  return ok({ id });
});

router.get('/photo/:id', async ({ params }) => {
  const id = params.id;
  const meta = await kvGet('phm:' + id);
  if (!meta) return err('Foto não encontrada', 404);
  if (meta.store === 'fs') {
    try {
      const blob = await me.puter.fs.read('logisys_photos/' + id + '.jpg');
      return new Response(blob, { headers: { 'Content-Type': meta.type || 'image/jpeg', 'Cache-Control': 'max-age=31536000' } });
    } catch (e) { return err('Foto indisponível', 404); }
  }
  const b64 = await kvGet('phd:' + id);
  if (!b64) return err('Foto não encontrada', 404);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'Content-Type': meta.type || 'image/jpeg', 'Cache-Control': 'max-age=31536000' } });
});

// ---------- MAPA DE VIAGEM ----------
router.post('/tripmap', async ({ request }) => {
  const u = await auth(request); if (!u) return err('Sessão expirada.', 401);
  const b = await body(request);
  const maps = await getCol('tripmaps');
  let rec = b.record || {};
  if (rec.id) {
    const i = maps.findIndex(m2 => m2.id === rec.id);
    if (i < 0) return err('Mapa não encontrado', 404);
    maps[i] = { ...maps[i], ...rec };
    rec = maps[i];
  } else {
    const n = await nextSeq('tripmap');
    rec.id = uid('map');
    rec.code = 'MV' + pad(n);
    rec.createdAt = Date.now();
    rec.createdBy = u.name;
    rec.status = 'rascunho';
    rec.items = rec.items || [];
    maps.push(rec);
  }
  await setCol('tripmaps', maps);
  return ok({ record: rec });
});

function addrOf(c) {
  if (!c) return '';
  return [c.street, c.number, c.district, c.city, c.state, c.cep].filter(Boolean).join(', ');
}

router.post('/tripmap/:id/plan', async ({ request, params }) => {
  const u = await auth(request); if (!u) return err('Sessão expirada.', 401);
  const maps = await getCol('tripmaps');
  const map = maps.find(m2 => m2.id === params.id);
  if (!map) return err('Mapa não encontrado', 404);
  const [clients, drivers, fleet, products] = await Promise.all([getCol('clients'), getCol('drivers'), getCol('fleet'), getCol('products')]);
  if (!map.items || !map.items.length) return err('Adicione pedidos ao mapa antes de gerar a rota.');
  if (!drivers.length || !fleet.length) return err('Cadastre ao menos um motorista e um veículo.');

  const byClient = {};
  for (const it of map.items) {
    const c = clients.find(x => x.id === it.clientId);
    const key = it.clientId;
    if (!byClient[key]) byClient[key] = { clientId: key, cliente: c ? c.name : '—', cidade: c ? (c.city || '') : '', uf: c ? (c.state || '') : '', pedidos: [] };
    const p = products.find(x => x.id === it.productId);
    byClient[key].pedidos.push({ produto: (p ? (p.code + ' - ' + p.name) : it.desc), quantidade: it.qty });
  }
  const payload = {
    clientes: Object.values(byClient),
    motoristas: drivers.map(d => ({ id: d.id, nome: d.name })),
    veiculos: fleet.map(f => ({ id: f.id, descricao: (f.model || '') + ' - ' + (f.plate || ''), lotacao: f.capacity || '' }))
  };
  const prompt = `Você é um analista de logística brasileiro. Monte um mapa de viagem otimizado.
Dados: ${JSON.stringify(payload)}

Regras:
- Agrupe os clientes por proximidade geográfica das cidades (cidades vizinhas na mesma viagem).
- Atribua cada viagem a UM motorista e UM veículo disponíveis, respeitando a lotação máxima.
- Se uma carga for muito grande ou a cidade for muito distante, crie uma viagem exclusiva e explique na observação.
- Ordene as paradas na melhor sequência de rota (mais próxima primeiro, retornando à base no fim).
Responda SOMENTE com JSON válido, sem markdown, no formato:
{"viagens":[{"motoristaId":"","veiculoId":"","regiao":"","observacao":"","paradas":[{"clientId":"","ordem":1}]}]}`;

  let plan = null;
  try {
    const r = await me.puter.ai.chat(prompt, { model: 'gpt-4o-mini' });
    let txt = '';
    if (typeof r === 'string') txt = r;
    else if (r && r.message && r.message.content) txt = Array.isArray(r.message.content) ? r.message.content.map(c => c.text || '').join('') : r.message.content;
    else if (r && r.text) txt = r.text;
    const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
    if (s >= 0 && e > s) plan = JSON.parse(txt.slice(s, e + 1));
  } catch (e) { plan = null; }

  if (!plan || !Array.isArray(plan.viagens) || !plan.viagens.length) {
    // fallback: agrupa por cidade, distribui entre motoristas
    const groups = {};
    for (const c of Object.values(byClient)) {
      const k = (c.cidade || 'Sem cidade').toUpperCase();
      (groups[k] = groups[k] || []).push(c.clientId);
    }
    plan = { viagens: Object.entries(groups).map(([city, ids], i) => ({
      motoristaId: drivers[i % drivers.length].id,
      veiculoId: fleet[i % fleet.length].id,
      regiao: city,
      observacao: 'Agrupamento automático por cidade (IA indisponível).',
      paradas: ids.map((id, j) => ({ clientId: id, ordem: j + 1 }))
    })) };
  }
  map.plan = plan;
  map.status = 'planejado';
  map.plannedAt = Date.now();
  await setCol('tripmaps', maps);
  return ok({ record: map });
});

// aprova o mapa -> gera carregamentos
router.post('/tripmap/:id/approve', async ({ request, params }) => {
  const u = await auth(request); if (!u) return err('Sessão expirada.', 401);
  const maps = await getCol('tripmaps');
  const map = maps.find(m2 => m2.id === params.id);
  if (!map) return err('Mapa não encontrado', 404);
  if (!map.plan) return err('Gere a rota antes de aprovar.');
  if (map.status === 'aprovado') return err('Mapa já aprovado.');
  const [clients, products, movements, loads] = await Promise.all([getCol('clients'), getCol('products'), getCol('movements'), getCol('loads')]);

  const usedRt = new Set();
  for (const l of loads) for (const s of l.stops) for (const it of s.items) if (it.rt) usedRt.add(it.productId + '|' + it.rt);
  const rtFor = (productId) => {
    const ents = movements.filter(m3 => m3.productId === productId && m3.type === 'entrada' && m3.rt).sort((a, b) => a.at - b.at);
    for (const e of ents) if (!usedRt.has(productId + '|' + e.rt)) { usedRt.add(productId + '|' + e.rt); return e.rt; }
    return ents.length ? ents[ents.length - 1].rt : '';
  };

  const created = [];
  for (const v of map.plan.viagens) {
    const n = await nextSeq('load');
    const stops = (v.paradas || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(p => {
      const c = clients.find(x => x.id === p.clientId);
      const items = map.items.filter(it => it.clientId === p.clientId).map(it => {
        const pr = products.find(x => x.id === it.productId);
        return {
          id: uid('li'), productId: it.productId, code: pr ? pr.code : '', name: pr ? pr.name : (it.desc || ''),
          desc: it.desc || '', qty: it.qty, rt: rtFor(it.productId), status: 'pendente'
        };
      });
      return { id: uid('st'), clientId: p.clientId, client: c ? c.name : '—', city: c ? c.city : '', address: addrOf(c), items };
    }).filter(s => s.items.length);
    if (!stops.length) continue;
    const load = {
      id: uid('load'), code: 'CG' + pad(n), mapId: map.id, mapCode: map.code,
      driverId: v.motoristaId, vehicleId: v.veiculoId, region: v.regiao || '', note: v.observacao || '',
      status: 'aberto', createdAt: Date.now(), stops
    };
    loads.push(load); created.push(load);
  }
  map.status = 'aprovado';
  map.approvedAt = Date.now();
  map.approvedBy = u.name;
  await Promise.all([setCol('tripmaps', maps), setCol('loads', loads)]);
  return ok({ loads: created });
});

// ---------- CARREGAMENTO ----------
router.post('/load/:id/item', async ({ request, params }) => {
  const u = await auth(request); if (!u) return err('Sessão expirada.', 401);
  const b = await body(request);
  const loads = await getCol('loads');
  const load = loads.find(l => l.id === params.id);
  if (!load) return err('Carregamento não encontrado', 404);
  if (load.status !== 'aberto') return err('Carga já liberada.');
  let item = null;
  for (const s of load.stops) { const f = s.items.find(i => i.id === b.itemId); if (f) { item = f; break; } }
  if (!item) return err('Item não encontrado', 404);
  if (item.status === 'ok') return err('Item já conferido. Cancele para alterar.');
  if (b.action === 'confirm') {
    item.status = 'ok'; item.photoId = b.photoId || ''; item.scanCode = b.scanCode || '';
    item.by = u.name; item.at = Date.now(); item.cancelReason = '';
  } else if (b.action === 'cancel') {
    if (!b.reason) return err('Informe o motivo do cancelamento.');
    item.status = 'cancelado'; item.cancelReason = b.reason; item.by = u.name; item.at = Date.now();
  } else if (b.action === 'reopen') {
    item.status = 'pendente'; item.cancelReason = ''; item.photoId = '';
  }
  await setCol('loads', loads);
  return ok({ load });
});

router.post('/load/:id/release', async ({ request, params }) => {
  const u = await auth(request); if (!u) return err('Sessão expirada.', 401);
  const [loads, products, movements, deliveries, clients] = await Promise.all([getCol('loads'), getCol('products'), getCol('movements'), getCol('deliveries'), getCol('clients')]);
  const load = loads.find(l => l.id === params.id);
  if (!load) return err('Carregamento não encontrado', 404);
  if (load.status !== 'aberto') return err('Carga já liberada.');
  const pending = load.stops.some(s => s.items.some(i => i.status === 'pendente'));
  if (pending) return err('Ainda existem produtos pendentes de conferência.');

  let seq = 0;
  for (const s of load.stops) {
    const okItems = s.items.filter(i => i.status === 'ok');
    if (!okItems.length) continue;
    for (const it of okItems) {
      const p = products.find(x => x.id === it.productId);
      if (p) {
        p.stock = (p.stock || 0) - Number(it.qty || 0);
        movements.push({ id: uid('mov'), productId: p.id, type: 'saida', qty: Number(it.qty || 0), rt: it.rt || '', user: u.name, username: u.username, at: Date.now(), note: 'Carregamento ' + load.code });
      }
    }
    const n = await nextSeq('delivery');
    seq++;
    const c = clients.find(x => x.id === s.clientId);
    deliveries.push({
      id: uid('dlv'), code: 'N' + pad(n), loadId: load.id, loadCode: load.code, driverId: load.driverId,
      vehicleId: load.vehicleId, clientId: s.clientId, client: s.client, city: s.city,
      address: s.address || addrOf(c), seq, status: 'pendente', createdAt: Date.now(),
      items: okItems.map(i => ({ code: i.code, name: i.name, qty: i.qty, rt: i.rt }))
    });
  }
  load.status = 'liberado';
  load.releasedAt = Date.now();
  load.releasedBy = u.name;
  await Promise.all([setCol('loads', loads), setCol('products', products), setCol('movements', movements), setCol('deliveries', deliveries)]);
  return ok({ done: true });
});

// ---------- ENTREGA ----------
router.post('/delivery/:id/finish', async ({ request, params }) => {
  const u = await auth(request); if (!u) return err('Sessão expirada.', 401);
  const b = await body(request);
  const deliveries = await getCol('deliveries');
  const d = deliveries.find(x => x.id === params.id);
  if (!d) return err('Entrega não encontrada', 404);
  if (d.status === 'entregue') return err('Entrega já finalizada.');
  if (!b.photoProduct || !b.photoNota) return err('Envie a foto do produto e da nota assinada.');
  d.status = 'entregue';
  d.photoProduct = b.photoProduct;
  d.photoNota = b.photoNota;
  d.receiver = b.receiver || '';
  d.finishedAt = Date.now();
  d.finishedBy = u.name;
  await setCol('deliveries', deliveries);
  return ok({ record: d });
});

router.get('/', async () => ok({ app: 'LogiSys', ok: true, screens: SCREENS }));
