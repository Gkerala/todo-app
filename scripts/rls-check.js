// RLS 확인: 계정 A가 만든 할 일을 계정 B가 보거나 고치거나 지울 수 있는지 본다.
// 사용: 클라우드 서버를 켜고(npm run start:cloud) → npm run check:rls
// 테스트 계정 정보는 .env의 TEST_A_*, TEST_B_*에서 읽는다 (가짜 이메일 전용).
const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
const accounts = {
  A: [process.env.TEST_A_EMAIL, process.env.TEST_A_PASSWORD],
  B: [process.env.TEST_B_EMAIL, process.env.TEST_B_PASSWORD],
};
for (const [k, [e, p]] of Object.entries(accounts)) {
  if (!e || !p) { console.error(`.env에 TEST_${k}_EMAIL / TEST_${k}_PASSWORD 를 채워 주세요`); process.exit(1); }
}

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? '통과' : '실패'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const call = (token, method, path, body) => fetch(BASE + path, {
  method,
  headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
  body: body && JSON.stringify(body),
});
const login = async ([email, password]) => (await (await call(null, 'POST', '/api/login', { email, password })).json()).token;

(async () => {
  const tokA = await login(accounts.A);
  const tokB = await login(accounts.B);
  check('두 계정 모두 로그인된다', !!tokA && !!tokB);
  if (!tokA || !tokB) process.exit(1);

  console.log('\n[백엔드 API를 통해]');
  const mark = 'RLS확인-' + Date.now();
  const id = (await (await call(tokA, 'POST', '/api/todos', { title: mark, tags: ['rls-test'] })).json()).id;
  const mine = await (await call(tokA, 'GET', '/api/todos')).json();
  check('A는 자기 할 일이 보인다', mine.some(t => t.id === id));
  const theirs = await (await call(tokB, 'GET', '/api/todos')).json();
  check('B에게는 A의 할 일이 안 보인다', !theirs.some(t => t.id === id));
  const patch = await call(tokB, 'PATCH', `/api/todos/${id}`, { done: true });
  check('B가 A의 할 일을 수정하려 하면 거절된다', patch.status === 404, 'HTTP ' + patch.status);
  const del = await call(tokB, 'DELETE', `/api/todos/${id}`);
  check('B가 A의 할 일을 삭제하려 하면 거절된다', del.status === 404, 'HTTP ' + del.status);
  const after = (await (await call(tokA, 'GET', '/api/todos')).json()).find(t => t.id === id);
  check('A의 원래 할 일은 그대로다 (남아 있고 완료 안 됨)', !!after && after.done === false);
  const viaTag = await (await call(tokB, 'GET', '/api/todos?tag=rls-test')).json();
  check('B가 A의 태그로 찾아도 안 보인다', viaTag.length === 0);
  check('로그인 없이는 거절된다', (await call(null, 'GET', '/api/todos')).status === 401);

  console.log('\n[백엔드를 거치지 않고 DB에 직접 (RLS 자체 확인)]');
  const asB = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: 'Bearer ' + tokB } },
  });
  const sel = await asB.from('todos').select('id').eq('id', id);
  check('B가 DB에 직접 조회해도 0행', !sel.error && sel.data.length === 0);
  const upd = await asB.from('todos').update({ done: true }).eq('id', id).select('id');
  check('B가 DB에 직접 수정해도 0행', !upd.error && upd.data.length === 0);
  const idB = (await asB.auth.getUser()).data.user.id;
  const idA = (await createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: 'Bearer ' + tokA } },
  }).auth.getUser()).data.user.id;
  const forged = await asB.from('todos').insert({ title: '남의 이름으로', user_id: idA });
  check('B가 A의 user_id로 할 일을 만들려 하면 거절된다', !!forged.error, forged.error?.code);
  check('두 계정의 user_id가 서로 다르다', idA !== idB);

  await call(tokA, 'DELETE', `/api/todos/${id}`); // 정리
  console.log(`\n${results.every(Boolean) ? '모두 통과' : '실패 있음'} (${results.filter(Boolean).length}/${results.length})`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
