-- ============ 랭킹: 모든 이용자의 타수 순위 · 이용자 기록 요약 ============
-- 다른 사람의 라운드는 권한(RLS) 때문에 볼 수 없어서, 랭킹에 필요한 값만 돌려주는 함수를 둔다.
-- - ranking_rounds(): 끝난 라운드에서 끝까지 친 사람마다 타수 (월별·연도별 순위는 앱이 계산)
-- - ranking_profile(uid): 그 사람의 기록 라운드(기록 모드 + 상세 기록을 남긴 내기 라운드) 홀별 기록
--   (페어웨이·GIR·퍼트·스크램블·보정타수는 앱이 '라운드 기록'과 같은 방식으로 계산)
-- 순위에는 로그인 계정만 들어간다 (폰 없는 동반자·로그인 없이 참여한 게스트는 빠진다).
-- 공개 범위(ranking_settings): 함께 친 사람만(기본, 끝난 라운드를 같이 친 사람) / 전체 공개 / 숨기기.
--   내 공개 범위가 곧 내가 보는 범위다: 함께 친 사람만이면 함께 친 사람끼리, 전체 공개면 전체 공개한 사람까지.
--   (전체 공개여도 함께 친 사람만 고른 사람은 함께 친 적이 없으면 보이지 않는다)
--   숨긴 사람은 순위·이용자 기록에서 빠지고, 다른 사람 랭킹도 볼 수 없다 (내 기록만 받는다).
-- 모르는 사람 제외(ranking_excludes)는 내 랭킹에서만 그 사람을 빼고 순위를 매긴다 (앱이 계산할 때 뺀다).
-- Supabase 대시보드 > SQL Editor 에서 schema.sql · lobby.sql · holesave.sql · record.sql 다음에 실행.
-- 여러 번 실행해도 안전하다.

-- ---- 내 공개 범위 ----
-- played: 함께 친 사람만 (기본, 설정이 없으면 이것) / all: 모든 이용자 / hidden: 숨기기
create table if not exists public.ranking_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  visibility text not null default 'played' check (visibility in ('played', 'all', 'hidden')),
  updated_at timestamptz not null default now()
);
alter table public.ranking_settings enable row level security;
-- 내 설정만 읽는다 (바꾸는 건 set_ranking_visibility)
drop policy if exists ranking_settings_select on public.ranking_settings;
create policy ranking_settings_select on public.ranking_settings
  for select to authenticated using (user_id = auth.uid());

-- 먼저 만든 판(랭킹에서 숨기기 표)을 실행했으면 숨긴 설정을 옮기고 지운다
do $$
begin
  if to_regclass('public.ranking_hidden') is not null then
    insert into public.ranking_settings (user_id, visibility)
      select user_id, 'hidden' from public.ranking_hidden
      on conflict (user_id) do update set visibility = 'hidden';
    drop table public.ranking_hidden;
  end if;
end $$;
drop function if exists public.set_ranking_hidden(boolean);

create or replace function public.set_ranking_visibility(p_visibility text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if p_visibility not in ('played', 'all', 'hidden') then
    raise exception 'BAD_VISIBILITY' using errcode = '22023';
  end if;
  insert into public.ranking_settings (user_id, visibility) values (auth.uid(), p_visibility)
    on conflict (user_id) do update set visibility = excluded.visibility, updated_at = now();
end $$;

-- 보는 사람(p_viewer)에게 그 사람(p_uid)의 랭킹 기록이 보이는지.
-- 나 자신은 늘. 아니면 둘 다 숨기지 않았고, 끝난 라운드를 함께 쳤거나 둘 다 전체 공개일 때
-- (서로 같은 규칙이라 내가 보이는 사람만 나를 본다. 아래 함수들 안에서만 쓴다. 앱에서 바로 부를 수 없다)
create or replace function public.ranking_visible(p_viewer uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid = p_viewer or (
    coalesce((select visibility from public.ranking_settings where user_id = p_viewer), 'played') <> 'hidden'
    and coalesce((select visibility from public.ranking_settings where user_id = p_uid), 'played') <> 'hidden'
    and (
      (coalesce((select visibility from public.ranking_settings where user_id = p_viewer), 'played') = 'all'
        and coalesce((select visibility from public.ranking_settings where user_id = p_uid), 'played') = 'all')
      or exists (
        select 1
        from public.round_players a
        join public.rounds r on r.id = a.round_id and r.status = 'done'
        join public.round_players b on b.round_id = a.round_id
        where a.user_uid = p_viewer and not a.offline_player
          and b.user_uid = p_uid and not b.offline_player)
    )
  );
$$;

-- ---- 모르는 사람 제외하기 (내 랭킹에서만, 그 사람에게는 영향 없음) ----
-- 이름은 랭킹 관리 화면에 보이려고 뺄 때 적어 둔다 (그 사람이 나중에 랭킹에서 숨어도 보이게)
create table if not exists public.ranking_excludes (
  user_id uuid not null references auth.users (id) on delete cascade,
  excluded_uid uuid not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, excluded_uid)
);
alter table public.ranking_excludes enable row level security;
-- 내 목록만 읽고 넣고 지운다
drop policy if exists ranking_excludes_own on public.ranking_excludes;
create policy ranking_excludes_own on public.ranking_excludes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.ranking_rounds()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with my_vis as (
    select coalesce((select visibility from public.ranking_settings where user_id = auth.uid()), 'played') as v
  ),
  done as (
    select
      r.id,
      r.hole_count,
      r.course_name,
      coalesce(nullif(r.date, ''), to_char(r.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD')) as day,
      -- 홀 저장 라운드는 저장된 홀만 센다 (앱 정산과 같다)
      (coalesce(r.rules ->> 'gameMode', 'stroke') <> 'record'
        and coalesce(r.rules ->> 'holeSave', '') = 'true') as hole_save
    from public.rounds r
    where r.status = 'done'
  ),
  members as (
    select
      rp.round_id, rp.user_uid, rp.photo_url, rp.gender, rp.joined_at,
      -- 앱에서 정한 이름(실명)이 있으면 그것, 없으면 그 라운드 이름
      coalesce(nullif(trim(u.raw_user_meta_data ->> 'mg_name'), ''), rp.name) as name
    from public.round_players rp
    join auth.users u on u.id = rp.user_uid
    where not rp.offline_player and not coalesce(u.is_anonymous, false)
      -- 공개 범위에 따라 나에게 보이는 사람만 (함께 친 사람만 / 전체 공개끼리, 내가 숨겼으면 나만)
      and public.ranking_visible(auth.uid(), rp.user_uid)
  ),
  per as (
    -- 홀마다: 파가 없으면 4, 타수는 더블파까지 (앱과 같다)
    select
      m.user_uid,
      d.id as round_id,
      d.day,
      d.course_name,
      d.hole_count,
      count(s.rel) filter (where not d.hole_save or h.saved_at is not null) as n,
      sum(coalesce(h.par, 4) + least(s.rel, coalesce(h.par, 4)))
        filter (where not d.hole_save or h.saved_at is not null) as gross
    from done d
    join members m on m.round_id = d.id
    cross join lateral generate_series(0, d.hole_count - 1) as g(i)
    left join public.round_holes h on h.round_id = d.id and h.hole_index = g.i
    left join public.round_scores s
      on s.round_id = d.id and s.hole_index = g.i and s.player_uid = m.user_uid
    group by m.user_uid, d.id, d.day, d.course_name, d.hole_count
  ),
  finished as (
    select * from per where n = hole_count
  ),
  people as (
    -- 이름(실명이 없으면)·사진은 가장 최근에 참여한 라운드 것
    select distinct on (m.user_uid) m.user_uid, m.name, m.photo_url, m.gender
    from members m
    where m.user_uid in (select user_uid from finished)
    order by m.user_uid, m.joined_at desc
  )
  select jsonb_build_object(
    'visibility', (select v from my_vis),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'uid', user_uid, 'name', name, 'photo_url', photo_url, 'gender', gender))
      from people), '[]'::jsonb),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'uid', user_uid, 'round_id', round_id, 'date', day, 'course', course_name,
        'holes', hole_count, 'gross', gross))
      from finished), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

create or replace function public.ranking_profile(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with mine as (
    select
      r.id, r.date, r.created_at, r.course_name, r.course_tee, r.hole_count, r.rules, rp.gender,
      -- 사람별 티 (lobby.sql 의 tee 칸. 칸이 없는 DB 에서도 돌게 행 전체에서 꺼낸다)
      to_jsonb(rp) ->> 'tee' as ptee
    from public.rounds r
    join public.round_players rp
      on rp.round_id = r.id and rp.user_uid = p_uid and not rp.offline_player
    where r.status = 'done'
      and (coalesce(r.rules ->> 'gameMode', 'stroke') = 'record'
        or exists (
          select 1 from public.round_hole_stats st
          where st.round_id = r.id and st.player_uid = p_uid))
      -- 공개 범위에 따라 나에게 보이는 사람만
      and public.ranking_visible(auth.uid(), p_uid)
  )
  select jsonb_build_object(
    -- 규칙(rules)은 다른 내용이 있어 레이팅·게임 방식만 내보낸다
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'date', coalesce(nullif(date, ''), to_char(created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD')),
        'course_name', course_name,
        'course_tee', coalesce(ptee, course_tee),
        'hole_count', hole_count,
        'game_mode', coalesce(rules ->> 'gameMode', 'stroke'),
        -- 그 사람이 다른 티를 쳤으면 그 티의 레이팅
        'rating', coalesce(rules -> 'teeRatings' -> ptee, rules -> 'rating'),
        'gender', gender))
      from mine), '[]'::jsonb),
    'holes', coalesce((
      select jsonb_agg(jsonb_build_object('round_id', h.round_id, 'hole_index', h.hole_index, 'par', h.par))
      from public.round_holes h
      where h.round_id in (select id from mine)), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(jsonb_build_object('round_id', s.round_id, 'hole_index', s.hole_index, 'rel', s.rel))
      from public.round_scores s
      where s.round_id in (select id from mine) and s.player_uid = p_uid), '[]'::jsonb),
    'stats', coalesce((
      select jsonb_agg(jsonb_build_object(
        'round_id', st.round_id, 'hole_index', st.hole_index, 'putts', st.putts,
        'fairway', st.fairway, 'lie', st.lie, 'ob', st.ob, 'hazard', st.hazard, 'sand', st.sand))
      from public.round_hole_stats st
      where st.round_id in (select id from mine) and st.player_uid = p_uid), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

-- 로그인한 사용자만 호출할 수 있다
revoke all on function public.set_ranking_visibility(text) from public, anon;
revoke all on function public.ranking_visible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ranking_rounds() from public, anon;
revoke all on function public.ranking_profile(uuid) from public, anon;
grant execute on function public.set_ranking_visibility(text) to authenticated;
grant select on public.ranking_settings to authenticated;
grant select, insert, delete on public.ranking_excludes to authenticated;
grant execute on function public.ranking_rounds() to authenticated;
grant execute on function public.ranking_profile(uuid) to authenticated;
