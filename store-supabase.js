// 클라우드 저장소(Supabase). Publishable 키 + "로그인한 사용자의 토큰"으로 요청하므로 RLS가 적용된다.
// Secret(service_role) 키는 RLS를 무시하므로 쓰지 않는다.
const { createClient } = require('@supabase/supabase-js');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const base = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, opts);
const asUser = token => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  ...opts, global: { headers: { Authorization: `Bearer ${token}` } },
});

const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

module.exports = {
  // 로그인/토큰 확인은 server.js가 쓴다
  async login(email, password) {
    const { data, error } = await base().auth.signInWithPassword({ email, password });
    if (error) return null;
    return data.session.access_token;
  },
  // 이메일 인증이 꺼져 있으면 가입 즉시 로그인(token), 켜져 있으면 인증 메일을 기다린다(pending)
  async signUp(email, password) {
    const { data, error } = await base().auth.signUp({ email, password });
    if (error) return { error: error.message };
    return data.session ? { token: data.session.access_token } : { pending: true };
  },
  async whoami(token) {
    const { data, error } = await base().auth.getUser(token);
    return error ? null : { token, userId: data.user.id };
  },

  async list(ctx, { today, q, tag }) {
    const sb = asUser(ctx.token);
    let query = sb.from('todos')
      .select('id, title, done, due_date, todo_tags(tags(name))')
      .order('done').order('due_date', { nullsFirst: false }).order('id');
    if (today) query = query.eq('due_date', new Date().toLocaleDateString('sv')); // YYYY-MM-DD (서버 로컬 날짜)
    if (q) query = query.ilike('title', `%${q}%`);
    if (tag) {
      const t = ok(await sb.from('tags').select('id').eq('name', tag).maybeSingle());
      if (!t) return [];
      const links = ok(await sb.from('todo_tags').select('todo_id').eq('tag_id', t.id));
      query = query.in('id', links.map(l => l.todo_id));
    }
    return ok(await query).map(r => ({ ...r, tags: r.todo_tags.map(x => x.tags.name), todo_tags: undefined }));
  },

  // ponytail: REST 호출 여러 번이라 중간에 실패하면 반쪽만 저장될 수 있어 아래에서 할 일을 지워 되돌린다.
  // 완전한 원자성이 필요하면 Postgres 함수(rpc) 하나로 묶는다.
  async add(ctx, { title, due_date, tags }) {
    const sb = asUser(ctx.token);
    const todo = ok(await sb.from('todos').insert({ title, due_date, user_id: ctx.userId }).select('id').single());
    try {
      if (tags.length) {
        ok(await sb.from('tags').upsert(tags.map(name => ({ name, user_id: ctx.userId })),
          { onConflict: 'user_id,name', ignoreDuplicates: true }));
        const rows = ok(await sb.from('tags').select('id').in('name', tags));
        ok(await sb.from('todo_tags').insert(rows.map(t => ({ todo_id: todo.id, tag_id: t.id }))));
      }
    } catch (e) {
      await sb.from('todos').delete().eq('id', todo.id);
      throw e;
    }
    return todo.id;
  },

  // RLS 때문에 남의 행은 "없는 행"처럼 보여서 0건이 수정/삭제된다 → false
  async setDone(ctx, id, done) {
    return ok(await asUser(ctx.token).from('todos').update({ done: !!done }).eq('id', id).select('id')).length > 0;
  },

  async remove(ctx, id) {
    return ok(await asUser(ctx.token).from('todos').delete().eq('id', id).select('id')).length > 0;
  },
};
