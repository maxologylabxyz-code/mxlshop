'use strict';
/* MXLSHOP server — Node.js 18+ , no external dependencies */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), readline = require('readline');
const ROOT = __dirname, PORT = +process.env.PORT || 3000, HOST = process.env.HOST || '127.0.0.1';
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data'), UP = process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'), PUB = path.join(ROOT, 'public');
for (const d of [DATA, UP, path.join(DATA, 'backups')]) fs.mkdirSync(d, { recursive: true });
const DBF = path.join(DATA, 'db.json');

class E extends Error { constructor(m, s = 400) { super(m); this.st = s; } }
const S_ = (v, m) => String(v ?? '').slice(0, m), N_ = (v, d = 0) => { v = +v; return Number.isFinite(v) ? v : d; };
let lastId = 0; const uid = () => (lastId = Math.max(Date.now(), lastId + 1));
const rnd = n => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: n }, () => a[crypto.randomInt(a.length)]).join(''); };
const dk = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/* ---------- passwords ---------- */
const hp = (p, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(p, salt, 32).toString('hex');
function vp(p, h) {
  try {
    if (String(h).includes(':')) { const [s, x] = h.split(':'); return crypto.timingSafeEqual(Buffer.from(x, 'hex'), crypto.scryptSync(p, s, 32)); }
    return crypto.createHash('sha256').update('mxl' + p).digest('hex') === h; // legacy prototype hash
  } catch (e) { return false; }
}

/* ---------- defaults / normalise ---------- */
const CFG0 = () => ({ bg: '', contact: 'LINE: @mxlshop', news: '✦ ยินดีต้อนรับสู่ MXLSHOP ✦', sp: 18, font: 'Prompt', tn: 'โอนเงินแล้วแนบสลิป แอดมินจะตรวจสอบและเติมเครดิตให้', tabs: [], bn: [], bh: 220, lg: 320, mUrl: '', mName: '', ms: 14, ce: 1, cu: 10, pbg: {}, shb: 'round', shc: 'round', sht: 'round', gw: 210, pm: {}, wa: true, wn: 5, ck: true, ckc: 1, ckb: 5, links: [] });
const PAY0 = () => ({ pp: { on: true, num: '', name: '', qr: '' }, bank: { on: true, bank: '', no: '', name: '', qr: '' }, wallet: { on: true, no: '', name: '', qr: '' }, gift: { on: true, note: 'สร้างซองของขวัญ TrueMoney Wallet แล้ววางลิงก์ซองด้านล่าง ยอดในซองต้องตรงกับที่แจ้ง' } });
const GAMES0 = () => ({ wheel: { n: 'วงล้อเสี่ยงโชค', cost: 20, odds: true, prizes: [] }, box: { n: 'กล่องสุ่ม', cost: 30, odds: true, prizes: [] }, coin: { n: 'แลกเหรียญ', prizes: [] } });
const PRZ0 = { img: '', pct: 0, cost: 0, type: 'credit', val: 0, d: [], qty: null, big: false, v: 0 };
function fixPay(c) { const base = PAY0(); const src = c.pay && typeof c.pay == 'object' ? c.pay : {}; c.pay = {}; for (const k in base) c.pay[k] = Object.assign(base[k], src[k] || {}); }
function norm(d) {
  for (const k of ['users', 'products', 'orders', 'topups', 'logs', 'wins', 'codes']) if (!Array.isArray(d[k])) d[k] = [];
  d.sessions = d.sessions && typeof d.sessions == 'object' ? d.sessions : {};
  const old = d.cfg || {}; d.cfg = Object.assign(CFG0(), old); const c = d.cfg;
  if (!old.pay) { const o = PAY0(); if (old.pp && old.pp != '000-000-0000') o.pp.num = old.pp; if (old.qr) o.pp.qr = old.qr; c.pay = o; }
  fixPay(c); delete c.pp; delete c.qr;
  for (const k of ['bn', 'links', 'tabs']) if (!Array.isArray(c[k])) c[k] = [];
  c.tabs = c.tabs.map(t => ({ ...t, subs: Array.isArray(t.subs) ? t.subs : [] }));
  if (!c.pm || typeof c.pm != 'object') c.pm = {}; if (!c.pbg || typeof c.pbg != 'object') c.pbg = {};
  const g0 = GAMES0(); d.games = d.games && typeof d.games == 'object' ? d.games : {};
  for (const k in g0) { d.games[k] = Object.assign(g0[k], d.games[k] || {}); d.games[k].prizes = (Array.isArray(d.games[k].prizes) ? d.games[k].prizes : []).map(p => ({ ...PRZ0, ...p, d: Array.isArray(p.d) ? p.d : [] })); }
  d.users.forEach(u => { u.coins = N_(u.coins); u.credit = N_(u.credit); u.role = u.role == 'admin' ? 'admin' : 'user'; delete u.cart; });
  d.products.forEach(p => { p.stock = Array.isArray(p.stock) ? p.stock : []; p.qty = N_(p.qty); p.sold = N_(p.sold); p.claimed = N_(p.claimed); p.v = N_(p.v); p.kind = p.kind == 'ship' ? 'ship' : 'dig'; p.cat = p.cat || ''; p.sub = p.sub || ''; });
  d.codes.forEach(c => { c.by = Array.isArray(c.by) ? c.by : []; c.used = N_(c.used); });
  return d;
}

/* ---------- storage ---------- */
let DB = null;
try { DB = JSON.parse(fs.readFileSync(DBF, 'utf8')); } catch (e) { if (fs.existsSync(DBF)) { console.error('Cannot read db.json:', e.message, '\nRestore from data/backups if needed.'); process.exit(1); } }
let firstPw = '';
if (!DB) DB = {};
norm(DB);
if (!DB.users.some(u => u.role == 'admin')) { firstPw = process.env.ADMIN_PASSWORD || rnd(14); DB.users.push({ u: 'adminmxl', h: hp(firstPw), credit: 0, coins: 0, role: 'admin' }); }
let dirty = true, timer = null;
function save() { dirty = true; if (!timer) timer = setTimeout(flush, 250); }
function flush() { timer = null; if (!dirty) return; dirty = false; const t = DBF + '.tmp'; fs.writeFileSync(t, JSON.stringify(DB)); fs.renameSync(t, DBF); }
function backup() { try { flush(); const dir = path.join(DATA, 'backups'), f = path.join(dir, 'db-' + dk(Date.now()) + '.json'); if (!fs.existsSync(f) && fs.existsSync(DBF)) fs.copyFileSync(DBF, f); for (const n of fs.readdirSync(dir).sort().slice(0, -14)) fs.unlinkSync(path.join(dir, n)); } catch (e) { console.error('backup:', e.message); } }
for (const t in DB.sessions) if (DB.sessions[t].exp < Date.now()) delete DB.sessions[t];
flush(); backup(); setInterval(backup, 36e5).unref();
process.on('SIGINT', () => { flush(); process.exit(0); }); process.on('SIGTERM', () => { flush(); process.exit(0); });

/* ---------- reset admin CLI ---------- */
if (process.argv.includes('--reset-admin')) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('New admin password (10+ characters): ', pw => {
    rl.close();
    if (pw.length < 10) { console.log('Too short. Nothing changed.'); process.exit(1); }
    let a = DB.users.find(u => u.role == 'admin'); if (!a) { a = { u: 'adminmxl', credit: 0, coins: 0, role: 'admin' }; DB.users.push(a); }
    a.h = hp(pw); for (const t in DB.sessions) if (DB.sessions[t].u == a.u) delete DB.sessions[t];
    flush(); console.log('Admin "' + a.u + '" password updated. Start the server again.'); process.exit(0);
  });
} else main();

/* ---------- helpers ---------- */
const RL = new Map();
function rl(key, max, win) { const n = Date.now(), a = (RL.get(key) || []).filter(t => n - t < win); if (a.length >= max) return false; a.push(n); RL.set(key, a); return true; }
setInterval(() => { const n = Date.now(); for (const [k, a] of RL) if (!a.some(t => n - t < 36e5)) RL.delete(k); }, 6e5).unref();
function mkTok(u) { const t = crypto.randomBytes(32).toString('hex'); DB.sessions[t] = { u, exp: Date.now() + 30 * 864e5 }; save(); return t; }
function getAuth(req) { const h = req.headers.authorization || '', t = h.startsWith('Bearer ') ? h.slice(7) : '', s = Object.prototype.hasOwnProperty.call(DB.sessions, t) ? DB.sessions[t] : null; if (!s || s.exp < Date.now()) return null; const u = DB.users.find(x => x.u == s.u); return u ? { u, t } : null; }
function urlOk(u) { u = String(u || '').trim().slice(0, 500); if (!u) return ''; if (!/^https?:\/\//i.test(u)) { if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) u = 'https://' + u; else return ''; } try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } }
function ext(v) { // move embedded images (data URLs) into /uploads, replace with /u/<hash>.<ext>
  if (typeof v == 'string') {
    const m = /^data:image\/(png|jpeg|webp|gif);base64,/.exec(v);
    if (m) { const buf = Buffer.from(v.slice(m[0].length), 'base64'); if (buf.length > 8e6) throw new E('ไฟล์รูปใหญ่เกินไป (สูงสุด 8 MB)'); const n = crypto.createHash('sha1').update(buf).digest('hex') + '.' + (m[1] == 'jpeg' ? 'jpg' : m[1]); const f = path.join(UP, n); if (!fs.existsSync(f)) fs.writeFileSync(f, buf); return '/u/' + n; }
    return v;
  }
  if (Array.isArray(v)) return v.map(ext);
  if (v && typeof v == 'object') { for (const k of Object.keys(v)) v[k] = ext(v[k]); }
  return v;
}
const stk = p => p.kind == 'ship' ? p.qty : p.stock.length;
const avl = p => p.type == 'code' ? p.d.length > 0 : (p.qty == null || p.qty > 0);
const mask = u => u.slice(0, 2) + '***';
const pubUser = u => { const o = { ...u }; delete o.h; return o; };
function view(a) {
  const adm = a && a.u.role == 'admin';
  const S = {
    cfg: DB.cfg, meU: a ? a.u.u : null,
    products: DB.products.map(p => adm ? p : { ...p, stock: p.stock.map(() => '') }),
    games: Object.fromEntries(Object.entries(DB.games).map(([k, g]) => [k, adm ? g : { ...g, prizes: g.prizes.map(p => ({ ...p, d: p.d.map(() => ''), pct: g.odds === false ? 0 : p.pct })) }])),
    wins: DB.wins.map(w => adm ? w : { ...w, u: mask(w.u) }),
    users: [], orders: [], logs: [], topups: [], codes: []
  };
  if (adm) { S.users = DB.users.map(pubUser); S.orders = DB.orders.slice(0, 2000); S.logs = DB.logs.slice(0, 1500); S.topups = DB.topups.slice(0, 1500); S.codes = DB.codes; }
  else if (a) { const n = a.u.u; S.users = [pubUser(a.u)]; S.orders = DB.orders.filter(o => o.u == n).slice(0, 200); S.logs = DB.logs.filter(o => o.u == n).slice(0, 200); S.topups = DB.topups.filter(o => o.u == n).slice(0, 100); S.codes = DB.codes.filter(c => c.owner == n); }
  return S;
}
function vcode(u, code) {
  code = String(code || '').trim().toUpperCase(); const c = DB.codes.find(x => x.code.toUpperCase() == code);
  if (!c || !c.on) throw new E('ไม่พบโค้ดนี้'); if (c.exp && Date.now() > new Date(c.exp).getTime() + 864e5) throw new E('โค้ดหมดอายุแล้ว');
  if (c.max && c.used >= c.max) throw new E('โค้ดถูกใช้ครบแล้ว'); if (c.owner && c.owner != u.u) throw new E('โค้ดนี้ไม่ใช่ของคุณ'); if (c.by.includes(u.u)) throw new E('คุณใช้โค้ดนี้แล้ว');
  return c;
}
function cleanShip(s) { s = s || {}; const n = S_(s.n, 100).trim(), a = S_(s.a, 500).trim(), t = S_(s.t, 20).trim(); if (!n || !a || !/^[0-9+\- ]{8,15}$/.test(t)) throw new E('กรอกข้อมูลจัดส่งให้ครบ'); return { n, a, t, st: 'w', trk: '' }; }
function roll(g) { const ps = g.prizes, tot = ps.reduce((a, p) => a + p.pct, 0), k = tot > 100 ? 100 / tot : 1, r = crypto.randomInt(0, 1e8) / 1e6; let a = 0; for (const p of ps) { a += p.pct * k; if (r < a) return avl(p) ? p : null; } return null; }
function grant(u, p) {
  let data = '';
  if (p.type == 'credit') u.credit += Math.max(0, p.val);
  else if (p.type == 'coupon') { const c = 'MXL-' + rnd(6); DB.codes.push({ code: c, pct: Math.min(100, Math.max(1, p.val)), max: 1, used: 0, by: [], owner: u.u, on: true, exp: '', note: 'reward' }); data = c; }
  else if (p.type == 'code') data = p.d.shift(); else data = 'ติดต่อแอดมินเพื่อรับรางวัล';
  if (p.type != 'code' && p.qty != null) p.qty--; p.v = (p.v || 0) + 1; return data;
}
function mkLog(u, src, p, data) { return { id: uid(), u: u.u, src, name: p ? p.name : 'ไม่ได้รางวัล', type: p ? p.type : 'none', val: p ? p.val : 0, data, t: Date.now(), st: p && p.type == 'manual' ? 'w' : '' }; }
function addWin(u, src, p, lg) { if (p && p.big) { DB.wins.unshift({ id: lg.id, u: u.u, n: p.name, src, t: lg.t }); DB.wins = DB.wins.slice(0, 50); } }
function fokS(u, p) { const r = (u.fc || {})[p.id] || { n: 0, d: '' }; if (p.lim == 'once' && r.n > 0) throw new E('คุณรับสินค้านี้ไปแล้ว'); if (p.lim == 'daily' && r.d == dk(Date.now())) throw new E('วันนี้คุณรับไปแล้ว'); }

function applyConfig(b) {
  b = ext(b); const warn = [];
  if (b.cfg && typeof b.cfg == 'object') {
    const c = Object.assign(CFG0(), b.cfg); fixPay(c); delete c.pp; delete c.qr;
    for (const k of ['bn', 'links', 'tabs']) if (!Array.isArray(c[k])) c[k] = [];
    c.tabs = c.tabs.map(t => ({ ...t, subs: Array.isArray(t.subs) ? t.subs : [] }));
    if (!c.pm || typeof c.pm != 'object') c.pm = {}; if (!c.pbg || typeof c.pbg != 'object') c.pbg = {};
    c.links = c.links.filter(l => urlOk(l.u)).map(l => ({ ...l, u: urlOk(l.u) }));
    c.bn = c.bn.map(x => { if (x.to && String(x.to).startsWith('http')) x.to = urlOk(x.to); return x; });
    DB.cfg = c;
  }
  if (Array.isArray(b.products)) {
    const old = new Map(DB.products.map(p => [p.id, p]));
    DB.products = b.products.map(q => {
      const free = !!q.free, p = { id: N_(q.id), name: S_(q.name, 100) || 'สินค้า', price: free ? 0 : Math.max(0, N_(q.price)), desc: S_(q.desc, 3000), img: S_(q.img, 300), kind: q.kind == 'ship' ? 'ship' : 'dig', cat: S_(q.cat, 40), sub: S_(q.sub, 40), free, lim: ['daily', 'once'].includes(q.lim) ? q.lim : 'none', stock: (Array.isArray(q.stock) ? q.stock : []).slice(0, 5000).map(s => S_(s, 500)).filter(Boolean), qty: Math.max(0, Math.floor(N_(q.qty))) };
      const o = old.get(p.id);
      if (o) {
        p.sold = o.sold || 0; p.claimed = o.claimed || 0; const chg = JSON.stringify(p.stock) != JSON.stringify(o.stock) || p.qty !== o.qty;
        if (chg && N_(q.v) !== N_(o.v)) { p.stock = o.stock; p.qty = o.qty; p.v = o.v; warn.push(o.name); } else p.v = (o.v || 0) + (chg ? 1 : 0);
      } else { p.sold = 0; p.claimed = 0; p.v = 0; }
      return p;
    });
  }
  if (b.games && typeof b.games == 'object') {
    for (const k of ['wheel', 'box', 'coin']) {
      const g = b.games[k], o = DB.games[k]; if (!g) continue;
      o.n = S_(g.n, 40) || o.n; if (k != 'coin') { o.cost = Math.max(0, N_(g.cost)); o.odds = g.odds !== false; }
      const old = new Map(o.prizes.map(p => [p.id, p]));
      o.prizes = (Array.isArray(g.prizes) ? g.prizes : []).map(q => {
        const p = { id: N_(q.id), name: S_(q.name, 60) || 'รางวัล', img: S_(q.img, 300), pct: Math.min(100, Math.max(0, N_(q.pct))), cost: Math.max(0, N_(q.cost)), type: ['credit', 'coupon', 'code', 'manual'].includes(q.type) ? q.type : 'credit', val: N_(q.val), big: !!q.big, d: (Array.isArray(q.d) ? q.d : []).slice(0, 5000).map(s => S_(s, 500)).filter(Boolean), qty: q.qty == null || q.qty === '' || !Number.isFinite(+q.qty) ? null : Math.max(0, Math.floor(+q.qty)) };
        const ol = old.get(p.id);
        if (ol) { const chg = JSON.stringify(p.d) != JSON.stringify(ol.d) || p.qty !== ol.qty; if (chg && N_(q.v) !== N_(ol.v)) { p.d = ol.d; p.qty = ol.qty; p.v = ol.v; warn.push(ol.name); } else p.v = (ol.v || 0) + (chg ? 1 : 0); } else p.v = 0;
        return p;
      });
    }
  }
  save(); return warn;
}

/* ---------- routes ---------- */
const routes = {}; const R = (m, p, o, fn) => { routes[m + ' ' + p] = { ...o, fn }; };
R('GET', '/api/state', {}, c => view(c.a));
R('GET', '/api/health', {}, () => ({ ok: 1 }));
R('POST', '/api/register', {}, c => {
  const u = S_(c.b.u, 20).trim(), p = String(c.b.p || '');
  if (!rl('reg:' + c.ip, 10, 36e5)) throw new E('สมัครบ่อยเกินไป ลองใหม่ภายหลัง', 429);
  if (!/^\w{3,20}$/.test(u) || p.length < 6 || p.length > 100) throw new E('ชื่อ 3-20 ตัว (a-z,0-9) รหัสผ่าน 6+ ตัว');
  if (/admin/i.test(u)) throw new E('ชื่อนี้สงวนไว้'); if (DB.users.some(x => x.u.toLowerCase() == u.toLowerCase())) throw new E('ชื่อนี้ถูกใช้แล้ว');
  DB.users.push({ u, h: hp(p), credit: 0, coins: 0, role: 'user' }); return { token: mkTok(u) };
});
R('POST', '/api/login', {}, c => {
  const u = String(c.b.u || '').trim(), p = String(c.b.p || '');
  if (!rl('li:' + c.ip, 60, 6e5) || !rl('lu:' + u.toLowerCase(), 10, 6e5)) throw new E('ลองรหัสผิดบ่อยเกินไป รอสักครู่แล้วลองใหม่', 429);
  const x = DB.users.find(y => y.u == u); if (!x || !vp(p, x.h)) throw new E('ชื่อหรือรหัสผ่านไม่ถูกต้อง', 401);
  if (!x.h.includes(':')) { x.h = hp(p); save(); } return { token: mkTok(x.u) };
});
R('POST', '/api/logout', { auth: 1 }, c => { delete DB.sessions[c.a.t]; save(); return { ok: 1 }; });
R('POST', '/api/password', { auth: 1 }, c => {
  const x = c.a.u, o = String(c.b.old || ''), n = String(c.b.new || '');
  if (!vp(o, x.h)) throw new E('รหัสผ่านเดิมไม่ถูกต้อง'); if (n.length < (x.role == 'admin' ? 10 : 6) || n.length > 100) throw new E('รหัสผ่านใหม่สั้นเกินไป');
  x.h = hp(n); for (const t in DB.sessions) if (DB.sessions[t].u == x.u && t != c.a.t) delete DB.sessions[t]; save(); return { ok: 1 };
});
R('POST', '/api/profile', { auth: 1, lim: 4e6 }, c => { const x = c.a.u, b = ext(c.b); x.dn = S_(b.dn, 30).trim(); x.bio = S_(b.bio, 200).trim(); if (typeof b.av == 'string' && b.av.startsWith('/u/')) x.av = b.av; save(); return { ok: 1 }; });
R('POST', '/api/code/check', { auth: 1 }, c => ({ pct: vcode(c.a.u, c.b.code).pct }));
R('POST', '/api/buy', { auth: 1 }, c => {
  const u = c.a.u, b = c.b, ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number))], it = ids.map(i => DB.products.find(p => p.id == i));
  if (!it.length || it.some(p => !p)) throw new E('ตะกร้าว่างหรือมีสินค้าที่ไม่มีแล้ว'); if (it.some(p => p.free)) throw new E('สินค้าแจกฟรีให้กดรับฟรี');
  if (it.some(p => !stk(p))) throw new E('มีสินค้าหมด');
  const t = it.reduce((a, p) => a + p.price, 0); let cd = null, d = 0; if (b.code) { cd = vcode(u, b.code); d = Math.floor(t * cd.pct / 100); }
  const net = t - d; if (u.credit < net) throw new E('เครดิตไม่พอ');
  const ship = it.some(p => p.kind == 'ship') ? cleanShip(b.ship) : null, cn = Math.floor(net / DB.cfg.cu) * DB.cfg.ce;
  const o = { id: uid(), u: u.u, t: Date.now(), ship, paid: net, disc: d, code: cd ? cd.code : '', coins: cn, items: it.map(p => { const sh = p.kind == 'ship'; if (sh) p.qty--; p.v = (p.v || 0) + 1; p.sold++; return { pid: p.id, name: p.name, price: p.price, sh, data: sh ? '' : p.stock.shift() }; }) };
  u.credit -= net; u.coins += cn; if (cd) { cd.used++; cd.by.push(u.u); } DB.orders.unshift(o); save(); return { id: o.id };
});
R('POST', '/api/claim', { auth: 1 }, c => {
  const u = c.a.u, p = DB.products.find(x => x.id == c.b.id); if (!p || !p.free) throw new E('ไม่พบสินค้า'); fokS(u, p); if (!stk(p)) throw new E('สินค้าหมด');
  const sh = p.kind == 'ship', ship = sh ? cleanShip(c.b.ship) : null; if (sh) p.qty--; p.v = (p.v || 0) + 1; p.claimed++;
  const o = { id: uid(), u: u.u, t: Date.now(), ship, paid: 0, disc: 0, code: '', coins: 0, free: true, items: [{ pid: p.id, name: p.name, price: 0, sh, data: sh ? '' : p.stock.shift() }] };
  u.fc = u.fc || {}; const r = u.fc[p.id] || { n: 0 }; u.fc[p.id] = { n: r.n + 1, d: dk(Date.now()) }; DB.orders.unshift(o); save(); return { id: o.id };
});
R('POST', '/api/play', { auth: 1 }, c => {
  const u = c.a.u, k = c.b.k; if (!['wheel', 'box'].includes(k)) throw new E('ไม่พบเกม'); const g = DB.games[k];
  if (!g.prizes.length) throw new E('ยังไม่มีรางวัล'); if (u.credit < g.cost) throw new E('เครดิตไม่พอ กรุณาเติมเครดิต');
  u.credit -= g.cost; const p = roll(g), data = p ? grant(u, p) : '', lg = mkLog(u, k, p, data); DB.logs.unshift(lg); addWin(u, k, p, lg); save(); return { pid: p ? p.id : 0, lg };
});
R('POST', '/api/redeem', { auth: 1 }, c => {
  const u = c.a.u, p = DB.games.coin.prizes.find(x => x.id == c.b.id); if (!p || u.coins < p.cost || !avl(p)) throw new E('แลกไม่ได้');
  u.coins -= p.cost; const data = grant(u, p), lg = mkLog(u, 'coin', p, data); DB.logs.unshift(lg); addWin(u, 'coin', p, lg); save(); return { pid: p.id, lg };
});
R('POST', '/api/checkin', { auth: 1 }, c => {
  const u = c.a.u, k = dk(Date.now()); if (!DB.cfg.ck) throw new E('ปิดระบบเช็กอินอยู่'); if (u.ckd == k) throw new E('วันนี้เช็กอินแล้ว');
  u.cks = u.ckd == dk(Date.now() - 864e5) ? (u.cks || 0) + 1 : 1; u.ckd = k; let b = DB.cfg.ckc; if (u.cks % 7 == 0) b += DB.cfg.ckb; u.coins += b; save();
  return { msg: 'เช็กอินวันที่ ' + u.cks + ' ได้รับ ' + b + ' เหรียญ' };
});
R('POST', '/api/topup', { auth: 1, lim: 12e6 }, c => {
  const u = c.a.u, b = ext(c.b), m = b.m, amt = N_(b.amt);
  if (!['pp', 'bank', 'wallet', 'gift'].includes(m) || !DB.cfg.pay[m].on) throw new E('ช่องทางนี้ไม่เปิดให้ใช้'); if (!(amt > 0 && amt <= 1e6)) throw new E('ยอดเงินไม่ถูกต้อง');
  if (!rl('tp:' + u.u, 20, 36e5)) throw new E('ส่งบ่อยเกินไป ลองใหม่ภายหลัง', 429); if (DB.topups.filter(x => x.u == u.u && x.st == 'w').length >= 10) throw new E('มีรายการรอตรวจสอบมากเกินไป');
  const o = { id: uid(), u: u.u, amt, msg: S_(b.msg, 300), st: 'w', t: Date.now(), m };
  if (m == 'gift') { const l = urlOk(b.lnk); if (!l) throw new E('ลิงก์ซองของขวัญไม่ถูกต้อง'); if (DB.topups.some(x => x.lnk == l)) throw new E('ลิงก์นี้เคยถูกส่งแล้ว'); o.lnk = l; }
  else { if (typeof b.slip != 'string' || !b.slip.startsWith('/u/')) throw new E('กรุณาแนบสลิป (รูปภาพ)'); o.img = b.slip; }
  DB.topups.unshift(o); save(); return { ok: 1 };
});
/* admin */
R('PUT', '/api/admin/config', { adm: 1, lim: 40e6 }, c => ({ warn: applyConfig(c.b) }));
R('POST', '/api/admin/topup', { adm: 1 }, c => { const x = DB.topups.find(y => y.id == c.b.id); if (!x || x.st != 'w') throw new E('รายการนี้ดำเนินการแล้ว'); x.st = c.b.ok ? 'ok' : 'no'; if (c.b.ok) { const u = DB.users.find(y => y.u == x.u); if (u) u.credit += x.amt; } save(); return { ok: 1 }; });
R('POST', '/api/admin/topup/amount', { adm: 1 }, c => { const x = DB.topups.find(y => y.id == c.b.id), a = N_(c.b.amt); if (!x || x.st != 'w' || !(a > 0 && a <= 1e6)) throw new E('แก้ยอดไม่ได้'); x.amt = a; save(); return { ok: 1 }; });
R('POST', '/api/admin/credit', { adm: 1 }, c => { const u = DB.users.find(y => y.u == c.b.u); if (!u) throw new E('ไม่พบสมาชิก'); u.credit = Math.max(0, u.credit + N_(c.b.delta)); save(); return { ok: 1 }; });
R('POST', '/api/admin/user/password', { adm: 1 }, c => { const u = DB.users.find(y => y.u == c.b.u), p = String(c.b.p || ''); if (!u) throw new E('ไม่พบสมาชิก'); if (p.length < (u.role == 'admin' ? 10 : 6) || p.length > 100) throw new E('รหัสผ่านสั้นเกินไป'); u.h = hp(p); for (const t in DB.sessions) if (DB.sessions[t].u == u.u) delete DB.sessions[t]; save(); return { ok: 1 }; });
R('POST', '/api/admin/user/delete', { adm: 1 }, c => {
  const n = c.b.u, u = DB.users.find(y => y.u == n); if (!u || u.role == 'admin') throw new E('ลบไม่ได้');
  DB.users = DB.users.filter(y => y.u != n); for (const k of ['orders', 'logs', 'topups', 'wins']) DB[k] = DB[k].filter(o => o.u != n); DB.codes = DB.codes.filter(x => x.owner != n);
  for (const t in DB.sessions) if (DB.sessions[t].u == n) delete DB.sessions[t]; save(); return { ok: 1 };
});
R('POST', '/api/admin/ship', { adm: 1 }, c => { const o = DB.orders.find(x => x.id == c.b.id && x.ship); if (!o) throw new E('ไม่พบออเดอร์'); o.ship.st = c.b.st == 'd' ? 'd' : 'w'; o.ship.trk = S_(c.b.trk, 100); save(); return { ok: 1 }; });
R('POST', '/api/admin/deliver', { adm: 1 }, c => { const x = DB.logs.find(y => y.id == c.b.id && y.type == 'manual'); if (!x) throw new E('ไม่พบรายการ'); x.st = x.st == 'd' ? 'w' : 'd'; save(); return { ok: 1 }; });
R('POST', '/api/admin/delete', { adm: 1 }, c => { const m = { log: 'logs', win: 'wins', order: 'orders', topup: 'topups' }[c.b.kind]; if (!m) throw new E('ไม่ถูกต้อง'); DB[m] = DB[m].filter(x => x.id != c.b.id); save(); return { ok: 1 }; });
R('POST', '/api/admin/wipe', { adm: 1 }, c => {
  const k = c.b.k; if (k == 'logs') DB.logs = []; else if (k == 'orders') DB.orders = []; else if (k == 'topups') DB.topups = DB.topups.filter(x => x.st == 'w'); else if (k == 'wins') DB.wins = [];
  else if (k == 'codes') DB.codes = DB.codes.filter(x => !((x.max && x.used >= x.max) || (x.exp && Date.now() > new Date(x.exp).getTime() + 864e5))); else if (k == 'sold') DB.products.forEach(p => { p.sold = 0; }); else throw new E('ไม่ถูกต้อง');
  save(); return { ok: 1 };
});
R('POST', '/api/admin/code', { adm: 1 }, c => {
  const b = c.b;
  if (b.op == 'create') {
    const code = S_(b.code, 20).trim().toUpperCase() || ('MXL' + rnd(5)), pct = N_(b.pct);
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw new E('โค้ดใช้ A-Z 0-9 - _ ยาว 3-20 ตัว'); if (DB.codes.some(x => x.code.toUpperCase() == code)) throw new E('มีโค้ดนี้แล้ว'); if (!(pct > 0 && pct <= 100)) throw new E('ส่วนลด 1-100%');
    DB.codes.unshift({ code, pct, max: Math.max(0, Math.floor(N_(b.max))), used: 0, by: [], owner: '', on: true, exp: S_(b.exp, 10), note: 'admin' }); save(); return { code };
  }
  const x = DB.codes.find(y => y.code == b.code); if (!x) throw new E('ไม่พบโค้ด');
  if (b.op == 'toggle') x.on = !x.on; else if (b.op == 'delete') DB.codes = DB.codes.filter(y => y !== x); else throw new E('ไม่ถูกต้อง');
  save(); return { ok: 1 };
});
R('GET', '/api/admin/backup', { adm: 1 }, () => { const o = { ...DB }; delete o.sessions; return o; });
R('POST', '/api/admin/restore', { adm: 1, lim: 120e6 }, c => {
  const d = c.b.data; if (!d || !Array.isArray(d.users) || !Array.isArray(d.products) || !d.cfg) throw new E('ข้อมูลสำรองไม่ถูกต้อง');
  flush(); fs.copyFileSync(DBF, path.join(DATA, 'backups', 'before-restore-' + Date.now() + '.json'));
  const me = DB.users.find(u => u.u == c.a.u.u), sess = DB.sessions; ext(d); const nd = norm(d); nd.sessions = {};
  if (!nd.users.some(u => u.u == me.u)) nd.users.push(me); let note = '';
  if (!nd.users.some(u => u.role == 'admin')) { me.role = 'admin'; }
  for (const t in sess) if (nd.users.some(u => u.u == sess[t].u) && sess[t].exp > Date.now()) nd.sessions[t] = sess[t];
  DB = nd; save(); return { note: note || 'กู้คืนข้อมูลแล้ว' };
});
R('PUT', '/api/admin/music', { adm: 1, raw: 1, lim: 20e6 }, c => {
  const nm = decodeURIComponent(String(c.req.headers['x-filename'] || 'music.mp3')), ex = (path.extname(nm).slice(1) || 'mp3').toLowerCase();
  if (!['mp3', 'm4a', 'ogg', 'wav', 'aac', 'webm'].includes(ex)) throw new E('รองรับไฟล์ mp3 m4a ogg wav aac webm'); if (!c.raw.length) throw new E('ไฟล์ว่าง');
  const old = DB.cfg.mUrl; const fn = 'music-' + Date.now() + '.' + ex; fs.writeFileSync(path.join(UP, fn), c.raw);
  if (old && old.startsWith('/u/music-')) fs.promises.unlink(path.join(UP, path.basename(old))).catch(() => { });
  DB.cfg.mUrl = '/u/' + fn; DB.cfg.mName = S_(nm, 100); save(); return { ok: 1 };
});
R('DELETE', '/api/admin/music', { adm: 1 }, () => { const old = DB.cfg.mUrl; if (old && old.startsWith('/u/music-')) fs.promises.unlink(path.join(UP, path.basename(old))).catch(() => { }); DB.cfg.mUrl = ''; DB.cfg.mName = ''; save(); return { ok: 1 }; });

/* ---------- http ---------- */
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac', webm: 'audio/webm', ico: 'image/x-icon' };
function secHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}
const sendJson = (res, code, o) => { const s = JSON.stringify(o); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(s); };
function readBody(req, lim) { return new Promise((ok, no) => { let n = 0; const a = []; req.on('data', c => { n += c.length; if (n > lim) { no(new E('ข้อมูลใหญ่เกินไป', 413)); req.destroy(); } else a.push(c); }); req.on('end', () => ok(Buffer.concat(a))); req.on('error', no); }); }
async function apiCall(req, res, p) {
  const r = routes[req.method + ' ' + p]; if (!r) throw new E('ไม่พบ API', 404);
  const a = getAuth(req); if (r.auth && !a) throw new E('กรุณาเข้าสู่ระบบ', 401); if (r.adm && (!a || a.u.role != 'admin')) throw new E('ไม่มีสิทธิ์', a ? 403 : 401);
  const ip = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  const c = { a, ip, req, b: {}, raw: null };
  if (req.method != 'GET' && req.method != 'DELETE') { const buf = await readBody(req, r.lim || 2e6); if (r.raw) c.raw = buf; else if (buf.length) { try { c.b = JSON.parse(buf.toString('utf8')); } catch (e) { throw new E('ข้อมูลไม่ถูกต้อง'); } if (!c.b || typeof c.b != 'object') c.b = {}; } }
  sendJson(res, 200, await r.fn(c));
}
function serveFile(req, res, f, immutable) {
  fs.stat(f, (er, st) => {
    if (er || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ex = path.extname(f).slice(1).toLowerCase(), h = { 'Content-Type': MIME[ex] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let s = m[1] ? +m[1] : Math.max(0, st.size - +m[2]), e = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (s > e || s >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      res.writeHead(206, { ...h, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Content-Length': e - s + 1 }); return fs.createReadStream(f, { start: s, end: e }).pipe(res);
    }
    res.writeHead(200, { ...h, 'Content-Length': st.size }); fs.createReadStream(f).pipe(res);
  });
}
function main() {
  const srv = http.createServer(async (req, res) => {
    try {
      const p = new URL(req.url, 'http://x').pathname; secHeaders(res);
      if (p.startsWith('/api/')) return await apiCall(req, res, p);
      if (req.method != 'GET' && req.method != 'HEAD') throw new E('ไม่รองรับ', 405);
      if (p.startsWith('/u/')) { const n = path.basename(decodeURIComponent(p.slice(3))); if (!/^[\w.-]+$/.test(n)) throw new E('ไม่พบ', 404); return serveFile(req, res, path.join(UP, n), true); }
      return serveFile(req, res, path.join(PUB, 'index.html'), false);
    } catch (e) {
      if (!(e instanceof E)) console.error(e);
      if (!res.headersSent) sendJson(res, e.st || 500, { e: e instanceof E ? e.message : 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์' });
    }
  });
  srv.listen(PORT, HOST, () => {
    console.log('\n=== MXLSHOP server running ===\nOpen: http://localhost:' + PORT + (HOST != '127.0.0.1' ? '   (listening on ' + HOST + ')' : ''));
    if (firstPw) { console.log('\nFIRST-TIME ADMIN LOGIN\n  username: adminmxl\n  password: ' + firstPw + '\n  (change it after login; this is shown only once)\n'); fs.writeFileSync(path.join(DATA, 'FIRST-ADMIN-PASSWORD.txt'), 'username: adminmxl\npassword: ' + firstPw + '\nDelete this file after you change the password.\n'); }
  });
  module.exports = srv;
}
