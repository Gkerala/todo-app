-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 Run.
-- 로컬 SQLite 구조(todos, tags, todo_tags)와 같고, 길 B에서 user_id가 추가된다 (마이그레이션).

create table public.todos (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  due_date   date,
  created_at timestamptz not null default now()
);

create table public.tags (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name    text not null,
  unique (user_id, name)               -- 태그 이름은 "내 안에서만" 중복 불가
);

create table public.todo_tags (
  todo_id bigint not null references public.todos(id) on delete cascade,
  tag_id  bigint not null references public.tags(id)  on delete cascade,
  primary key (todo_id, tag_id)
);

-- RLS 켜기. 켜기만 하면 정책이 없어서 아무도 접근 못 하므로, 아래 정책을 같이 만든다.
alter table public.todos     enable row level security;
alter table public.tags      enable row level security;
alter table public.todo_tags enable row level security;

-- "로그인한 사용자 = 이 행의 주인" 일 때만 조회·추가·수정·삭제 허용
create policy "내 할 일만" on public.todos
  for all to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "내 태그만" on public.tags
  for all to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 연결표는 user_id가 없으므로, 연결된 할 일과 태그가 둘 다 내 것일 때만 허용
create policy "내 연결만" on public.todo_tags
  for all to authenticated
  using (
    exists (select 1 from public.todos t where t.id = todo_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.tags g where g.id = tag_id and g.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.todos t where t.id = todo_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.tags g where g.id = tag_id and g.user_id = (select auth.uid()))
  );
