DROP TABLE IF EXISTS results;
DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS rounds;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS games;

-- ===== เนื้อหาเกม (ใช้ร่วมกันทุกห้อง) =====
-- mode: none = Admin ให้คะแนนเอง | quiz = โค-โดรน | wildlife = สิงห์ป่า | delivery = เจ้าเวหา
CREATE TABLE games (
  id            TEXT PRIMARY KEY,
  sort          INTEGER NOT NULL DEFAULT 0,
  mode          TEXT NOT NULL DEFAULT 'none',
  name          TEXT NOT NULL,
  name_en       TEXT DEFAULT '',
  tagline       TEXT DEFAULT '',
  duration      INTEGER NOT NULL DEFAULT 10,
  team_info     TEXT DEFAULT '',
  goal          TEXT DEFAULT '',
  rules         TEXT DEFAULT '',
  steps         TEXT DEFAULT '',
  tips          TEXT DEFAULT '',
  win           TEXT DEFAULT '',
  color         TEXT DEFAULT '#1d4ed8',
  image         TEXT DEFAULT '',
  default_image TEXT DEFAULT '',
  item_label    TEXT DEFAULT 'รายการ',
  reveal        INTEGER NOT NULL DEFAULT 0,
  visible       INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL DEFAULT '',
  hint       TEXT DEFAULT '',
  mission    TEXT DEFAULT '',
  art        TEXT DEFAULT '',
  image      TEXT DEFAULT '',
  choices    TEXT DEFAULT '[]',
  correct    INTEGER DEFAULT -1,
  category   TEXT DEFAULT '',
  on_field   INTEGER NOT NULL DEFAULT 1,
  size       TEXT DEFAULT 'M',
  answer     TEXT DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_items_game ON items(game_id, sort);

-- ===== ห้องแข่ง (Admin สร้างทุกครั้งที่ไปสอน) =====
CREATE TABLE rooms (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,          -- รหัสห้อง 5 ตัว
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',  -- open | closed
  names_locked INTEGER NOT NULL DEFAULT 0,    -- 1 = ห้ามกลุ่มเปลี่ยนชื่อ
  created_at   INTEGER NOT NULL
);

-- กลุ่มถูกสร้างโดย Admin เท่านั้น ผู้เรียนเข้าด้วย "บัตรกลุ่ม" (QR + PIN)
CREATE TABLE groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    INTEGER NOT NULL,
  no         INTEGER NOT NULL,
  name       TEXT NOT NULL,
  pin        TEXT NOT NULL,                   -- 4 หลัก ไม่ซ้ำในห้อง
  token      TEXT NOT NULL,                   -- กุญแจของเครื่องที่เข้ากลุ่ม
  color      TEXT NOT NULL DEFAULT '#1d4ed8',
  named      INTEGER NOT NULL DEFAULT 0,      -- 1 = ตั้งชื่อแล้ว (ตั้งได้ครั้งเดียว)
  joined_at  INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (room_id, pin),
  UNIQUE (room_id, no)
);

-- การเล่นเกม 1 เกมในห้อง 1 ห้อง
CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    INTEGER NOT NULL,
  game_id    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'waiting',   -- waiting | running | ended
  started_at INTEGER,
  ends_at    INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (room_id, game_id)
);

CREATE TABLE answers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  group_id   INTEGER NOT NULL,
  item_id    INTEGER NOT NULL,
  choice     INTEGER,
  correct    INTEGER NOT NULL DEFAULT 0,   -- quiz/delivery: 1 ถูก | wildlife: +1/-1
  created_at INTEGER NOT NULL,
  UNIQUE (session_id, group_id, item_id)
);
CREATE INDEX idx_answers_session ON answers(session_id);

-- คะแนนที่ Admin ให้ (เกมไม่มี QR) / โบนัส-หัก (ทุกเกม) และเวลาส่งรายงาน (สิงห์ป่า)
CREATE TABLE results (
  session_id   INTEGER NOT NULL,
  group_id     INTEGER NOT NULL,
  manual       INTEGER NOT NULL DEFAULT 0,
  submitted_at INTEGER,
  PRIMARY KEY (session_id, group_id)
);
