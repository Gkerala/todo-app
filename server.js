const express = require('express');

// 실행 방식: node server.js [sqlite|supabase]  (npm start = 로컬, npm run start:cloud = Supabase)
const mode = process.argv[2] || process.env.STORAGE || 'sqlite';
if (!['sqlite', 'supabase'].includes(mode)) throw new Error(`알 수 없는 저장소: ${mode}`);
const store = require(`./store-${mode}`);
const needLogin = mode === 'supabase';

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.get('/api/config', (req, res) => res.json({ mode, login: needLogin }));

if (needLogin) {
  // ponytail: 토큰 만료(보통 1시간) 시 다시 로그인. refresh 토큰 처리는 생략.
  app.post('/api/login', async (req, res) => {
    const token = await store.login(String(req.body.email || ''), String(req.body.password || ''));
    token ? res.json({ token }) : res.status(401).json({ error: '이메일 또는 비밀번호가 틀렸습니다' });
  });

  // 회원가입: 비밀번호는 우리 서버가 저장하지 않고 Supabase Auth에 맡긴다
  app.post('/api/signup', async (req, res) => {
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: '이메일 형식이 아닙니다' });
    if (password.length < 8) return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다' });
    const r = await store.signUp(email, password);
    if (r.error) return res.status(400).json({ error: '가입할 수 없습니다: ' + r.error });
    r.token
      ? res.status(201).json({ token: r.token })
      : res.status(202).json({ message: '인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요' });
  });
}

// 로그인 확인: Supabase 모드에서는 토큰이 없거나 틀리면 401. 로컬 모드는 로그인이 없다.
app.use('/api/todos', async (req, res, next) => {
  if (!needLogin) { req.ctx = {}; return next(); }
  const token = (req.get('Authorization') || '').replace(/^Bearer /, '');
  req.ctx = token && await store.whoami(token);
  req.ctx ? next() : res.status(401).json({ error: '로그인이 필요합니다' });
});

app.get('/api/todos', async (req, res) => {
  res.json(await store.list(req.ctx, { today: req.query.today, q: req.query.q, tag: req.query.tag }));
});

app.post('/api/todos', async (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: '제목이 필요합니다' });
  const due_date = req.body.due_date || null;
  if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) return res.status(400).json({ error: '마감일은 YYYY-MM-DD' });
  const tags = [...new Set((req.body.tags || []).map(s => String(s).trim()).filter(Boolean))];
  res.status(201).json({ id: await store.add(req.ctx, { title, due_date, tags }) });
});

// 완료 표시: { done: true|false }
app.patch('/api/todos/:id', async (req, res) => {
  (await store.setDone(req.ctx, req.params.id, req.body.done)) ? res.json({ ok: true }) : res.status(404).json({ error: '없는 할 일' });
});

app.delete('/api/todos/:id', async (req, res) => {
  (await store.remove(req.ctx, req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: '없는 할 일' });
});

// 내부 오류 내용(키, SQL 등)을 화면에 내보내지 않는다
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: '서버 오류' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`http://localhost:${port}  (저장소: ${mode})`));
