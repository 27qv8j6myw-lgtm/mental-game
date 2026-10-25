-- ============ AI 분석: 권한 · 보관 ============
-- AI 기능은 관리자와, 관리자가 대시보드에서 허용한 사람만 쓸 수 있다. 허용은 두 단계:
--   기본(basic): 기록 화면의 'AI 분석'
--   고급(advanced): 기본 + 라운드 중 홀마다 AI 코칭 (api/coach.ts)
-- 관리자는 늘 모두 쓸 수 있다.
-- 한 번 만든 분석은 round_insights 에 저장해 두고, 다음에 열 때 다시 만들지 않고 쓴다.
-- Supabase 대시보드 > SQL Editor 에서 admin.sql 다음에 실행. 여러 번 실행해도 안전하다.
-- 파일 전체를 붙여 넣고(일부만 선택하지 말고) 실행한다.

-- ---- AI 분석을 쓸 수 있는 사람 (관리자는 늘 쓸 수 있어 여기에 없다) ----
create table if not exists public.ai_grants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
-- 정책을 두지 않아 앱에서 직접 읽거나 쓸 수 없다. 아래 함수로만 다룬다
alter table public.ai_grants enable row level security;
-- 허용 단계 (예전에 허용한 사람은 기본)
alter table public.ai_grants add column if not exists level text not null default 'basic';
alter table public.ai_grants drop constraint if exists ai_grants_level_check;
alter table public.ai_grants add constraint ai_grants_level_check check (level in ('basic', 'advanced'));

-- 나는 AI 분석을 쓸 수 있나 (관리자 또는 허용된 사람)
create or replace function public.can_use_ai()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (select 1 from public.ai_grants where user_id = auth.uid());
$$;
revoke all on function public.can_use_ai() from public, anon;
grant execute on function public.can_use_ai() to authenticated;

-- 나는 라운드 중 AI 홀 코칭을 쓸 수 있나 (관리자 또는 고급으로 허용된 사람)
create or replace function public.can_use_ai_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (select 1 from public.ai_grants where user_id = auth.uid() and level = 'advanced');
$$;
revoke all on function public.can_use_ai_coach() from public, anon;
grant execute on function public.can_use_ai_coach() to authenticated;

-- 관리자: AI 분석 허용 / 해제
create or replace function public.admin_set_ai_grant(p_user_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  if p_on then
    insert into public.ai_grants (user_id) values (p_user_id) on conflict (user_id) do nothing;
  else
    delete from public.ai_grants where user_id = p_user_id;
  end if;
end $$;
revoke all on function public.admin_set_ai_grant(uuid, boolean) from public, anon;
grant execute on function public.admin_set_ai_grant(uuid, boolean) to authenticated;

-- 관리자: AI 단계 정하기 (none: 해제 · basic: 기본 · advanced: 고급)
create or replace function public.admin_set_ai_level(p_user_id uuid, p_level text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  if p_level = 'none' then
    delete from public.ai_grants where user_id = p_user_id;
  elsif p_level in ('basic', 'advanced') then
    insert into public.ai_grants (user_id, level) values (p_user_id, p_level)
      on conflict (user_id) do update set level = excluded.level;
  else
    raise exception 'BAD_LEVEL' using errcode = '22023';
  end if;
end $$;
revoke all on function public.admin_set_ai_level(uuid, text) from public, anon;
grant execute on function public.admin_set_ai_level(uuid, text) to authenticated;

-- 관리자: AI 분석을 허용한 사람 목록 (이메일은 앞 2글자만, 허용 단계 포함)
-- (돌려주는 칸이 늘어 예전 함수를 지우고 다시 만든다)
drop function if exists public.admin_ai_grants();
create or replace function public.admin_ai_grants()
returns table (user_id uuid, name text, email_masked text, created_at timestamptz, level text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    g.user_id,
    coalesce(nullif(trim(u.raw_user_meta_data ->> 'mg_name'), ''), u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
    case
      when coalesce(u.email, '') = '' then null
      else left(split_part(u.email, '@', 1), 2) || '***@' || split_part(u.email, '@', 2)
    end,
    g.created_at,
    g.level
  from public.ai_grants g
  join auth.users u on u.id = g.user_id
  where public.is_admin()
  order by g.created_at desc;
$$;
revoke all on function public.admin_ai_grants() from public, anon;
grant execute on function public.admin_ai_grants() to authenticated;

-- ---- 분석 보관 ----
-- 라운드 하나 · 사람 하나 · 범위(scope) 하나에 분석 하나 (다시 만들면 덮어쓴다). 라운드를 지우면 함께 지워진다.
-- scope: all 라운드 전체 · out 전반 9홀 · in 후반 9홀 (기록 화면의 전반·후반 칩)
-- fingerprint: 분석할 때의 기록 요약. 그 뒤 기록을 고치면 앱이 '기록이 바뀌었어요'로 알려 준다
create table if not exists public.round_insights (
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_uid uuid not null,
  scope text not null default 'all',
  -- {"stats": "...", "teeShot": "...", "scoring": "...", "course": "...", "summary": "..."}
  sections jsonb not null,
  model text not null default '',
  fingerprint text not null default '',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (round_id, player_uid, scope)
);
alter table public.round_insights add column if not exists fingerprint text not null default '';

-- 전반·후반 분석 (예전에 만든 표: 칸을 더하고, 기본 키를 라운드·사람·범위로 바꾼다. 예전 분석은 라운드 전체)
alter table public.round_insights add column if not exists scope text not null default 'all';
alter table public.round_insights drop constraint if exists round_insights_scope_check;
alter table public.round_insights add constraint round_insights_scope_check check (scope in ('all', 'out', 'in'));
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.round_insights'::regclass and c.contype = 'p' and a.attname = 'scope'
  ) then
    alter table public.round_insights drop constraint if exists round_insights_pkey;
    alter table public.round_insights add primary key (round_id, player_uid, scope);
  end if;
end $$;

alter table public.round_insights enable row level security;

-- 관리자는 모든 분석, 허용된 사람은 내 기록의 분석만 읽고 쓴다
drop policy if exists ri_admin on public.round_insights;
drop policy if exists ri_access on public.round_insights;
create policy ri_access on public.round_insights
  for all
  using (public.is_admin() or (player_uid = auth.uid() and public.can_use_ai()))
  with check (public.is_admin() or (player_uid = auth.uid() and public.can_use_ai()));
