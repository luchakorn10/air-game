// ฟังก์ชันที่ใช้ร่วมกันทุกหน้า
import { artFile } from '/js/emoji.js';
export { artFile };

export async function api(path, opts = {}) {
  const init = { credentials: 'same-origin', ...opts, headers: { ...(opts.headers || {}) } };
  if (opts.body && !(opts.body instanceof FormData)) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch('/api/' + path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

export const imgUrl = (key, fallback = '') => (key ? `/api/img/${key}` : fallback);

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const lines = (s = '') => String(s).split('\n').map(x => x.trim()).filter(Boolean);

// ภาพของรายการ: รูปที่อัปโหลด > ภาพ emoji ที่ระบบสร้าง > ไอคอนว่าง
export function visual(it, cls = '') {
  if (it.image) return `<img class="${cls}" src="${esc(imgUrl(it.image))}" alt="">`;
  if (it.art) return `<img class="${cls} art" src="${esc(artFile(it.art))}" alt="">`;
  return `<span class="${cls} noart">🖼️</span>`;
}

// ---------- แจ้งเตือนแบบ toast (ซ้อนกันได้) ----------
export function toast(msg, type = 'ok') {
  if (type === true) type = 'err';
  if (type === false) type = 'ok';
  let box = document.querySelector('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const icon = { ok: '✓', err: '!', info: 'i', warn: '!' }[type] || 'i';
  const t = document.createElement('div');
  t.className = `toast2 ${type}`;
  t.innerHTML = `<span class="ti">${icon}</span><span class="tm"></span>`;
  t.querySelector('.tm').textContent = msg;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, type === 'err' ? 4200 : 2600);
}

// ---------- กล่องยืนยัน / กรอกข้อความ (แทน confirm / prompt ของเบราว์เซอร์) ----------
function modal({ title, message = '', icon = '❓', tone = 'primary', ok = 'ยืนยัน', cancel = 'ยกเลิก', input = null }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = `mdl ${tone}`;
    wrap.innerHTML = `
      <div class="mdl-card" role="dialog" aria-modal="true">
        <div class="mdl-ico">${icon}</div>
        <h3 class="mdl-title"></h3>
        <div class="mdl-msg"></div>
        ${input ? `<input class="mdl-input" type="text" maxlength="60">` : ''}
        <div class="mdl-btns">
          ${cancel ? `<button type="button" class="btn ghost" data-v="0"></button>` : ''}
          <button type="button" class="btn ${tone === 'danger' ? 'red' : tone === 'warn' ? 'gold' : ''}" data-v="1"></button>
        </div>
      </div>`;
    wrap.querySelector('.mdl-title').textContent = title;
    wrap.querySelector('.mdl-msg').textContent = message;
    if (cancel) wrap.querySelector('[data-v="0"]').textContent = cancel;
    wrap.querySelector('[data-v="1"]').textContent = ok;
    const inp = wrap.querySelector('.mdl-input');
    if (inp) { inp.value = input.value || ''; inp.placeholder = input.placeholder || ''; }
    const done = v => {
      document.removeEventListener('keydown', onKey);
      wrap.classList.remove('in');
      setTimeout(() => wrap.remove(), 200);
      resolve(v);
    };
    const onKey = e => {
      if (e.key === 'Escape') done(input ? null : false);
      if (e.key === 'Enter' && (inp ? document.activeElement === inp : true)) { e.preventDefault(); done(input ? inp.value.trim() : true); }
    };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (b) done(b.dataset.v === '1' ? (input ? inp.value.trim() : true) : (input ? null : false));
      else if (e.target === wrap && cancel) done(input ? null : false);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    requestAnimationFrame(() => { wrap.classList.add('in'); (inp || wrap.querySelector('[data-v="1"]')).focus(); });
  });
}
export const ask = opts => modal(opts);
export const askText = opts => modal({ icon: '✏️', ...opts, input: { value: opts.value, placeholder: opts.placeholder } });
export const tell = opts => modal({ icon: 'ℹ️', ok: 'ตกลง', cancel: null, ...opts });

// ปุ่มแสดงสถานะกำลังทำงาน
export async function busy(btn, fn) {
  if (!btn) return fn();
  const html = btn.innerHTML;
  btn.disabled = true; btn.classList.add('loading');
  try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('loading'); btn.innerHTML = html; }
}

export function lightbox(src) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `<img src="${esc(src)}" alt="">`;
  box.onclick = () => box.remove();
  document.body.appendChild(box);
}

export const qUrl = code => `${location.origin}/q?c=${encodeURIComponent(code)}`;

export function qrSvg(text, cell = 6) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}

// ---------- กลุ่มของเครื่องนี้ (ได้จากการสแกนบัตรกลุ่ม) ----------
const ME_KEY = 'air_me';
export const getMe = () => { try { return JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch { return null; } };
export const setMe = v => { try { v ? localStorage.setItem(ME_KEY, JSON.stringify(v)) : localStorage.removeItem(ME_KEY); } catch {} };
export const meHeaders = () => { const m = getMe(); return m?.token ? { 'x-group-token': m.token } : {}; };
export const joinUrl = (code, pin) => `${location.origin}/join?r=${encodeURIComponent(code)}${pin ? `&p=${encodeURIComponent(pin)}` : ''}`;
export function needJoin() { location.href = '/join?back=' + encodeURIComponent(location.pathname + location.search); }

// ---------- นาฬิกาที่ sync กับ server ----------
export function makeClock(round) {
  const offset = round?.now ? round.now - Date.now() : 0;
  return () => {
    if (!round || !round.ends_at || round.status === 'waiting') return null;
    return Math.max(0, Math.round((round.ends_at - (Date.now() + offset)) / 1000));
  };
}
export const fmtSec = s => (s == null ? '--:--' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
export const fmtMs = ms => (ms == null ? '-' : fmtSec(Math.round(ms / 1000)));

export const MODE_LABEL = { none: 'ครูให้คะแนน', quiz: 'ตอบคำใบ้จาก QR', wildlife: 'สำรวจสัตว์ป่า', delivery: 'ส่งพัสดุ + Block Code' };
export const CAT_LABEL = { reserved: 'สัตว์ป่าสงวน', normal: 'ไม่ใช่สัตว์สงวน', suspect: 'บุคคลต้องสงสัย' };
export const LETTERS = ['A', 'B', 'C', 'D'];

export const statusBadge = s => !s ? '<span class="badge idle">ยังไม่เริ่ม</span>'
  : s.status === 'waiting' ? '<span class="badge wait">รอเริ่ม</span>' : s.status === 'running' ? '<span class="badge run">● กำลังแข่ง</span>' : '<span class="badge end">จบแล้ว</span>';
export const medal = r => ['🥇', '🥈', '🥉'][r - 1] || r;
export const rankLabel = (r, score) => (score > 0 ? medal(r) : '–');
