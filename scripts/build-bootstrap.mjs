// สร้าง lib/bootstrap.js จาก schema.sql + seed.sql
// ใช้ให้ฐานข้อมูลบน Cloudflare สร้างตาราง + ข้อมูลตั้งต้นเองอัตโนมัติในครั้งแรกที่มีคนเปิดเว็บ
import { readFileSync, writeFileSync } from 'node:fs';

function split(sql) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (!q && c === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; cur += '\n'; continue; }
    if (c === "'") q = !q;
    if (!q && c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const schema = split(readFileSync('schema.sql', 'utf8')).filter(s => !/^DROP /i.test(s))
  .map(s => s.replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS ').replace(/^CREATE INDEX /i, 'CREATE INDEX IF NOT EXISTS '));
const seed = split(readFileSync('seed.sql', 'utf8'));
const js = `// ไฟล์นี้สร้างอัตโนมัติด้วย \`npm run build:db\` — อย่าแก้ด้วยมือ
const SCHEMA = ${JSON.stringify(schema, null, 1)};
const SEED = ${JSON.stringify(seed, null, 1)};
let ready = false;
export async function ensureDb(env) {
  if (ready) return;
  const t = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'games'").first();
  if (!t) {
    await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
    await env.DB.batch(SEED.map(s => env.DB.prepare(s)));
  }
  ready = true;
}
`;
writeFileSync('lib/bootstrap.js', js);
console.log(`bootstrap.js: ${schema.length} schema + ${seed.length} seed statements`);
