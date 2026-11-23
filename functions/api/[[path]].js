// API ทั้งหมดของ AIR Drone Puzzle Mission (Cloudflare Pages Functions)
// env.DB = D1, env.IMAGES = KV, env.ADMIN_PASSWORD = รหัสผ่านหน้า admin
import { ensureDb } from '../../lib/bootstrap.js';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
const err = (msg, status = 400) => json({ error: msg }, status);
const now = () => Date.now();
const GRACE_MS = 3000;
const GROUP_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#84cc16', '#f43f5e', '#0ea5e9', '#d946ef', '#10b981', '#f59e0b'];

const GAME_FIELDS = ['sort','name','name_en','tagline','duration','team_info','goal','rules','steps','tips','win','color','image','item_label','reveal','visible'];
const ITEM_FIELDS = ['title','hint','mission','art','image','choices','correct','category','on_field','size','answer','sort','active'];

// ---------- auth admin ----------
const COOKIE = 'air_admin';
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function secretOf(env) {
  if (!env.ADMIN_PASSWORD) throw new Error('ยังไม่ได้ตั้งค่า ADMIN_PASSWORD');
  return 'air-puzzle:' + env.ADMIN_PASSWORD;
}
async function makeToken(env) {
  const exp = now() + 12 * 3600 * 1000;
  return `${exp}.${await hmac(secretOf(env), String(exp))}`;
}
async function isAdmin(request, env) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!exp || !sig || Number(exp) < now()) return false;
  return sig === (await hmac(secretOf(env), exp));
}
function cookieHeader(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// ---------- helpers ----------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(len = 6, chars = CODE_CHARS) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map(b => chars[b % chars.length]).join('');
}
async function uniqueItemCode(env) {
  for (let i = 0; i < 10; i++) {
    const c = randomCode();
    if (!(await env.DB.prepare('SELECT 1 FROM items WHERE code = ?').bind(c).first())) return c;
  }
  throw new Error('สร้างรหัสไม่สำเร็จ');
}
async function uniqueRoomCode(env) {
  for (let i = 0; i < 10; i++) {
    const c = randomCode(5);
    if (!(await env.DB.prepare('SELECT 1 FROM rooms WHERE code = ?').bind(c).first())) return c;
  }
  throw new Error('สร้างรหัสห้องไม่สำเร็จ');
}
function uniquePins(n, taken = new Set()) {
  const out = [];
  while (out.length < n) {
    const p = String(1000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000));
    if (!taken.has(p)) { taken.add(p); out.push(p); }
  }
  return out;
}
function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  if (Array.isArray(out.choices)) out.choices = JSON.stringify(out.choices);
  return out;
}
async function updateRow(env, table, id, data, stamp = true) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  await env.DB.prepare(`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')}${stamp ? ', updated_at = CURRENT_TIMESTAMP' : ''} WHERE id = ?`)
    .bind(...keys.map(k => data[k]), id).run();
}
const parseChoices = s => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 24);

const getGame = (env, id) => env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(id).first();
const allGames = async env => (await env.DB.prepare('SELECT id, name, name_en, mode, color, duration, sort, visible, item_label, reveal, image, default_image FROM games ORDER BY sort').all()).results;
const getSession = (env, roomId, gameId) => env.DB.prepare('SELECT * FROM sessions WHERE room_id = ? AND game_id = ?').bind(roomId, gameId).first();
async function ensureSession(env, roomId, gameId) {
  await env.DB.prepare('INSERT OR IGNORE INTO sessions (room_id, game_id, status, created_at) VALUES (?, ?, ?, ?)').bind(roomId, gameId, 'waiting', now()).run();
  return getSession(env, roomId, gameId);
}

function sessionView(s) {
  if (!s) return null;
  let status = s.status;
  if (status === 'running' && s.ends_at && now() > s.ends_at) status = 'ended';
  return { id: s.id, status, started_at: s.started_at, ends_at: s.ends_at, now: now() };
}
const acceptsAnswers = s => s && s.status === 'running' && (!s.ends_at || now() <= s.ends_at + GRACE_MS);

// กลุ่มของเครื่องนี้ (จาก header x-group-token)
async function myGroup(env, request) {
  const token = request.headers.get('x-group-token');
  if (!token) return null;
  return env.DB.prepare(
    `SELECT g.id, g.no, g.name, g.color, g.named, g.room_id, r.code AS room_code, r.name AS room_name, r.status AS room_status, r.names_locked
     FROM groups g JOIN rooms r ON r.id = g.room_id WHERE g.token = ?`
  ).bind(token).first();
}

// ---------- คะแนน ----------
// คำนวณคะแนนของทุกกลุ่มใน 1 เกม (auto + manual)
async function sessionStats(env, game, session, groups) {
  const rows = new Map(groups.map(g => [g.id, { group_id: g.id, auto: 0, manual: 0, answered: 0, wrong: 0, submitted: false, time_ms: null }]));
  if (session) {
    const answers = (await env.DB.prepare('SELECT group_id, item_id, choice, correct, created_at FROM answers WHERE session_id = ?').bind(session.id).all()).results;
    const results = (await env.DB.prepare('SELECT group_id, manual, submitted_at FROM results WHERE session_id = ?').bind(session.id).all()).results;
    const start = session.started_at || session.created_at;
    for (const a of answers) {
      const r = rows.get(a.group_id); if (!r) continue;
      r.answered++;
      if (game.mode === 'wildlife') { r.auto += a.correct; if (a.correct < 0) r.wrong++; }
      else if (a.correct > 0) { r.auto++; r.time_ms = Math.max(r.time_ms || 0, a.created_at - start); }
      else r.wrong++;
    }
    for (const x of results) {
      const r = rows.get(x.group_id); if (!r) continue;
      r.manual = x.manual;
      if (x.submitted_at) { r.submitted = true; if (game.mode === 'wildlife') r.time_ms = x.submitted_at - start; }
    }
    rows.answers = answers;
  }
  const list = [...rows.values()];
  list.forEach(r => (r.score = r.auto + r.manual));
  return { list, answers: rows.answers || [] };
}
const rankBy = (list, key = 'score') => {
  list.sort((a, b) => b[key] - a[key] || (a.time_ms ?? Infinity) - (b.time_ms ?? Infinity) || a.no - b.no);
  list.forEach((r, i) => (r.rank = i > 0 && list[i - 1][key] === r[key] && (list[i - 1].time_ms ?? null) === (r.time_ms ?? null) ? list[i - 1].rank : i + 1));
  return list;
};

// สรุปคะแนนทั้งห้อง; publicView = ซ่อนคะแนนอัตโนมัติของเกมที่ยังไม่จบ (quiz / wildlife)
async function roomBoard(env, room, publicView) {
  const groups = (await env.DB.prepare('SELECT id, no, name, color, named, pin, joined_at FROM groups WHERE room_id = ? ORDER BY no').bind(room.id).all()).results;
  const games = (await allGames(env)).filter(g => g.visible);
  const sessions = (await env.DB.prepare('SELECT * FROM sessions WHERE room_id = ?').bind(room.id).all()).results;
  const per = {};
  const gameRows = [];
  for (const game of games) {
    const s = sessions.find(x => x.game_id === game.id);
    const sv = sessionView(s);
    const { list } = await sessionStats(env, game, s, groups);
    const hideAuto = publicView && (game.mode === 'quiz' || game.mode === 'wildlife') && sv?.status !== 'ended';
    for (const r of list) {
      const shown = hideAuto ? r.manual : r.score;
      (per[r.group_id] ||= {})[game.id] = { score: shown, hidden: hideAuto, answered: r.answered, submitted: r.submitted };
    }
    gameRows.push({ id: game.id, name: game.name, mode: game.mode, color: game.color, duration: game.duration, session: sv, hidden: hideAuto });
  }
  const board = groups.map(g => {
    const scores = per[g.id] || {};
    const total = Object.values(scores).reduce((s, x) => s + x.score, 0);
    return { id: g.id, no: g.no, name: g.name, color: g.color, named: g.named, joined: !!g.joined_at, total, scores, ...(publicView ? {} : { pin: g.pin }) };
  });
  rankBy(board, 'total');
  return { groups: board, games: gameRows };
}

// ---------- router ----------
export async function onRequest({ request, env, params }) {
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const method = request.method;
  const route = parts.join('/');

  try {
    await ensureDb(env);

    // ================= PUBLIC: เนื้อหาเกม =================
    if (method === 'GET' && route === 'games') {
      const { results } = await env.DB.prepare(
        'SELECT id, sort, mode, name, name_en, tagline, duration, team_info, color, image, default_image FROM games WHERE visible = 1 ORDER BY sort'
      ).all();
      return json(results);
    }
    if (method === 'GET' && parts[0] === 'games' && parts.length === 2) {
      const g = await env.DB.prepare('SELECT * FROM games WHERE id = ? AND visible = 1').bind(parts[1]).first();
      if (!g) return err('ไม่พบเกม', 404);
      return json(g);
    }
    if (method === 'GET' && parts[0] === 'img' && parts[1]) {
      const { value, metadata } = await env.IMAGES.getWithMetadata(parts[1], { type: 'arrayBuffer' });
      if (!value) return new Response('not found', { status: 404 });
      return new Response(value, { headers: { 'content-type': metadata?.type || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
    }

    // ================= PUBLIC: เข้ากลุ่มด้วยบัตรกลุ่ม =================
    if (method === 'POST' && route === 'join') {
      const { code, pin } = await request.json().catch(() => ({}));
      const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(String(code || '').trim().toUpperCase()).first();
      if (!room) return err('ไม่พบห้องแข่งนี้ ตรวจรหัสห้องอีกครั้ง', 404);
      if (room.status !== 'open') return err('ห้องแข่งนี้ปิดแล้ว');
      const g = await env.DB.prepare('SELECT * FROM groups WHERE room_id = ? AND pin = ?').bind(room.id, String(pin || '').trim()).first();
      if (!g) return err('รหัส PIN ไม่ถูกต้อง ดูที่บัตรกลุ่มอีกครั้ง', 404);
      if (!g.joined_at) await env.DB.prepare('UPDATE groups SET joined_at = ? WHERE id = ?').bind(now(), g.id).run();
      return json({ ok: true, token: g.token, room: { code: room.code, name: room.name }, group: { id: g.id, no: g.no, name: g.name, named: g.named, color: g.color } });
    }

    // ----- กลุ่มของฉัน + ตารางคะแนนห้อง -----
    if (parts[0] === 'me') {
      const me = await myGroup(env, request);
      if (!me) return err('กรุณาสแกนบัตรกลุ่มเพื่อเข้าห้องแข่ง', 401);
      if (method === 'GET' && parts.length === 1) {
        const room = { id: me.room_id, code: me.room_code, name: me.room_name, status: me.room_status, names_locked: me.names_locked };
        const b = await roomBoard(env, room, true);
        const mine = b.groups.find(x => x.id === me.id);
        return json({
          room: { code: room.code, name: room.name, status: room.status, names_locked: !!room.names_locked },
          group: { id: me.id, no: me.no, name: me.name, color: me.color, named: me.named, can_rename: !me.named && !me.names_locked && room.status === 'open' },
          me: mine, games: b.games, board: b.groups,
        });
      }
      if (method === 'POST' && parts[1] === 'name') {
        if (me.named) return err('กลุ่มนี้ตั้งชื่อไปแล้ว ถ้าต้องการเปลี่ยนให้แจ้งครู');
        if (me.names_locked || me.room_status !== 'open') return err('ครูล็อกการตั้งชื่อแล้ว');
        const { name } = await request.json().catch(() => ({}));
        const n = cleanName(name);
        if (n.length < 2) return err('ชื่อกลุ่มสั้นเกินไป');
        const dup = await env.DB.prepare('SELECT 1 FROM groups WHERE room_id = ? AND name = ? AND id != ?').bind(me.room_id, n, me.id).first();
        if (dup) return err('มีกลุ่มอื่นใช้ชื่อนี้แล้ว');
        const r = await env.DB.prepare('UPDATE groups SET name = ?, named = 1 WHERE id = ? AND named = 0').bind(n, me.id).run();
        if (!r.meta.changes) return err('กลุ่มนี้ตั้งชื่อไปแล้ว');
        return json({ ok: true, name: n });
      }
    }

    // ----- เล่นเกม -----
    if (parts[0] === 'play' && parts[1]) {
      const game = await getGame(env, parts[1]);
      if (!game || game.mode === 'none' || !game.visible) return err('เกมนี้ไม่มีระบบเล่นออนไลน์', 404);
      const me = await myGroup(env, request);
      if (!me) return err('กรุณาสแกนบัตรกลุ่มเพื่อเข้าห้องแข่ง', 401);
      const session = await getSession(env, me.room_id, game.id);
      const sv = sessionView(session);

      if (method === 'GET' && parts.length === 2) {
        const items = (await env.DB.prepare(
          game.mode === 'wildlife' ? 'SELECT id, title, art, image FROM items WHERE game_id = ? AND active = 1 ORDER BY sort, id'
            : 'SELECT id, title, art FROM items WHERE game_id = ? AND active = 1 ORDER BY sort, id'
        ).bind(game.id).all()).results;
        let mine = [], res = null;
        if (session) {
          mine = (await env.DB.prepare('SELECT item_id, choice, correct FROM answers WHERE session_id = ? AND group_id = ?').bind(session.id, me.id).all()).results;
          res = await env.DB.prepare('SELECT manual, submitted_at FROM results WHERE session_id = ? AND group_id = ?').bind(session.id, me.id).first();
        }
        const ended = sv?.status === 'ended';
        const showResult = ended || (game.mode === 'quiz' && game.reveal) || game.mode === 'delivery';
        let result = null;
        if (ended) {
          const groups = (await env.DB.prepare('SELECT id, no FROM groups WHERE room_id = ?').bind(me.room_id).all()).results;
          const { list } = await sessionStats(env, game, session, groups);
          list.forEach(r => (r.no = groups.find(g => g.id === r.group_id).no));
          rankBy(list);
          const m = list.find(r => r.group_id === me.id);
          result = { score: m.score, auto: m.auto, manual: m.manual, rank: m.rank, total_groups: list.length, time_ms: m.time_ms };
        }
        const reveal = game.mode === 'wildlife' && ended
          ? (await env.DB.prepare('SELECT id, category, on_field, hint FROM items WHERE game_id = ? AND active = 1').bind(game.id).all()).results : null;
        return json({
          game: { id: game.id, name: game.name, mode: game.mode, color: game.color, duration: game.duration, item_label: game.item_label, tagline: game.tagline },
          room: { code: me.room_code, name: me.room_name },
          group: { id: me.id, no: me.no, name: me.name, color: me.color, submitted_at: res?.submitted_at || null },
          session: sv, items,
          answers: mine.map(a => ({ item_id: a.item_id, choice: a.choice, ...(showResult ? { correct: a.correct } : {}) })),
          result, reveal,
        });
      }

      if (method === 'POST' && parts[2] === 'submit' && game.mode === 'wildlife') {
        if (!acceptsAnswers(session)) return err(!sv || sv.status === 'waiting' ? 'ครูยังไม่เริ่มเกม' : 'หมดเวลาส่งรายงานแล้ว');
        const { item_ids } = await request.json().catch(() => ({}));
        const ids = [...new Set((Array.isArray(item_ids) ? item_ids : []).map(Number))];
        const items = (await env.DB.prepare('SELECT id, category, on_field FROM items WHERE game_id = ? AND active = 1').bind(game.id).all()).results;
        const byId = new Map(items.map(i => [i.id, i]));
        const t = now();
        await env.DB.prepare('INSERT OR IGNORE INTO results (session_id, group_id) VALUES (?, ?)').bind(session.id, me.id).run();
        const claim = await env.DB.prepare('UPDATE results SET submitted_at = ? WHERE session_id = ? AND group_id = ? AND submitted_at IS NULL').bind(t, session.id, me.id).run();
        if (!claim.meta.changes) return err('กลุ่มของคุณส่งรายงานไปแล้ว');
        const stmts = ids.filter(id => byId.has(id)).map(id => {
          const it = byId.get(id);
          const ok = it.on_field && (it.category === 'reserved' || it.category === 'suspect');
          return env.DB.prepare('INSERT OR IGNORE INTO answers (session_id, group_id, item_id, choice, correct, created_at) VALUES (?, ?, ?, 1, ?, ?)')
            .bind(session.id, me.id, id, ok ? 1 : -1, t);
        });
        if (stmts.length) await env.DB.batch(stmts);
        return json({ ok: true, count: stmts.length });
      }
    }

    // ----- สแกน QR -----
    if (parts[0] === 'q' && parts[1]) {
      const it = await env.DB.prepare('SELECT * FROM items WHERE code = ? AND active = 1').bind(parts[1].toUpperCase()).first();
      if (!it) return err('ไม่พบข้อมูลของ QR นี้ หรือถูกปิดใช้งานอยู่', 404);
      const game = await getGame(env, it.game_id);
      if (!game || !['quiz', 'delivery'].includes(game.mode)) return err('QR นี้ไม่ได้ใช้งานแล้ว', 404);
      const me = await myGroup(env, request);
      const session = me ? await getSession(env, me.room_id, game.id) : null;
      const sv = sessionView(session);
      const gameInfo = { id: game.id, name: game.name, mode: game.mode, color: game.color, item_label: game.item_label };
      const group = me ? { id: me.id, name: me.name, color: me.color, room_name: me.room_name } : null;

      if (method === 'GET' && parts.length === 2) {
        const base = { code: it.code, item_id: it.id, title: it.title, art: it.art, image: it.image, game: gameInfo, session: sv, group };
        if (game.mode === 'delivery') return json({ ...base, hint: it.hint, mission: it.mission });
        const mine = session ? await env.DB.prepare('SELECT choice, correct FROM answers WHERE session_id = ? AND group_id = ? AND item_id = ?').bind(session.id, me.id, it.id).first() : null;
        const open = sv?.status === 'running' || sv?.status === 'ended' || mine;
        const showCorrect = mine && (game.reveal || sv?.status === 'ended');
        return json({
          ...base, hint: open ? it.hint : '', choices: open ? parseChoices(it.choices) : [], locked: !open,
          mine: mine ? { choice: mine.choice, ...(showCorrect ? { correct: mine.correct, answer: it.correct } : {}) } : null,
        });
      }
      if (method === 'POST' && parts[2] === 'answer' && game.mode === 'quiz') {
        if (!me) return err('กรุณาสแกนบัตรกลุ่มก่อน', 401);
        if (!acceptsAnswers(session)) return err(!sv || sv.status === 'waiting' ? 'ครูยังไม่เริ่มเกม' : 'หมดเวลาตอบแล้ว');
        const { choice } = await request.json().catch(() => ({}));
        const c = Number(choice);
        if (!Number.isInteger(c) || c < 0 || c >= parseChoices(it.choices).length) return err('กรุณาเลือกคำตอบ');
        const correct = c === it.correct ? 1 : 0;
        const r = await env.DB.prepare('INSERT OR IGNORE INTO answers (session_id, group_id, item_id, choice, correct, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(session.id, me.id, it.id, c, correct, now()).run();
        if (!r.meta.changes) return err('กลุ่มของคุณตอบคำใบ้นี้ไปแล้ว');
        return json({ ok: true, ...(game.reveal ? { correct, answer: it.correct } : {}) });
      }
    }

    // ----- จอคะแนน (สาธารณะ ใช้รหัสห้อง) -----
    if (method === 'GET' && parts[0] === 'board' && parts[1]) {
      const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(parts[1].toUpperCase()).first();
      if (!room) return err('ไม่พบห้องแข่ง', 404);
      const b = await roomBoard(env, room, true);
      const gid = new URL(request.url).searchParams.get('g');
      const out = { room: { code: room.code, name: room.name, status: room.status }, games: b.games, groups: b.groups };
      if (gid) {
        const game = await getGame(env, gid);
        if (!game) return err('ไม่พบเกม', 404);
        const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE game_id = ? AND active = 1').bind(game.id).first()).n;
        const gr = b.games.find(x => x.id === gid);
        const rows = b.groups.map(g => ({ id: g.id, no: g.no, name: g.name, color: g.color, ...(g.scores[gid] || { score: 0 }) }));
        rows.forEach(r => (r.time_ms = null));
        rankBy(rows);
        out.game = { id: game.id, name: game.name, mode: game.mode, color: game.color, duration: game.duration, total, session: gr?.session || null, hidden: gr?.hidden };
        out.rows = rows;
      }
      return json(out);
    }

    // ================= ADMIN =================
    if (parts[0] === 'admin') {
      const sub = parts.slice(1).join('/');
      if (method === 'POST' && sub === 'login') {
        const { password } = await request.json().catch(() => ({}));
        if (!password || password !== env.ADMIN_PASSWORD) return err('รหัสผ่านไม่ถูกต้อง', 401);
        return json({ ok: true }, 200, { 'set-cookie': cookieHeader(request, await makeToken(env), 12 * 3600) });
      }
      if (method === 'POST' && sub === 'logout') return json({ ok: true }, 200, { 'set-cookie': cookieHeader(request, '', 0) });
      if (!(await isAdmin(request, env))) return err('กรุณาเข้าสู่ระบบ', 401);
      if (method === 'GET' && sub === 'me') return json({ ok: true });

      // ---------- ห้องแข่ง ----------
      if (method === 'GET' && sub === 'rooms') {
        const { results } = await env.DB.prepare(
          `SELECT r.*, (SELECT COUNT(*) FROM groups g WHERE g.room_id = r.id) AS group_count,
                  (SELECT COUNT(*) FROM groups g WHERE g.room_id = r.id AND g.joined_at IS NOT NULL) AS joined_count,
                  (SELECT COUNT(*) FROM sessions s WHERE s.room_id = r.id AND s.status = 'running' AND (s.ends_at IS NULL OR s.ends_at > ?)) AS live
           FROM rooms r ORDER BY r.id DESC`
        ).bind(now()).all();
        return json(results);
      }
      if (method === 'POST' && sub === 'rooms') {
        const { name, groups } = await request.json().catch(() => ({}));
        const n = Math.min(40, Math.max(1, parseInt(groups) || 10));
        const nm = String(name || '').trim().slice(0, 80);
        if (!nm) return err('กรุณาใส่ชื่อห้องแข่ง');
        const code = await uniqueRoomCode(env);
        const r = await env.DB.prepare('INSERT INTO rooms (code, name, created_at) VALUES (?, ?, ?)').bind(code, nm, now()).run();
        const rid = r.meta.last_row_id;
        const pins = uniquePins(n);
        await env.DB.batch(pins.map((pin, i) => env.DB.prepare('INSERT INTO groups (room_id, no, name, pin, token, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(rid, i + 1, `กลุ่ม ${i + 1}`, pin, randomCode(24), GROUP_COLORS[i % GROUP_COLORS.length], now())));
        return json({ ok: true, id: rid, code });
      }
      if (parts[1] === 'rooms' && parts[2]) {
        const rid = Number(parts[2]);
        const room = await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(rid).first();
        if (!room) return err('ไม่พบห้องแข่ง', 404);

        if (method === 'GET' && parts.length === 3) {
          const b = await roomBoard(env, room, false);
          return json({ room, ...b });
        }
        if (method === 'PUT' && parts.length === 3) {
          const body = await request.json();
          const data = {};
          if (body.name !== undefined) data.name = String(body.name).trim().slice(0, 80) || room.name;
          if (body.status !== undefined) data.status = body.status === 'closed' ? 'closed' : 'open';
          if (body.names_locked !== undefined) data.names_locked = body.names_locked ? 1 : 0;
          await updateRow(env, 'rooms', rid, data, false);
          return json({ ok: true });
        }
        if (method === 'DELETE' && parts.length === 3) {
          const sids = (await env.DB.prepare('SELECT id FROM sessions WHERE room_id = ?').bind(rid).all()).results.map(s => s.id);
          const stmts = sids.flatMap(id => [env.DB.prepare('DELETE FROM answers WHERE session_id = ?').bind(id), env.DB.prepare('DELETE FROM results WHERE session_id = ?').bind(id)]);
          stmts.push(env.DB.prepare('DELETE FROM sessions WHERE room_id = ?').bind(rid), env.DB.prepare('DELETE FROM groups WHERE room_id = ?').bind(rid), env.DB.prepare('DELETE FROM rooms WHERE id = ?').bind(rid));
          await env.DB.batch(stmts);
          return json({ ok: true });
        }
        if (method === 'POST' && parts[3] === 'groups') {
          const groups = (await env.DB.prepare('SELECT no, pin FROM groups WHERE room_id = ?').bind(rid).all()).results;
          const no = groups.reduce((m, g) => Math.max(m, g.no), 0) + 1;
          const [pin] = uniquePins(1, new Set(groups.map(g => g.pin)));
          await env.DB.prepare('INSERT INTO groups (room_id, no, name, pin, token, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(rid, no, `กลุ่ม ${no}`, pin, randomCode(24), GROUP_COLORS[(no - 1) % GROUP_COLORS.length], now()).run();
          return json({ ok: true });
        }

        // ----- เกมในห้อง -----
        if (parts[3] === 'games' && parts[4]) {
          const game = await getGame(env, parts[4]);
          if (!game) return err('ไม่พบเกม', 404);
          if (method === 'GET' && parts.length === 5) {
            const session = await getSession(env, rid, game.id);
            const groups = (await env.DB.prepare('SELECT id, no, name, color, named FROM groups WHERE room_id = ? ORDER BY no').bind(rid).all()).results;
            const st = await sessionStats(env, game, session, groups);
            const list = st.list.map(r => ({ ...r, ...groups.find(g => g.id === r.group_id) }));
            rankBy(list);
            const items = (await env.DB.prepare('SELECT id, title, art, answer, active FROM items WHERE game_id = ? ORDER BY sort, id').bind(game.id).all()).results;
            return json({ game, session: sessionView(session), groups: list, answers: st.answers, items });
          }
          const act = parts[5];
          if (method === 'POST' && act === 'start') {
            const s = await ensureSession(env, rid, game.id);
            const t = now();
            await env.DB.prepare("UPDATE sessions SET status = 'running', started_at = ?, ends_at = ? WHERE id = ?").bind(t, t + game.duration * 60000, s.id).run();
            return json({ ok: true });
          }
          if (method === 'POST' && act === 'end') {
            const s = await getSession(env, rid, game.id);
            if (s) await env.DB.prepare("UPDATE sessions SET status = 'ended', ends_at = MIN(COALESCE(ends_at, ?), ?) WHERE id = ?").bind(now(), now(), s.id).run();
            return json({ ok: true });
          }
          if (method === 'POST' && act === 'extend') {
            const s = await ensureSession(env, rid, game.id);
            const { minutes } = await request.json().catch(() => ({}));
            const base = Math.max(now(), s.status === 'running' && s.ends_at ? s.ends_at : now());
            await env.DB.prepare("UPDATE sessions SET status = 'running', ends_at = ?, started_at = COALESCE(started_at, ?) WHERE id = ?").bind(base + (Number(minutes) || 1) * 60000, now(), s.id).run();
            return json({ ok: true });
          }
          if (method === 'POST' && act === 'reset') {
            const s = await getSession(env, rid, game.id);
            if (s) await env.DB.batch([
              env.DB.prepare('DELETE FROM answers WHERE session_id = ?').bind(s.id),
              env.DB.prepare('DELETE FROM results WHERE session_id = ?').bind(s.id),
              env.DB.prepare("UPDATE sessions SET status = 'waiting', started_at = NULL, ends_at = NULL WHERE id = ?").bind(s.id),
            ]);
            return json({ ok: true });
          }
          // คะแนนที่ Admin ให้: { group_id, delta } หรือ { group_id, value }
          if (method === 'POST' && act === 'score') {
            const s = await ensureSession(env, rid, game.id);
            const { group_id, delta, value } = await request.json();
            await env.DB.prepare('INSERT OR IGNORE INTO results (session_id, group_id) VALUES (?, ?)').bind(s.id, group_id).run();
            if (value !== undefined) await env.DB.prepare('UPDATE results SET manual = ? WHERE session_id = ? AND group_id = ?').bind(parseInt(value) || 0, s.id, group_id).run();
            else await env.DB.prepare('UPDATE results SET manual = manual + ? WHERE session_id = ? AND group_id = ?').bind(parseInt(delta) || 0, s.id, group_id).run();
            return json({ ok: true });
          }
          if (method === 'POST' && act === 'check') {
            const s = await ensureSession(env, rid, game.id);
            const { group_id, item_id, value } = await request.json();
            if (value) await env.DB.prepare('INSERT INTO answers (session_id, group_id, item_id, choice, correct, created_at) VALUES (?, ?, ?, 1, 1, ?) ON CONFLICT(session_id, group_id, item_id) DO UPDATE SET correct = 1, created_at = excluded.created_at').bind(s.id, group_id, item_id, now()).run();
            else await env.DB.prepare('DELETE FROM answers WHERE session_id = ? AND group_id = ? AND item_id = ?').bind(s.id, group_id, item_id).run();
            return json({ ok: true });
          }
          if (method === 'POST' && act === 'clear-group') {
            const s = await getSession(env, rid, game.id);
            const { group_id } = await request.json();
            if (s) await env.DB.batch([
              env.DB.prepare('DELETE FROM answers WHERE session_id = ? AND group_id = ?').bind(s.id, group_id),
              env.DB.prepare('UPDATE results SET submitted_at = NULL WHERE session_id = ? AND group_id = ?').bind(s.id, group_id),
            ]);
            return json({ ok: true });
          }
        }
      }

      // ---------- กลุ่ม ----------
      if (parts[1] === 'groups' && parts[2]) {
        const gid = Number(parts[2]);
        const g = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(gid).first();
        if (!g) return err('ไม่พบกลุ่ม', 404);
        if (method === 'PUT' && parts.length === 3) {
          const body = await request.json();
          const data = {};
          if (body.name !== undefined) {
            const n = cleanName(body.name);
            if (!n) return err('กรุณาใส่ชื่อกลุ่ม');
            const dup = await env.DB.prepare('SELECT 1 FROM groups WHERE room_id = ? AND name = ? AND id != ?').bind(g.room_id, n, gid).first();
            if (dup) return err('มีกลุ่มอื่นใช้ชื่อนี้แล้ว');
            data.name = n; data.named = 1;
          }
          if (body.unlock) { data.named = 0; }
          await updateRow(env, 'groups', gid, data, false);
          return json({ ok: true });
        }
        if (method === 'POST' && parts[3] === 'repin') {
          const taken = new Set((await env.DB.prepare('SELECT pin FROM groups WHERE room_id = ?').bind(g.room_id).all()).results.map(x => x.pin));
          const [pin] = uniquePins(1, taken);
          await env.DB.prepare('UPDATE groups SET pin = ?, token = ?, joined_at = NULL WHERE id = ?').bind(pin, randomCode(24), gid).run();
          return json({ ok: true, pin });
        }
        if (method === 'DELETE') {
          await env.DB.batch([
            env.DB.prepare('DELETE FROM answers WHERE group_id = ?').bind(gid),
            env.DB.prepare('DELETE FROM results WHERE group_id = ?').bind(gid),
            env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(gid),
          ]);
          return json({ ok: true });
        }
      }

      // ---------- เนื้อหาเกม ----------
      if (method === 'GET' && sub === 'games') {
        const games = await allGames(env);
        for (const g of games) g.item_count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE game_id = ?').bind(g.id).first()).n;
        return json(games);
      }
      if (parts[1] === 'games' && parts[2]) {
        const id = parts[2];
        if (method === 'GET' && parts.length === 3) {
          const g = await getGame(env, id);
          if (!g) return err('ไม่พบเกม', 404);
          const { results } = await env.DB.prepare('SELECT * FROM items WHERE game_id = ? ORDER BY sort, id').bind(id).all();
          return json({ ...g, items: results.map(i => ({ ...i, choices: parseChoices(i.choices) })) });
        }
        if (method === 'PUT' && parts.length === 3) {
          const data = pick(await request.json(), GAME_FIELDS);
          if (data.duration !== undefined) data.duration = Math.max(1, parseInt(data.duration) || 10);
          await updateRow(env, 'games', id, data);
          return json({ ok: true });
        }
        if (method === 'POST' && parts[3] === 'items') {
          const g = await getGame(env, id);
          const body = await request.json().catch(() => ({}));
          const max = await env.DB.prepare('SELECT COALESCE(MAX(sort),0) AS m FROM items WHERE game_id = ?').bind(id).first();
          const code = await uniqueItemCode(env);
          const quiz = g.mode === 'quiz';
          const r = await env.DB.prepare('INSERT INTO items (game_id, code, title, art, choices, correct, category, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(id, code, body.title || 'รายการใหม่', body.art || '', quiz ? '["","","",""]' : '[]', quiz ? 0 : -1, g.mode === 'wildlife' ? 'reserved' : '', (max?.m || 0) + 1).run();
          return json({ ok: true, id: r.meta.last_row_id, code });
        }
      }
      if (parts[1] === 'items' && parts[2]) {
        const id = Number(parts[2]);
        if (method === 'PUT' && parts.length === 3) {
          const data = pick(await request.json(), ITEM_FIELDS);
          if (data.correct !== undefined) data.correct = Number(data.correct);
          await updateRow(env, 'items', id, data);
          return json({ ok: true });
        }
        if (method === 'DELETE' && parts.length === 3) {
          await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
          return json({ ok: true });
        }
        if (method === 'POST' && parts[3] === 'regen') {
          const code = await uniqueItemCode(env);
          await updateRow(env, 'items', id, { code });
          return json({ ok: true, code });
        }
      }
      if (method === 'POST' && sub === 'upload') {
        const form = await request.formData();
        const file = form.get('file');
        if (!file || typeof file === 'string') return err('ไม่พบไฟล์');
        if (!file.type.startsWith('image/')) return err('รองรับเฉพาะไฟล์รูปภาพ');
        if (file.size > 5 * 1024 * 1024) return err('ไฟล์ใหญ่เกิน 5MB');
        const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
        const key = `${now().toString(36)}-${randomCode(8).toLowerCase()}.${ext}`;
        await env.IMAGES.put(key, await file.arrayBuffer(), { metadata: { type: file.type, name: file.name } });
        return json({ ok: true, key, url: `/api/img/${key}` });
      }
    }

    return err('ไม่พบ API นี้', 404);
  } catch (e) {
    return err(e.message || 'เกิดข้อผิดพลาด', 500);
  }
}
