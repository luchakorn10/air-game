import { api, esc, imgUrl, toast, ask, askText, busy, qUrl, joinUrl, qrSvg, lightbox, visual, artFile, makeClock, fmtSec, fmtMs, MODE_LABEL, CAT_LABEL, LETTERS, statusBadge, medal, rankLabel } from '/js/common.js';
import { PALETTE } from '/js/emoji.js';

const $ = id => document.getElementById(id);
const S = { games: [], g: null, room: null, view: null, tab: null, poll: null, clockT: null, sess: null };
const SIZE_LABEL = { S: 'เล็ก', M: 'กลาง', L: 'ใหญ่' };
const fmtDate = ms => new Date(ms).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

// ================= auth =================
async function boot() {
  try { await api('admin/me'); showDash(); }
  catch { $('login').classList.remove('hidden'); }
}
$('loginForm').onsubmit = async e => {
  e.preventDefault();
  await busy(e.submitter, async () => {
    try {
      await api('admin/login', { method: 'POST', body: { password: e.target.password.value } });
      $('login').classList.add('hidden');
      showDash();
    } catch (err) { toast(err.message, 'err'); }
  });
};
$('logout').onclick = async e => { e.preventDefault(); await api('admin/logout', { method: 'POST' }); location.reload(); };

async function showDash() {
  $('dash').classList.remove('hidden');
  $('logout').classList.remove('hidden');
  S.games = await api('admin/games');
  route();
}
function go(params) {
  const qs = new URLSearchParams(params).toString();
  history.pushState(null, '', '/admin/' + (qs ? '?' + qs : ''));
  route();
}
window.addEventListener('popstate', route);
function stopTimers() { clearInterval(S.poll); clearInterval(S.clockT); S.poll = S.clockT = null; }

async function route() {
  stopTimers();
  const q = new URLSearchParams(location.search);
  try {
    if (q.get('room')) await openRoom(Number(q.get('room')), q.get('view') || 'overview');
    else if (q.get('content')) await openContent(q.get('content'), q.get('tab'));
    else await renderRooms();
  } catch (e) { toast(e.message, 'err'); if (e.status === 404) go({}); }
  renderSide();
}

// ================= sidebar =================
function renderSide() {
  const q = new URLSearchParams(location.search);
  const r = S.room && q.get('room') ? S.room : null;
  const view = q.get('view') || 'overview';
  $('side').innerHTML = `
    <button class="g ${!q.get('room') && !q.get('content') ? 'on' : ''}" data-go="rooms"><span class="num" style="background:var(--sky)">🏫</span><span class="gtxt"><span class="gname">ห้องแข่งทั้งหมด</span><span class="gmode">สร้าง / เลือกห้อง</span></span></button>
    ${r ? `
      <div class="side-room">
        <div class="side-room-h"><span class="code">${esc(r.room.code)}</span><b>${esc(r.room.name)}</b></div>
        <button class="g sub ${view === 'overview' ? 'on' : ''}" data-go="room:overview"><span class="num" style="background:#fbbf24;color:var(--navy)">🏆</span><span class="gtxt"><span class="gname">คะแนนรวม & กลุ่ม</span><span class="gmode">${r.groups.length} กลุ่ม</span></span></button>
        ${r.games.map((g, i) => `
          <button class="g sub ${view === g.id ? 'on' : ''}" data-go="room:${esc(g.id)}">
            <span class="num" style="background:${esc(g.color)}">${i + 1}</span>
            <span class="gtxt"><span class="gname">${esc(g.name)}</span><span class="gmode">${g.mode === 'none' ? '🧑‍🏫 ครูให้คะแนน' : '📱 ' + esc(MODE_LABEL[g.mode])}</span></span>
            ${g.session?.status === 'running' ? '<span class="live"></span>' : g.session?.status === 'ended' ? '<span title="จบแล้ว">✓</span>' : ''}
          </button>`).join('')}
      </div>` : ''}
    <h4>เนื้อหาเกม (ใช้ทุกห้อง)</h4>
    ${S.games.map((g, i) => `
      <button class="g ${q.get('content') === g.id ? 'on' : ''}" data-go="content:${esc(g.id)}">
        <span class="num" style="background:${esc(g.color)};opacity:.85">${i + 1}</span>
        <span class="gtxt"><span class="gname">${esc(g.name)}</span><span class="gmode">${g.mode === 'none' ? 'กติกา' : `กติกา + ${g.item_count} รายการ`}</span></span>
      </button>`).join('')}`;
}
const setMenu = open => $('dash').classList.toggle('menu-open', open);
$('menuBtn').onclick = () => setMenu(!$('dash').classList.contains('menu-open'));
$('sideBackdrop').onclick = () => setMenu(false);
$('side').onclick = e => {
  const b = e.target.closest('[data-go]'); if (!b) return;
  setMenu(false);
  const [k, v] = b.dataset.go.split(':');
  if (k === 'rooms') go({});
  if (k === 'room') go({ room: S.room.room.id, view: v });
  if (k === 'content') go({ content: v });
};

// ================= ห้องแข่งทั้งหมด =================
async function renderRooms() {
  S.room = null;
  const rooms = await api('admin/rooms');
  $('main').innerHTML = `
    <div class="banner">
      <img src="/assets/logo-192.png" alt="" style="width:76px;height:76px;border-radius:24%;flex:none;box-shadow:0 8px 20px rgba(0,0,0,.25)">
      <div class="t"><h1>ห้องแข่งขัน</h1><div class="en">สร้างห้องใหม่ทุกครั้งที่ไปสอน · แต่ละห้องมีกลุ่ม คะแนน และจอคะแนนของตัวเอง</div>
        <div class="meta"><span>${rooms.length} ห้อง</span><span>${rooms.filter(r => r.live).length ? `● กำลังแข่ง ${rooms.filter(r => r.live).length} ห้อง` : 'ไม่มีห้องที่กำลังแข่ง'}</span></div></div>
    </div>
    <div class="grid2" style="grid-template-columns:1fr 1.6fr">
      <form class="card" id="newRoom">
        <h3>➕ สร้างห้องแข่งใหม่</h3>
        <div class="field"><label class="f">ชื่อห้อง <small>(เช่น ชื่อโรงเรียน / ห้องเรียน / วันที่)</small></label><input type="text" name="name" required maxlength="80" placeholder="โรงเรียน ก. · ม.2/1 · 23 พ.ย."></div>
        <div class="field"><label class="f">จำนวนกลุ่ม</label>
          <div style="display:flex;gap:8px;align-items:center"><input type="number" name="groups" value="10" min="1" max="40" style="width:110px"><span class="help" style="margin:0">นักเรียน 100 คน · กลุ่มละ 8–10 คน ≈ 10–12 กลุ่ม</span></div></div>
        <button class="btn gold lg" style="width:100%;justify-content:center">สร้างห้อง</button>
        <div class="howto">
          <b>ขั้นตอนในวันจริง</b>
          <ol><li>สร้างห้อง → พิมพ์ “บัตรกลุ่ม” แจกกลุ่มละ 1 ใบ</li><li>นักเรียนสแกนบัตร → ตั้งชื่อกลุ่ม (ได้ครั้งเดียว)</li><li>เปิดจอคะแนนบนโปรเจคเตอร์</li><li>เลือกเกม → กดเริ่ม / ให้คะแนน</li></ol>
        </div>
      </form>
      <div>
        ${rooms.length ? rooms.map(r => `
          <div class="room-card ${r.status === 'closed' ? 'closed' : ''}" data-id="${r.id}">
            <div class="rc-code">${esc(r.code)}</div>
            <div class="rc-t">
              <b>${esc(r.name)}</b>
              <div class="help" style="margin:2px 0 0">${fmtDate(r.created_at)} · เข้ากลุ่มแล้ว ${r.joined_count}/${r.group_count} กลุ่ม</div>
              <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${r.live ? '<span class="badge run">● กำลังแข่ง</span>' : ''}${r.status === 'closed' ? '<span class="badge end">ปิดห้องแล้ว</span>' : '<span class="badge" style="background:#dbeafe;color:#1e3a8a">เปิดอยู่</span>'}</div>
            </div>
            <div class="rc-acts">
              <button class="btn" data-act="open">เปิดห้อง →</button>
              <button class="btn ghost sm" data-act="del" title="ลบห้อง">🗑</button>
            </div>
          </div>`).join('') : '<div class="card empty">ยังไม่มีห้องแข่ง — สร้างห้องแรกทางซ้ายได้เลย</div>'}
      </div>
    </div>`;
  $('newRoom').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    await busy(e.submitter, async () => {
      try {
        const r = await api('admin/rooms', { method: 'POST', body: { name: f.name.value, groups: f.groups.value } });
        toast(`สร้างห้องแล้ว รหัสห้อง ${r.code}`);
        go({ room: r.id });
      } catch (err) { toast(err.message, 'err'); }
    });
  };
  $('main').querySelectorAll('.room-card').forEach(el => el.onclick = async e => {
    const id = Number(el.dataset.id);
    const act = e.target.closest('[data-act]')?.dataset.act || 'open';
    if (act === 'open') go({ room: id });
    if (act === 'del') {
      const r = rooms.find(x => x.id === id);
      if (await ask({ icon: '🗑️', tone: 'danger', title: `ลบห้อง “${r.name}”?`, message: 'กลุ่ม คะแนน และคำตอบทั้งหมดในห้องนี้จะถูกลบถาวร', ok: 'ลบห้อง' })) {
        await api('admin/rooms/' + id, { method: 'DELETE' }); toast('ลบห้องแล้ว'); renderRooms();
      }
    }
  });
}

// ================= ห้องแข่ง 1 ห้อง =================
async function loadRoom(id) {
  S.room = await api('admin/rooms/' + id);
  return S.room;
}
async function openRoom(id, view) {
  S.view = view;
  await loadRoom(id);
  renderRoomShell();
  if (view === 'overview') { renderOverview(); S.poll = setInterval(() => quiet() && refreshRoom(), 4000); }
  else { await renderSession(); S.poll = setInterval(() => quiet() && renderSession(), 3000); S.clockT = setInterval(tickSession, 500); }
}
const quiet = () => !document.querySelector('dialog[open], .mdl') && !(document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName));
async function refreshRoom() { await loadRoom(S.room.room.id); renderSide(); if (S.view === 'overview') renderOverview(); }

function renderRoomShell() {
  const { room } = S.room;
  $('main').innerHTML = `
    <div class="banner room-banner ${S.view !== 'overview' ? 'compact' : ''}">
      <div class="big-code"><small>รหัสห้อง</small>${esc(room.code)}</div>
      <div class="t">
        <h1>${esc(room.name)}</h1>
        <div class="meta">
          <span>${S.room.groups.length} กลุ่ม · เข้าแล้ว ${S.room.groups.filter(g => g.joined).length}</span>
          <span>${room.status === 'open' ? '🟢 เปิดรับนักเรียน' : '🔴 ปิดห้องแล้ว'}</span>
          <span>${room.names_locked ? '🔒 ล็อกชื่อกลุ่ม' : '✏️ กลุ่มตั้งชื่อได้'}</span>
        </div>
      </div>
      <div class="acts">
        <a class="btn gold sm" href="/admin/cards?room=${room.id}" target="_blank">🎫 พิมพ์บัตรกลุ่ม</a>
        <a class="btn ghost sm" href="/board?r=${esc(room.code)}${S.view !== 'overview' ? '&g=' + esc(S.view) : ''}" target="_blank">🖥️ จอคะแนน</a>
        <button class="btn ghost sm" id="roomMenu">⚙️ ตั้งค่าห้อง</button>
      </div>
    </div>
    <div id="tabBody"></div>`;
  $('roomMenu').onclick = roomSettings;
}

async function roomSettings() {
  const { room } = S.room;
  const wrap = document.createElement('div');
  wrap.className = 'mdl in';
  wrap.innerHTML = `<div class="mdl-card" style="text-align:left">
    <h3 class="mdl-title">⚙️ ตั้งค่าห้อง</h3>
    <div class="field" style="margin-top:14px"><label class="f">ชื่อห้อง</label><input type="text" id="rsName" value="${esc(room.name)}" maxlength="80"></div>
    <label class="switch" style="margin:6px 0"><input type="checkbox" id="rsLock" ${room.names_locked ? 'checked' : ''}> ล็อกการตั้งชื่อกลุ่ม (นักเรียนเปลี่ยนชื่อไม่ได้)</label><br>
    <label class="switch" style="margin:6px 0"><input type="checkbox" id="rsClosed" ${room.status === 'closed' ? 'checked' : ''}> ปิดห้อง (สแกนบัตรกลุ่มเข้าใหม่ไม่ได้)</label>
    <div class="mdl-btns"><button class="btn ghost" data-x="0">ยกเลิก</button><button class="btn" data-x="1">บันทึก</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.onclick = async e => {
    const b = e.target.closest('[data-x]');
    if (!b && e.target !== wrap) return;
    if (b?.dataset.x === '1') {
      await api('admin/rooms/' + room.id, { method: 'PUT', body: { name: $('rsName').value, names_locked: $('rsLock').checked, status: $('rsClosed').checked ? 'closed' : 'open' } });
      toast('บันทึกการตั้งค่าห้องแล้ว');
      await loadRoom(room.id); renderRoomShell(); renderSide();
      S.view === 'overview' ? renderOverview() : renderSession();
    }
    wrap.remove();
  };
}

// ---------- ภาพรวม: คะแนนรวม + จัดการกลุ่ม ----------
function renderOverview() {
  const R = S.room;
  const leader = R.groups[0];
  const played = R.games.filter(g => g.session).length;
  $('tabBody').innerHTML = `
    <div class="kpis">
      <div class="kpi" style="--kc:#1d4ed8"><small>กลุ่มที่เข้าแล้ว</small><b>${R.groups.filter(g => g.joined).length}<span style="font-size:18px;color:var(--muted)"> / ${R.groups.length}</span></b><div class="sub">สแกนบัตรกลุ่มแล้ว</div></div>
      <div class="kpi" style="--kc:#16a34a"><small>ตั้งชื่อแล้ว</small><b>${R.groups.filter(g => g.named).length}</b><div class="sub">กลุ่ม</div></div>
      <div class="kpi" style="--kc:#7c3aed"><small>เกมที่เล่นแล้ว</small><b>${played}<span style="font-size:18px;color:var(--muted)"> / ${R.games.length}</span></b><div class="sub">${R.games.filter(g => g.session?.status === 'running').map(g => '● ' + esc(g.name)).join(', ') || 'ไม่มีเกมที่กำลังแข่ง'}</div></div>
      <div class="kpi" style="--kc:#fbbf24"><small>อันดับ 1 ตอนนี้</small><b style="font-size:22px">${leader && leader.total ? esc(leader.name) : '—'}</b><div class="sub">${leader ? leader.total + ' คะแนน' : ''}</div></div>
    </div>

    <div class="card">
      <h3>🏆 ตารางคะแนนรวม <span class="grow"></span><span class="help">Admin เห็นคะแนนทุกเกมทันที · นักเรียนเห็นคะแนนโค-โดรน/สิงห์ป่าเมื่อเกมนั้นจบ</span></h3>
      <div class="scroll-x"><table class="t">
        <tr><th>อันดับ</th><th>กลุ่ม</th>${R.games.map(g => `<th style="text-align:center"><a href="#" data-game="${esc(g.id)}" style="color:inherit">${esc(g.name)}</a></th>`).join('')}<th style="text-align:right">รวม</th></tr>
        ${R.groups.map(g => `<tr>
          <td class="rk">${rankLabel(g.rank, g.total)}</td>
          <td><span style="display:flex;align-items:center;gap:8px"><span class="gdot" style="background:${esc(g.color)}"></span><b>${esc(g.name)}</b></span></td>
          ${R.games.map(gm => `<td style="text-align:center">${g.scores[gm.id]?.score ?? 0}</td>`).join('')}
          <td class="sc" style="text-align:right">${g.total}</td></tr>`).join('')}
      </table></div>
    </div>

    <div class="card">
      <h3>👥 กลุ่มในห้องนี้ <span class="grow"></span>
        <button class="btn ghost sm" id="addGroup">＋ เพิ่มกลุ่ม</button>
        <a class="btn gold sm" href="/admin/cards?room=${R.room.id}" target="_blank">🎫 พิมพ์บัตรกลุ่ม</a></h3>
      <p class="help" style="margin-top:-6px">นักเรียนเข้าได้เฉพาะกลุ่มที่ครูสร้างไว้ ด้วย QR/PIN บนบัตร · ชื่อกลุ่มตั้งได้ครั้งเดียว ครูแก้ไขได้ตลอด</p>
      <div class="group-grid">${[...R.groups].sort((a, b) => a.no - b.no).map(g => `
        <div class="gcard2" data-id="${g.id}" style="--gc:${esc(g.color)}">
          <div class="gc-top"><span class="no">${g.no}</span><b>${esc(g.name)}</b></div>
          <div class="gc-meta">
            <span class="pin">PIN <b>${esc(g.pin)}</b></span>
            ${g.joined ? '<span class="badge run">เข้าแล้ว</span>' : '<span class="badge idle">ยังไม่เข้า</span>'}
            ${g.named ? '<span class="badge" style="background:#ede9fe;color:#5b21b6">🔒 ตั้งชื่อแล้ว</span>' : ''}
          </div>
          <div class="gc-acts">
            <button class="btn ghost sm" data-act="rename">✏️ แก้ชื่อ</button>
            ${g.named ? '<button class="btn ghost sm" data-act="unlock" title="ให้กลุ่มตั้งชื่อใหม่ได้">🔓</button>' : ''}
            <button class="btn ghost sm" data-act="qr" title="QR บัตรกลุ่ม">🔳</button>
            <button class="btn ghost sm" data-act="repin" title="เปลี่ยน PIN (เตะทุกเครื่องออก)">🔑</button>
            <button class="btn danger sm" data-act="del" title="ลบกลุ่ม">🗑</button>
          </div>
        </div>`).join('')}</div>
    </div>`;
  $('tabBody').querySelectorAll('[data-game]').forEach(a => a.onclick = e => { e.preventDefault(); go({ room: R.room.id, view: a.dataset.game }); });
  $('addGroup').onclick = async () => { await api(`admin/rooms/${R.room.id}/groups`, { method: 'POST' }); toast('เพิ่มกลุ่มแล้ว'); refreshRoom(); };
  $('tabBody').querySelector('.group-grid').onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const g = R.groups.find(x => x.id === Number(b.closest('[data-id]').dataset.id));
    const act = b.dataset.act;
    try {
      if (act === 'rename') {
        const name = await askText({ title: `แก้ชื่อกลุ่มที่ ${g.no}`, message: 'ชื่อนี้จะแสดงบนจอคะแนนทันที', value: g.name, ok: 'บันทึก' });
        if (!name) return;
        await api('admin/groups/' + g.id, { method: 'PUT', body: { name } }); toast('แก้ชื่อกลุ่มแล้ว');
      }
      if (act === 'unlock' && await ask({ icon: '🔓', title: `ปลดล็อกชื่อ “${g.name}”?`, message: 'กลุ่มนี้จะตั้งชื่อใหม่ได้อีก 1 ครั้ง', ok: 'ปลดล็อก' })) {
        await api('admin/groups/' + g.id, { method: 'PUT', body: { unlock: true } }); toast('ปลดล็อกแล้ว');
      }
      if (act === 'repin' && await ask({ icon: '🔑', tone: 'warn', title: `เปลี่ยน PIN ของ “${g.name}”?`, message: 'ทุกเครื่องที่อยู่ในกลุ่มนี้จะถูกออก และบัตรเดิมจะใช้ไม่ได้ ต้องพิมพ์บัตรใหม่', ok: 'เปลี่ยน PIN' })) {
        const r = await api(`admin/groups/${g.id}/repin`, { method: 'POST' }); toast(`PIN ใหม่: ${r.pin}`, 'info');
      }
      if (act === 'del' && await ask({ icon: '🗑️', tone: 'danger', title: `ลบ “${g.name}”?`, message: 'คะแนนและคำตอบของกลุ่มนี้จะหายทั้งหมด', ok: 'ลบกลุ่ม' })) {
        await api('admin/groups/' + g.id, { method: 'DELETE' }); toast('ลบกลุ่มแล้ว');
      }
      if (act === 'qr') {
        const url = joinUrl(R.room.code, g.pin);
        $('qrTitle').textContent = `บัตรกลุ่มที่ ${g.no} · ${g.name}`;
        $('qrBody').innerHTML = `${qrSvg(url, 8)}<div style="font-family:Kanit;font-size:20px;margin-top:6px">ห้อง <b>${esc(R.room.code)}</b> · PIN <b>${esc(g.pin)}</b></div><div class="url">${esc(url)}</div>`;
        $('qrDlg').showModal();
        return;
      }
      refreshRoom();
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ---------- เกมในห้อง: จับเวลา + คะแนน ----------
async function renderSession() {
  const R = S.room;
  const gid = S.view;
  const d = await api(`admin/rooms/${R.room.id}/games/${gid}`);
  if (S.view !== gid) return;
  S.sess = d;
  S.clock = makeClock(d.session);
  const g = d.game, s = d.session;
  const manualOnly = g.mode === 'none';
  const items = d.items.filter(i => i.active);
  let btns;
  if (!s || s.status === 'waiting') btns = `<button class="btn gold lg" data-sa="start">▶ เริ่มจับเวลา ${g.duration} นาที</button>`;
  else if (s.status === 'running') btns = `<button class="btn ghost" data-sa="extend">＋1 นาที</button><button class="btn danger" data-sa="end">■ จบเกมเดี๋ยวนี้</button>`;
  else btns = `<button class="btn ghost" data-sa="extend">↻ เปิดต่ออีก 1 นาที</button><button class="btn danger" data-sa="reset">🗑 ล้างผลเกมนี้ เริ่มใหม่</button>`;
  const flow = manualOnly ? ['รอเริ่ม', 'จับเวลา / ให้คะแนน', 'จบเกม'] : ['รอเริ่ม', 'กำลังแข่ง', 'ประกาศผล'];
  const step = !s || s.status === 'waiting' ? 0 : s.status === 'running' ? 1 : 2;

  $('tabBody').innerHTML = `
    <div class="sess-head" style="--gc:${esc(g.color)}">
      <div class="sh-t"><b>${esc(g.name)}</b><span>${manualOnly ? '🧑‍🏫 ครูให้คะแนน' : '📱 ' + esc(MODE_LABEL[g.mode])} · ${statusBadge(s)}</span></div>
      <div class="clock" id="rcClock">--:--</div>
      <div class="rc btns">${btns}</div>
    </div>
    <div class="flow" style="margin:-6px 0 16px">${flow.map((f, i) => `<span class="${i < step ? 'done' : i === step ? 'now' : ''}">${i < step ? '✓ ' : ''}${f}</span>`).join('')}
      <span style="flex:1"></span><a class="btn ghost sm" href="/board?r=${esc(R.room.code)}&g=${esc(g.id)}" target="_blank">🖥️ จอคะแนนเกมนี้</a>
      ${manualOnly ? '' : `<a class="btn ghost sm" href="/admin/?content=${esc(g.id)}">🧩 แก้เนื้อหา</a>`}</div>

    <div class="card">
      <h3>${manualOnly ? '🧑‍🏫 ให้คะแนนแต่ละกลุ่ม' : '🏆 คะแนนเกมนี้'} <span class="grow"></span><span class="help">${manualOnly ? 'กด + / − หรือพิมพ์ตัวเลขแล้วกด Enter' : 'คะแนนอัตโนมัติ + โบนัส/หักจากครู'}</span></h3>
      <div class="scroll-x"><table class="t score-t">
        <tr><th>อันดับ</th><th>กลุ่ม</th>${manualOnly ? '' : `<th class="hide-sm">อัตโนมัติ</th><th class="hide-sm">${g.mode === 'wildlife' ? 'สถานะ' : 'ตอบ/ผ่าน'}</th><th class="hide-sm">เวลา</th>`}<th style="text-align:center">${manualOnly ? 'คะแนน' : 'โบนัส / หัก'}</th><th style="text-align:right">รวม</th><th></th></tr>
        ${d.groups.map(r => `<tr data-gid="${r.group_id}">
          <td class="rk">${rankLabel(r.rank, r.score)}</td>
          <td><span style="display:flex;align-items:center;gap:8px"><span class="gdot" style="background:${esc(r.color)}"></span><b>${esc(r.name)}</b></span>${manualOnly ? '' : `<small class="show-sm">อัตโนมัติ ${r.auto}${g.mode === 'wildlife' ? (r.submitted ? ' · ส่งแล้ว' : ' · ยังไม่ส่ง') : ` · ตอบ ${r.answered}`}</small>`}</td>
          ${manualOnly ? '' : `<td class="hide-sm">${r.auto}</td><td class="hide-sm">${g.mode === 'wildlife' ? (r.submitted ? '<span class="badge run">ส่งแล้ว</span>' : '<span class="badge idle">ยังไม่ส่ง</span>') : r.answered + (g.mode === 'quiz' ? ' / ' + items.length : '')}${r.wrong && g.mode !== 'delivery' ? ` <small style="color:var(--danger)">ผิด ${r.wrong}</small>` : ''}</td><td class="hide-sm">${fmtMs(r.time_ms)}</td>`}
          <td><div class="stepper ${manualOnly ? 'big' : ''}">
            <button class="btn ghost sm" data-d="-1">−</button>
            <input type="number" value="${r.manual}" data-v>
            <button class="btn ghost sm" data-d="1">＋</button>
          </div></td>
          <td class="sc" style="text-align:right">${r.score}</td>
          <td style="text-align:right">${manualOnly ? '' : `<button class="btn ghost sm" data-clear title="ล้างคำตอบของกลุ่มนี้">↺</button>`}</td>
        </tr>`).join('')}
      </table></div>
    </div>
    ${detailCard(d, items)}`;

  $('tabBody').querySelector('.rc.btns').onclick = e => sessionAction(e.target.closest('[data-sa]')?.dataset.sa, e.target.closest('button'));
  const tbl = $('tabBody').querySelector('.score-t');
  const send = async (gidr, body) => {
    try { await api(`admin/rooms/${R.room.id}/games/${gid}/score`, { method: 'POST', body: { group_id: gidr, ...body } }); await renderSession(); }
    catch (err) { toast(err.message, 'err'); }
  };
  tbl.onclick = async e => {
    const tr = e.target.closest('tr[data-gid]'); if (!tr) return;
    const gidr = Number(tr.dataset.gid);
    const dBtn = e.target.closest('[data-d]');
    if (dBtn) return send(gidr, { delta: Number(dBtn.dataset.d) });
    if (e.target.closest('[data-clear]')) {
      const name = d.groups.find(x => x.group_id === gidr).name;
      if (await ask({ icon: '↺', tone: 'warn', title: `ล้างคำตอบของ “${name}”?`, message: 'กลุ่มนี้จะตอบ/ส่งรายงานเกมนี้ใหม่ได้', ok: 'ล้างคำตอบ' })) {
        await api(`admin/rooms/${R.room.id}/games/${gid}/clear-group`, { method: 'POST', body: { group_id: gidr } }); toast('ล้างคำตอบแล้ว'); renderSession();
      }
    }
    const chk = e.target.closest('[data-check]');
    if (chk) {
      const [team, item, on] = chk.dataset.check.split(':').map(Number);
      await api(`admin/rooms/${R.room.id}/games/${gid}/check`, { method: 'POST', body: { group_id: team, item_id: item, value: on ? 0 : 1 } });
      renderSession();
    }
  };
  tbl.querySelectorAll('input[data-v]').forEach(inp => {
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
    inp.onchange = () => send(Number(inp.closest('tr').dataset.gid), { value: Number(inp.value) || 0 });
  });
  $('tabBody').querySelector('.detail')?.addEventListener('click', tbl.onclick);
  tickSession();
}

function detailCard(d, items) {
  const g = d.game;
  if (!d.groups.length || g.mode === 'none') return '';
  const ans = new Map(d.answers.map(a => [`${a.group_id}:${a.item_id}`, a]));
  const groups = [...d.groups].sort((a, b) => a.no - b.no);
  if (g.mode === 'quiz') {
    return `<div class="card detail"><h3>🔎 คำตอบรายข้อ <span class="grow"></span><span class="help">✓ ถูก · ตัวอักษร = ตอบผิด (ข้อที่เลือก)</span></h3><div class="scroll-x"><table class="t">
      <tr><th>กลุ่ม</th>${items.map((it, i) => `<th title="${esc(it.title)}" style="text-align:center">${i + 1}</th>`).join('')}</tr>
      ${groups.map(t => `<tr><td><b>${esc(t.name)}</b></td>${items.map(it => {
        const a = ans.get(`${t.group_id}:${it.id}`);
        return `<td style="text-align:center">${a ? `<span class="cell ${a.correct ? 'ok' : 'bad'}">${a.correct ? '✓' : LETTERS[a.choice]}</span>` : '<span class="cell">–</span>'}</td>`;
      }).join('')}</tr>`).join('')}
    </table></div></div>`;
  }
  if (g.mode === 'delivery') {
    return `<div class="card detail"><h3>✅ ตรวจภารกิจ <span class="grow"></span><span class="help">กดช่องเมื่อกลุ่มทำภารกิจที่จุดนั้นสำเร็จ (กดซ้ำเพื่อยกเลิก)</span></h3><div class="scroll-x"><table class="t">
      <tr><th>กลุ่ม</th>${items.map(it => `<th style="text-align:center">${esc(it.title)}<div class="help" style="margin:0">${esc(it.answer)}</div></th>`).join('')}</tr>
      ${groups.map(t => `<tr data-gid="${t.group_id}"><td><b>${esc(t.name)}</b></td>${items.map(it => {
        const on = !!ans.get(`${t.group_id}:${it.id}`);
        return `<td style="text-align:center"><button class="cell ${on ? 'ok' : ''}" data-check="${t.group_id}:${it.id}:${on ? 1 : 0}">${on ? '✓' : ''}</button></td>`;
      }).join('')}</tr>`).join('')}
    </table></div></div>`;
  }
  const byId = new Map(d.items.map(i => [i.id, i]));
  return `<div class="card detail"><h3>📋 รายงานของแต่ละกลุ่ม</h3>${groups.map(t => {
    const mine = d.answers.filter(a => a.group_id === t.group_id);
    return `<div style="padding:8px 0;border-bottom:1px solid #edf1f7"><b>${esc(t.name)}</b> <span class="help">(${t.auto} คะแนน)</span><div>${mine.length ? mine.map(a => {
      const it = byId.get(a.item_id) || {};
      return `<span class="chipx ${a.correct > 0 ? 'plus' : 'minus'}">${it.art ? `<img src="${esc(artFile(it.art))}">` : ''}${esc(it.title || '?')} ${a.correct > 0 ? '+1' : '-1'}</span>`;
    }).join('') : `<span class="help">${t.submitted ? 'ส่งรายงานเปล่า' : 'ยังไม่ส่ง'}</span>`}</div></div>`;
  }).join('')}</div>`;
}

function tickSession() {
  const el = $('rcClock'); if (!el || !S.sess) return;
  const s = S.sess.session;
  const left = S.clock?.();
  el.textContent = !s || s.status === 'waiting' ? fmtSec(S.sess.game.duration * 60) : fmtSec(left);
  el.className = 'clock' + (left != null && left <= 60 && left > 0 ? ' warn' : '');
}

async function sessionAction(act, btn) {
  if (!act) return;
  const R = S.room, g = S.sess.game;
  const base = `admin/rooms/${R.room.id}/games/${g.id}`;
  try {
    if (act === 'start') {
      if (!R.groups.some(x => x.joined) && g.mode !== 'none' && !(await ask({ icon: '🤔', tone: 'warn', title: 'ยังไม่มีกลุ่มเข้าห้อง', message: 'ยังไม่มีกลุ่มไหนสแกนบัตรกลุ่ม ต้องการเริ่มเลยหรือไม่?', ok: 'เริ่มเลย' }))) return;
      await busy(btn, () => api(base + '/start', { method: 'POST' }));
      toast(`เริ่ม ${g.name} แล้ว! ${g.duration} นาที`);
    }
    if (act === 'extend') { await api(base + '/extend', { method: 'POST', body: { minutes: 1 } }); toast('เพิ่มเวลา 1 นาที', 'info'); }
    if (act === 'end' && await ask({ icon: '🏁', tone: 'danger', title: 'จบเกมเดี๋ยวนี้?', message: 'กลุ่มจะตอบต่อไม่ได้ และระบบจะประกาศผลทันที', ok: 'จบเกม' })) {
      await api(base + '/end', { method: 'POST' }); toast('จบเกมแล้ว ประกาศผลเรียบร้อย');
    }
    if (act === 'reset' && await ask({ icon: '🗑️', tone: 'danger', title: `ล้างผล “${g.name}” ในห้องนี้?`, message: 'คำตอบและคะแนนของเกมนี้ (รวมคะแนนที่ครูให้) จะถูกลบทั้งหมด', ok: 'ล้างผล' })) {
      await api(base + '/reset', { method: 'POST' }); toast('ล้างผลแล้ว พร้อมเริ่มใหม่');
    }
    await loadRoom(R.room.id); renderSide();
    await renderSession();
  } catch (err) { toast(err.message, 'err'); }
}

// ================= เนื้อหาเกม =================
async function loadGames() { S.games = await api('admin/games'); renderSide(); }
async function openContent(id, tab) {
  S.room = null;
  S.g = await api('admin/games/' + id);
  const tabs = tabsFor(S.g);
  S.tab = tabs.find(t => t[0] === tab)?.[0] || (tab === 'keep' && tabs.find(t => t[0] === S.tab) ? S.tab : tabs[0][0]);
  renderContentShell();
}
const reloadGame = () => openContent(S.g.id, 'keep');
function tabsFor(g) {
  if (g.mode === 'none') return [['info', '📋 ข้อมูลเกม & กติกา']];
  const content = { quiz: '🧩 คำใบ้ & QR', wildlife: '🐾 การ์ดสัตว์', delivery: '📦 จุดส่งพัสดุ & QR' }[g.mode];
  return [['content', `${content} (${g.items.length})`], ['info', '📋 ข้อมูลเกม & กติกา']];
}
function renderContentShell() {
  const g = S.g;
  const tabs = tabsFor(g);
  $('main').innerHTML = `
    <div class="banner" style="--gc:${esc(g.color)}">
      <div class="thumb"><img src="${esc(imgUrl(g.image, g.default_image))}" alt=""></div>
      <div class="t">
        <h1>${esc(g.name)}</h1><div class="en">เนื้อหาเกม · ใช้ร่วมกันทุกห้องแข่ง</div>
        <div class="meta"><span>${g.mode !== 'none' ? '📱 ' : '🧑‍🏫 '}${esc(MODE_LABEL[g.mode])}</span><span>⏱ ${g.duration} นาที</span>${g.visible ? '' : '<span>🙈 ซ่อนอยู่</span>'}</div>
      </div>
      <div class="acts"><a class="btn ghost sm" href="/game?id=${esc(g.id)}" target="_blank">📋 ดูหน้ากติกา</a></div>
    </div>
    ${tabs.length > 1 ? `<div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
    <div id="tabBody"></div>`;
  $('main').querySelector('.tabs')?.addEventListener('click', e => {
    const t = e.target.closest('button')?.dataset.tab;
    if (t) { S.tab = t; history.replaceState(null, '', `/admin/?content=${g.id}&tab=${t}`); renderContentShell(); }
  });
  ({ content: renderContent, info: renderInfo })[S.tab]();
}

function renderContent() {
  const g = S.g;
  const addLabel = { quiz: 'เพิ่มคำใบ้', wildlife: 'เพิ่มการ์ดสัตว์', delivery: 'เพิ่มจุดส่งพัสดุ' }[g.mode];
  const printLabel = g.mode === 'wildlife' ? '🖨️ พิมพ์การ์ดสัตว์' : '🖨️ พิมพ์ QR ทั้งหมด';
  const helpTxt = {
    quiz: 'แต่ละคำใบ้ = 1 QR ในสนาม ผู้เรียนสแกนแล้วตอบ 4 ตัวเลือกได้ครั้งเดียว แก้คำถามได้ตลอดโดยไม่ต้องพิมพ์ QR ใหม่',
    wildlife: 'การ์ดที่ "อยู่ในสนาม" ให้พิมพ์ไปวาง ส่วนการ์ดที่ไม่อยู่ในสนามจะเป็นตัวเลือกหลอกในรายงาน ขนาดเล็ก/กลาง/ใหญ่ใช้ตอนพิมพ์',
    delivery: 'แต่ละจุด = 1 QR บอกคำใบ้สถานที่และภารกิจ ขนาด QR (เล็ก/ใหญ่) เพิ่มความยากในการสแกนด้วยโดรน',
  }[g.mode];
  $('tabBody').innerHTML = `
    <div class="card toolbar">
      <div class="grow"><b style="font-family:Kanit;color:var(--navy);font-size:17px">${esc(tabsFor(g)[0][1])}</b><div class="help">${helpTxt}</div></div>
      <div class="searchbox" style="width:200px"><input type="text" id="q" placeholder="ค้นหา..."></div>
      <a class="btn gold" href="/admin/print?game=${esc(g.id)}" target="_blank">${printLabel}</a>
      <button class="btn" id="addItem">＋ ${addLabel}</button>
    </div>
    <div id="list"></div>`;
  $('list').innerHTML = g.items.length ? (g.mode === 'wildlife' ? wildlifeList() : `<div class="item-list">${g.items.map(itemRow).join('')}</div>`) : '<div class="card empty">ยังไม่มีรายการ</div>';

  $('q').oninput = e => {
    const k = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#list [data-id]').forEach(el => { el.style.display = !k || el.textContent.toLowerCase().includes(k) ? '' : 'none'; });
  };
  $('addItem').onclick = async () => {
    const r = await api(`admin/games/${g.id}/items`, { method: 'POST', body: { title: g.mode === 'quiz' ? `คำใบ้ #${g.items.length + 1}` : g.mode === 'delivery' ? `พัสดุ #${g.items.length + 1}` : 'สัตว์ใหม่', art: g.mode === 'wildlife' ? '🦌' : '❓' } });
    await reloadGame(); await loadGames();
    editItem(S.g.items.find(i => i.id === r.id));
  };
  $('list').onclick = async e => {
    const host = e.target.closest('[data-id]');
    if (!host) return;
    const it = g.items.find(i => i.id === Number(host.dataset.id));
    const act = e.target.closest('[data-act]')?.dataset.act || (host.classList.contains('wl') ? 'edit' : null);
    if (act === 'edit') editItem(it);
    if (act === 'qr') showQr(it);
    if (act === 'open') window.open(qUrl(it.code), '_blank');
    if (act === 'toggle') { await api('admin/items/' + it.id, { method: 'PUT', body: { active: it.active ? 0 : 1 } }); reloadGame(); }
    if (act === 'del' && await ask({ icon: '🗑️', tone: 'danger', title: `ลบ “${it.title}”?`, message: g.mode === 'wildlife' ? 'การ์ดนี้จะหายจากรายงานของผู้เรียน' : 'QR ของรายการนี้จะใช้ไม่ได้อีก', ok: 'ลบ' })) { await api('admin/items/' + it.id, { method: 'DELETE' }); toast('ลบแล้ว'); await reloadGame(); loadGames(); }
  };
}

function itemRow(it) {
  const g = S.g;
  let body = '';
  if (g.mode === 'quiz') {
    body = `<div class="txt">${esc(it.hint) || '<i style="color:var(--muted)">ยังไม่มีโจทย์</i>'}</div>
      <div class="ch">${it.choices.map((c, i) => `<span class="${i === it.correct ? 'ok' : ''}">${LETTERS[i]}. ${esc(c) || '—'}</span>`).join('')}</div>`;
  } else {
    body = `<div class="txt">📍 ${esc(it.hint) || '—'}</div><div class="txt">🎯 ${esc(it.mission) || '—'}</div>
      ${it.answer ? `<div class="meta">🔒 จุดที่ถูก: ${esc(it.answer)}</div>` : ''}`;
  }
  return `
    <div class="item-row ${it.active ? '' : 'off'}" data-id="${it.id}">
      <div class="qr" data-act="qr" title="ดู QR">${qrSvg(qUrl(it.code), 3)}</div>
      <div class="th">${visual(it)}</div>
      <div style="min-width:0">
        <h4>${esc(it.title)} <span class="code">${esc(it.code)}</span> ${g.mode === 'delivery' ? `<span class="size-tag">QR ${SIZE_LABEL[it.size] || it.size}</span>` : ''} ${it.active ? '' : '<span class="badge end">ปิดอยู่</span>'}</h4>
        ${body}
      </div>
      <div class="ops">
        <button class="btn sm" data-act="edit">✏️ แก้ไข</button>
        <button class="btn ghost sm" data-act="open" title="ดูหน้าที่ผู้เรียนเห็น">👁</button>
        <button class="btn ghost sm" data-act="toggle">${it.active ? 'ปิด' : 'เปิด'}</button>
        <button class="btn danger sm" data-act="del">🗑</button>
      </div>
    </div>`;
}

function wildlifeList() {
  const groups = [['reserved', '#16a34a'], ['normal', '#64748b'], ['suspect', '#dc2626']];
  const items = S.g.items;
  const onField = items.filter(i => i.on_field && i.active);
  const stat = `<div class="stat-row">
    <div class="stat"><b>${onField.length}</b>การ์ดในสนาม (ต้องพิมพ์)</div>
    <div class="stat"><b>${onField.filter(i => i.category === 'reserved' || i.category === 'suspect').length}</b>คะแนนเต็ม</div>
    <div class="stat"><b>${items.filter(i => !i.on_field && i.active).length}</b>ตัวเลือกหลอก (ไม่อยู่ในสนาม)</div>
  </div>`;
  return stat + groups.map(([cat, color]) => {
    const list = items.filter(i => (i.category || 'normal') === cat);
    return `<div class="cat-head"><span class="dot" style="background:${color}"></span>${CAT_LABEL[cat]} (${list.length})</div>
      <div class="wl-grid">${list.map(it => `
        <div class="wl cat-${cat} ${it.active ? '' : 'off'}" data-id="${it.id}">
          <div class="pic">${visual(it)}<span class="fld ${it.on_field ? 'in' : 'out'}">${it.on_field ? 'ในสนาม' : 'ไม่อยู่ในสนาม'}</span><span class="size-tag">${SIZE_LABEL[it.size] || it.size}</span></div>
          <b>${esc(it.title)}</b><small>${esc(it.hint)}</small>
          <div class="wl-acts">
            <button type="button" class="btn ghost sm" data-act="edit">✏️ แก้ไข</button>
            <button type="button" class="btn ghost sm" data-act="toggle" title="${it.active ? 'ซ่อนจากรายงาน' : 'แสดงในรายงาน'}">${it.active ? '🙈' : '👁'}</button>
            <button type="button" class="btn danger sm" data-act="del" title="ลบการ์ด">🗑</button>
          </div>
        </div>`).join('') || '<div class="help">—</div>'}</div>`;
  }).join('');
}

// ---------- item editor ----------
let editing = null, draft = {};
function editItem(it) {
  const g = S.g;
  editing = it;
  draft = { art: it.art || '', image: it.image || '' };
  $('itemDlgTitle').textContent = `แก้ไข: ${it.title}`;
  const sizeSeg = (name, val) => `<div class="seg">${['S', 'M', 'L'].map(s => `<label><input type="radio" name="${name}" value="${s}" ${val === s ? 'checked' : ''}><span>${SIZE_LABEL[s]}</span></label>`).join('')}</div>`;
  let fields = '';
  if (g.mode === 'quiz') {
    const ch = [0, 1, 2, 3].map(i => it.choices[i] ?? '');
    fields = `
      <div class="field"><label class="f">ชื่อคำใบ้ <small>(แสดงบน QR ที่พิมพ์ ห้ามใส่เฉลย)</small></label><input type="text" name="title" value="${esc(it.title)}" required></div>
      <div class="field"><label class="f">คำใบ้ / โจทย์</label><textarea name="hint" rows="3">${esc(it.hint)}</textarea></div>
      <div class="field"><label class="f">ตัวเลือก 4 ข้อ <small>(กดตัวอักษรเพื่อตั้งเป็นคำตอบที่ถูก)</small></label>
        ${ch.map((c, i) => `<div class="choice-edit"><label>${LETTERS[i]}<input type="radio" name="correct" value="${i}" ${it.correct === i ? 'checked' : ''}></label><input type="text" name="c${i}" value="${esc(c)}" placeholder="ตัวเลือก ${LETTERS[i]}"></div>`).join('')}
      </div>`;
  } else if (g.mode === 'wildlife') {
    fields = `
      <div class="field"><label class="f">ชื่อสัตว์ / บุคคล</label><input type="text" name="title" value="${esc(it.title)}" required></div>
      <div class="row">
        <div class="field"><label class="f">ประเภท (เฉลย)</label><select name="category">${Object.entries(CAT_LABEL).map(([k, v]) => `<option value="${k}" ${it.category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label class="f">ขนาดการ์ดที่พิมพ์</label>${sizeSeg('size', it.size || 'M')}</div>
      </div>
      <div class="field"><label class="switch"><input type="checkbox" name="on_field" ${it.on_field ? 'checked' : ''}> วางการ์ดนี้ในสนามจริง</label><div class="help">ไม่ติ๊ก = เป็นตัวเลือกหลอกในรายงาน (เลือกแล้วโดนหักคะแนน)</div></div>
      <div class="field"><label class="f">ความรู้ / คำอธิบาย <small>(แสดงตอนเฉลยหลังจบเกม)</small></label><textarea name="hint" rows="2">${esc(it.hint)}</textarea></div>`;
  } else {
    fields = `
      <div class="row">
        <div class="field"><label class="f">ชื่อพัสดุ <small>(แสดงบน QR)</small></label><input type="text" name="title" value="${esc(it.title)}" required></div>
        <div class="field"><label class="f">ขนาด QR ที่พิมพ์ <small>(ความยาก)</small></label>${sizeSeg('size', it.size || 'M')}</div>
      </div>
      <div class="field"><label class="f">📍 คำใบ้สถานที่ส่งพัสดุ</label><textarea name="hint" rows="2">${esc(it.hint)}</textarea></div>
      <div class="field"><label class="f">🎯 ภารกิจเมื่อไปถึง</label><textarea name="mission" rows="2">${esc(it.mission)}</textarea></div>
      <div class="field"><label class="f">🔒 เฉลยจุดที่ถูกต้อง <small>(เห็นเฉพาะกรรมการ เช่น A / B / C / D)</small></label><input type="text" name="answer" value="${esc(it.answer)}"></div>`;
  }
  $('itemBody').innerHTML = `
    <div class="field"><label class="f">ภาพ <small>(เลือก emoji ให้ระบบสร้างภาพ หรืออัปโหลดรูปจริง)</small></label><div id="vpick"></div></div>
    ${fields}
    ${g.mode === 'quiz' ? `<div class="field"><label class="f">🔒 โน้ตกรรมการ</label><input type="text" name="answer" value="${esc(it.answer)}"></div>` : ''}
    <div class="row">
      <div class="field"><label class="f">ลำดับ</label><input type="number" name="sort" value="${it.sort}"></div>
      <div class="field" style="display:flex;align-items:flex-end"><label class="switch"><input type="checkbox" name="active" ${it.active ? 'checked' : ''}> เปิดใช้งาน</label></div>
    </div>`;
  visualPicker($('vpick'));
  $('itemDlg').showModal();
}
document.querySelectorAll('#itemDlg [data-close]').forEach(b => (b.onclick = () => $('itemDlg').close()));
$('itemDel').onclick = async () => {
  const it = editing, g = S.g;
  $('itemDlg').close();
  if (!(await ask({ icon: '🗑️', tone: 'danger', title: `ลบ “${it.title}”?`, message: g.mode === 'wildlife' ? 'การ์ดนี้จะหายจากรายงานของผู้เรียน' : 'QR ของรายการนี้จะใช้ไม่ได้อีก', ok: 'ลบ' }))) return $('itemDlg').showModal();
  await api('admin/items/' + it.id, { method: 'DELETE' });
  toast('ลบแล้ว');
  await reloadGame(); loadGames();
};

$('itemForm').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, g = S.g;
  if (!f.title.value.trim()) return toast('กรุณาใส่ชื่อ', true);
  const body = { title: f.title.value.trim(), hint: f.hint?.value ?? '', art: draft.art, image: draft.image, sort: Number(f.sort.value) || 0, active: f.active.checked ? 1 : 0 };
  if (f.answer) body.answer = f.answer.value;
  if (g.mode === 'quiz') {
    body.choices = [0, 1, 2, 3].map(i => f[`c${i}`].value.trim());
    if (body.choices.some(c => !c)) return toast('กรุณากรอกตัวเลือกให้ครบ 4 ข้อ', true);
    body.correct = Number(f.querySelector('[name=correct]:checked')?.value ?? -1);
    if (body.correct < 0) return toast('กรุณาเลือกคำตอบที่ถูก', true);
  }
  if (g.mode === 'wildlife') { body.category = f.category.value; body.on_field = f.on_field.checked ? 1 : 0; }
  if (g.mode === 'wildlife' || g.mode === 'delivery') { body.size = f.querySelector('[name=size]:checked')?.value || 'M'; }
  if (g.mode === 'delivery') body.mission = f.mission.value;
  await busy(e.submitter || f.querySelector('[type=submit]'), async () => {
    try {
      await api('admin/items/' + editing.id, { method: 'PUT', body });
      $('itemDlg').close();
      toast('บันทึกแล้ว');
      await reloadGame();
    } catch (err) { toast(err.message, 'err'); }
  });
};

function visualPicker(host) {
  const draw = () => {
    host.innerHTML = `<div class="visual-pick">
      <div class="prev">${visual(draft)}</div>
      <div>
        <div class="palette">${Object.entries(PALETTE).map(([cat, list]) => `<div class="cat">${esc(cat)}</div>${list.map(e => `<button type="button" class="${draft.art === e && !draft.image ? 'on' : ''}" data-e="${e}"><img src="${artFile(e)}" alt="${e}" loading="lazy"></button>`).join('')}`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <label class="btn sm">📤 อัปโหลดรูปจริง<input type="file" accept="image/*" hidden></label>
          ${draft.image ? '<button type="button" class="btn danger sm" data-clear>ลบรูปที่อัปโหลด (กลับไปใช้ emoji)</button>' : ''}
        </div>
      </div></div>`;
    host.querySelector('.palette').onclick = e => {
      const b = e.target.closest('button[data-e]');
      if (b) { draft.art = b.dataset.e; draft.image = ''; draw(); }
    };
    host.querySelector('input[type=file]').onchange = async ev => {
      const file = ev.target.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('file', await shrink(file));
      try { const r = await api('admin/upload', { method: 'POST', body: fd }); draft.image = r.key; draw(); }
      catch (err) { toast(err.message, 'err'); }
    };
    host.querySelector('[data-clear]')?.addEventListener('click', () => { draft.image = ''; draw(); });
  };
  draw();
}

function showQr(it) {
  const url = qUrl(it.code);
  $('qrTitle').textContent = it.title;
  $('qrBody').innerHTML = `
    ${qrSvg(url, 8)}
    <div style="font-family:Kanit;font-size:22px;letter-spacing:4px;margin-top:6px">${esc(it.code)}</div>
    <div class="url">${esc(url)}</div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap">
      <button class="btn ghost sm" id="copyUrl">📋 คัดลอกลิงก์</button>
      <button class="btn ghost sm" id="dlQr">⬇️ ดาวน์โหลด PNG</button>
      <button class="btn danger sm" id="regen">🔄 สร้างรหัสใหม่</button>
    </div>
    <p class="help">สร้างรหัสใหม่ = QR เดิมที่พิมพ์ไปแล้วจะใช้ไม่ได้</p>`;
  $('copyUrl').onclick = () => navigator.clipboard.writeText(url).then(() => toast('คัดลอกแล้ว'));
  $('dlQr').onclick = () => downloadPng($('qrBody').querySelector('svg'), `QR-${it.code}.png`);
  $('regen').onclick = async () => {
    if (!(await ask({ icon: '🔄', tone: 'danger', title: 'สร้างรหัส QR ใหม่?', message: 'QR ที่พิมพ์ไว้แล้วจะใช้ไม่ได้ ต้องพิมพ์ใหม่', ok: 'สร้างรหัสใหม่' }))) return;
    await api(`admin/items/${it.id}/regen`, { method: 'POST' });
    $('qrDlg').close();
    await reloadGame();
    showQr(S.g.items.find(x => x.id === it.id));
  };
  $('qrDlg').showModal();
}

function downloadPng(svg, name) {
  const size = 900, img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.drawImage(img, 0, 0, size, size);
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = name; a.click();
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}

async function shrink(file, max = 1600) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch { return file; }
}

// ================= INFO =================
function imagePicker(host, currentKey, fallback, onChange) {
  let key = currentKey || '';
  const draw = () => {
    const src = imgUrl(key, fallback);
    host.innerHTML = `
      <div class="prev">${src ? `<img src="${esc(src)}" alt="">` : 'ยังไม่มีรูป'}</div>
      <div class="acts">
        <label class="btn sm">📤 อัปโหลดรูป<input type="file" accept="image/*" hidden></label>
        ${key ? `<button type="button" class="btn danger sm" data-clear>ใช้รูปตั้งต้น</button>` : ''}
        <span class="help">${key ? 'รูปที่อัปโหลด' : 'กำลังใช้รูปตั้งต้น'}</span>
      </div>`;
    host.querySelector('input[type=file]').onchange = async ev => {
      const file = ev.target.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('file', await shrink(file));
      try { const r = await api('admin/upload', { method: 'POST', body: fd }); key = r.key; onChange(key); draw(); }
      catch (err) { toast(err.message, 'err'); }
    };
    host.querySelector('[data-clear]')?.addEventListener('click', () => { key = ''; onChange(''); draw(); });
  };
  draw();
}

function renderInfo() {
  const g = S.g;
  const d = { image: g.image };
  $('tabBody').innerHTML = `
    <form id="gameForm">
      <div class="card">
        <h3>ข้อมูลหลัก</h3>
        <div class="row">
          <div class="field"><label class="f">ชื่อเกม</label><input type="text" name="name" value="${esc(g.name)}" required></div>
          <div class="field"><label class="f">ชื่ออังกฤษ / คำโปรย</label><input type="text" name="name_en" value="${esc(g.name_en)}"></div>
        </div>
        <div class="field"><label class="f">คำอธิบายสั้น</label><input type="text" name="tagline" value="${esc(g.tagline)}"></div>
        <div class="row">
          <div class="field"><label class="f">เวลาแข่งขัน (นาที)</label><input type="number" min="1" name="duration" value="${g.duration}"></div>
          <div class="field"><label class="f">ผู้เล่น / ทีม</label><input type="text" name="team_info" value="${esc(g.team_info)}"></div>
          <div class="field"><label class="f">สีประจำเกม</label><input type="color" name="color" value="${esc(g.color)}" style="height:44px;width:100%;border:1.5px solid var(--line);border-radius:10px;padding:4px"></div>
          <div class="field"><label class="f">ลำดับ</label><input type="number" name="sort" value="${g.sort}"></div>
        </div>
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          <label class="switch"><input type="checkbox" name="visible" ${g.visible ? 'checked' : ''}> แสดงบนหน้าเว็บ</label>
          ${g.mode === 'quiz' ? `<label class="switch"><input type="checkbox" name="reveal" ${g.reveal ? 'checked' : ''}> บอกถูก/ผิดทันทีหลังตอบ</label>` : ''}
        </div>
      </div>
      <div class="card"><h3>ภาพ Infographic</h3><div class="imgpick" id="gameImg"></div></div>
      <div class="card">
        <h3>กติกา & วิธีเล่น</h3>
        <p class="help" style="margin-top:-6px;margin-bottom:14px">💡 ช่องรายการ: พิมพ์ 1 บรรทัด = 1 ข้อ</p>
        <div class="field"><label class="f">🎯 เป้าหมาย</label><textarea name="goal" rows="2">${esc(g.goal)}</textarea></div>
        <div class="field"><label class="f">💡 วิธีเล่น (ขั้นตอน)</label><textarea name="steps" rows="4">${esc(g.steps)}</textarea></div>
        <div class="field"><label class="f">📋 กติกา</label><textarea name="rules" rows="6">${esc(g.rules)}</textarea></div>
        <div class="field"><label class="f">⭐ เคล็ดลับ / สิ่งที่ได้รับ</label><textarea name="tips" rows="4">${esc(g.tips)}</textarea></div>
        <div class="field"><label class="f">🏆 เกณฑ์การชนะ</label><textarea name="win" rows="2">${esc(g.win)}</textarea></div>
      </div>
      <div class="savebar"><button class="btn lg">💾 บันทึกข้อมูลเกม</button></div>
    </form>`;
  imagePicker($('gameImg'), g.image, g.default_image, k => (d.image = k));
  $('gameForm').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    const body = {
      name: f.name.value, name_en: f.name_en.value, tagline: f.tagline.value, duration: f.duration.value, team_info: f.team_info.value,
      color: f.color.value, sort: Number(f.sort.value) || 0, visible: f.visible.checked ? 1 : 0, goal: f.goal.value, steps: f.steps.value,
      rules: f.rules.value, tips: f.tips.value, win: f.win.value, image: d.image,
    };
    if (f.reveal) body.reveal = f.reveal.checked ? 1 : 0;
    await busy(e.submitter, async () => {
      try { await api('admin/games/' + g.id, { method: 'PUT', body }); toast('บันทึกข้อมูลเกมแล้ว'); await loadGames(); await reloadGame(); }
      catch (err) { toast(err.message, 'err'); }
    });
  };
}


boot();
