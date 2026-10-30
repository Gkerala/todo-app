// DB 접근은 이 파일과 server.js에서만 한다. 화면 코드는 DB를 직접 만지지 않는다.
const Database = require('better-sqlite3');

const db = new Database(process.env.DB_FILE || 'todo.db');
db.pragma('foreign_keys = ON'); // 외래키 규칙(ON DELETE CASCADE)을 켠다

db.exec(`
CREATE TABLE IF NOT EXISTS todos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  due_date   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);
`);

module.exports = db;
