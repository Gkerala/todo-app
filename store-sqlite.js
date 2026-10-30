// 로컬 저장소(SQLite). 함수 4개의 모양은 store-supabase.js와 같다. ctx(로그인 정보)는 쓰지 않는다.
const db = require('./db');

const addTx = db.transaction(({ title, due_date, tags }) => {
  const id = db.prepare('INSERT INTO todos (title, due_date) VALUES (?, ?)').run(title, due_date).lastInsertRowid;
  for (const name of tags) {
    db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name);
    const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(name);
    db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(id, tag.id);
  }
  return id;
});

module.exports = {
  async list(ctx, { today, q, tag }) {
    const where = [];
    const params = [];
    if (today) where.push("t.due_date = date('now', 'localtime')");
    if (q) { where.push('t.title LIKE ?'); params.push(`%${q}%`); }
    if (tag) {
      where.push('t.id IN (SELECT tt.todo_id FROM todo_tags tt JOIN tags g ON g.id = tt.tag_id WHERE g.name = ?)');
      params.push(tag);
    }
    const sql = `
      SELECT t.id, t.title, t.done, t.due_date,
             (SELECT group_concat(g.name, ',') FROM todo_tags tt JOIN tags g ON g.id = tt.tag_id
               WHERE tt.todo_id = t.id) AS tags
      FROM todos t
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.done, t.due_date IS NULL, t.due_date, t.id`;
    return db.prepare(sql).all(...params).map(r => ({ ...r, done: !!r.done, tags: r.tags ? r.tags.split(',') : [] }));
  },

  async add(ctx, todo) {
    return addTx(todo);
  },

  async setDone(ctx, id, done) {
    return db.prepare('UPDATE todos SET done = ? WHERE id = ?').run(done ? 1 : 0, id).changes > 0;
  },

  async remove(ctx, id) {
    return db.prepare('DELETE FROM todos WHERE id = ?').run(id).changes > 0;
  },
};
