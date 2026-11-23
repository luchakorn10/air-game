// กล้องสแกน QR ในหน้าเว็บ (ไม่ต้องออกไปแอปกล้อง)
// ใช้ BarcodeDetector ของเบราว์เซอร์ถ้ามี (Android Chrome) ไม่มีก็ใช้ jsQR (iPhone Safari)

let jsqrLoading = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  return (jsqrLoading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/vendor/jsQR.js';
    s.onload = res; s.onerror = () => rej(new Error('โหลดตัวอ่าน QR ไม่สำเร็จ'));
    document.head.appendChild(s);
  }));
}

// ดึงรหัสรายการจากข้อความใน QR (ลิงก์ /q?c=XXXXXX หรือรหัส 6 ตัว)
export function extractCode(text) {
  const t = String(text || '').trim();
  try {
    const u = new URL(t);
    const c = u.searchParams.get('c');
    if (c && /\/(q|clue)\b/.test(u.pathname)) return c.toUpperCase();
  } catch {}
  if (/^[A-Z2-9]{6}$/i.test(t)) return t.toUpperCase();
  return null;
}

export function openScanner({ title = 'สแกน QR', hint = 'เล็ง QR ให้อยู่ในกรอบ', onCode, onManual } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'scan';
  wrap.innerHTML = `
    <video playsinline muted autoplay></video>
    <div class="scan-shade"></div>
    <div class="scan-top"><button type="button" class="scan-x" aria-label="ปิด">✕</button><b>${title}</b><span></span></div>
    <div class="scan-box"><i></i><i></i><i></i><i></i><div class="scan-line"></div></div>
    <div class="scan-bottom">
      <div class="scan-msg">${hint}</div>
      <div class="scan-btns">
        <button type="button" class="btn white" data-torch hidden>🔦 ไฟฉาย</button>
        <button type="button" class="btn white" data-manual>⌨️ กรอกรหัสเอง</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  const video = wrap.querySelector('video');
  const msg = wrap.querySelector('.scan-msg');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stream = null, stopped = false, timer = null, detector = null, lastBad = '';

  const close = () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach(t => t.stop());
    wrap.remove();
    document.body.style.overflow = '';
  };
  wrap.querySelector('.scan-x').onclick = close;
  wrap.querySelector('[data-manual]').onclick = () => { close(); onManual?.(); };
  const say = (t, bad = false) => { msg.textContent = t; msg.classList.toggle('bad', bad); };

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      say('เบราว์เซอร์นี้เปิดกล้องไม่ได้ ใช้ “กรอกรหัสเอง” แทน', true);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
    } catch (e) {
      say(e.name === 'NotAllowedError' ? 'ไม่ได้อนุญาตให้ใช้กล้อง — กดอนุญาตกล้องในเบราว์เซอร์ แล้วลองใหม่' : 'เปิดกล้องไม่สำเร็จ: ' + e.message, true);
      return;
    }
    if (stopped) return stream.getTracks().forEach(t => t.stop());
    video.srcObject = stream;
    await video.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.() || {};
    if (caps.torch) {
      const b = wrap.querySelector('[data-torch]');
      let on = false;
      b.hidden = false;
      b.onclick = async () => { on = !on; try { await track.applyConstraints({ advanced: [{ torch: on }] }); } catch {} };
    }
    if ('BarcodeDetector' in window) {
      try {
        const fmts = await window.BarcodeDetector.getSupportedFormats();
        if (fmts.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {}
    }
    if (!detector) await loadJsQR().catch(e => say(e.message, true));
    loop();
  }

  async function scanOnce() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    // อ่านเฉพาะกลางภาพ (กรอบสแกน) ให้เร็วขึ้น
    const side = Math.min(vw, vh) * 0.8;
    const sx = (vw - side) / 2, sy = (vh - side) / 2;
    const size = Math.min(720, Math.round(side));
    canvas.width = canvas.height = size;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    if (detector) {
      const r = await detector.detect(canvas).catch(() => []);
      return r[0]?.rawValue || null;
    }
    if (window.jsQR) {
      const img = ctx.getImageData(0, 0, size, size);
      const r = window.jsQR(img.data, size, size, { inversionAttempts: 'attemptBoth' });
      return r?.data || null;
    }
    return null;
  }

  async function loop() {
    if (stopped) return;
    const text = await scanOnce();
    if (text) {
      const code = extractCode(text);
      if (code) {
        navigator.vibrate?.(80);
        wrap.classList.add('ok');
        say('✓ อ่าน QR สำเร็จ');
        setTimeout(() => { close(); onCode(code, text); }, 250);
        return;
      }
      if (text !== lastBad) { lastBad = text; say('QR นี้ไม่ใช่ QR ของเกม ลองอันอื่น', true); }
    }
    timer = setTimeout(loop, detector ? 120 : 180);
  }

  start();
  return { close };
}
