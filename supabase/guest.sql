-- ============ 게스트 기록 옮기기 ============
-- 예전 '로그인 없이 참여하기'(게스트, 익명 계정)로 친 라운드를 진짜 계정으로 옮긴다.
--  · 관리자: 대시보드의 '게스트로 친 기록'에서 고른 계정으로 옮긴다 (admin_guest_players · admin_move_guest)
--  · 본인: 게스트 세션이 남은 폰에서 로그인하면 그 게스트 기록이 새 계정으로 저절로 옮겨진다
--    (로그인 전에 게스트로 create_guest_claim 을 불러 받은 표를, 로그인 뒤 claim_guest_rounds 에 낸다)
-- Supabase 대시보드 > SQL Editor 에서 admin.sql 다음에 실행. 여러 번 실행해도 안전하다.
-- 파일 전체를 붙여 넣고(일부만 선택하지 말고) 실행한다.

-- ---- 옮기기 (안에서만 쓴다) ----
-- p_from 이 참여한 라운드마다: 참여자 행·스코어·내 기록·AI 분석·홀 저장한 사람·방장, 그리고
-- rules 안의 사람별 값(핸디·평균타수·타수 보정·이름 고침·최저핸디 인원)을 p_to 로 바꾼다.
-- p_to 가 이미 들어가 있는 라운드는 두 사람이 한 라운드에 겹치므로 건너뛴다.
-- 돌려주는 값: {"moved": 옮긴 라운드 수, "skipped": 건너뛴 라운드 수}
create or replace function public.move_guest_rounds(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  moved int := 0;
  skipped int := 0;
  f text := p_from::text;
  t text := p_to::text;
begin
  if p_from is null or p_to is null or p_from = p_to then
    return jsonb_build_object('moved', 0, 'skipped', 0);
  end if;
  -- 저장된 홀·끝난 라운드의 스코어도 사람만 바꾸는 것이라 홀 저장 보호를 잠깐 연다 (이 거래 안에서만)
  perform set_config('app.hole_save', 'on', true);

  for rid in select round_id from public.round_players where user_uid = p_from loop
    if exists (select 1 from public.round_players where round_id = rid and user_uid = p_to) then
      skipped := skipped + 1;
      continue;
    end if;

    update public.round_players set user_uid = p_to, is_guest = false
      where round_id = rid and user_uid = p_from;
    update public.round_scores set player_uid = p_to
      where round_id = rid and player_uid = p_from;
    -- 내 기록·AI 분석·홀 저장한 사람: 해당 SQL(record·insight·holesave)을 실행한 DB 에만 있다
    if to_regclass('public.round_hole_stats') is not null then
      execute 'update public.round_hole_stats set player_uid = $1 where round_id = $2 and player_uid = $3'
        using p_to, rid, p_from;
    end if;
    if to_regclass('public.round_insights') is not null then
      execute 'update public.round_insights set player_uid = $1 where round_id = $2 and player_uid = $3'
        using p_to, rid, p_from;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'round_holes' and column_name = 'saved_by'
    ) then
      execute 'update public.round_holes set saved_by = $1 where round_id = $2 and saved_by = $3'
        using p_to, rid, p_from;
    end if;

    update public.rounds r set
      host_uid = case when r.host_uid = p_from then p_to else r.host_uid end,
      rules = coalesce((
        select jsonb_object_agg(e.key, case
          when e.key in ('hcOverrides', 'avgOverrides', 'strokeAdj', 'nameOverrides')
               and jsonb_typeof(e.value) = 'object' and e.value ? f
            then (e.value - f) || jsonb_build_object(t, e.value -> f)
          when e.key = 'baseUid' and e.value = to_jsonb(f) then to_jsonb(t)
          else e.value
        end)
        from jsonb_each(r.rules) e
      ), '{}'::jsonb)
      where r.id = rid;

    moved := moved + 1;
  end loop;

  perform set_config('app.hole_save', 'off', true);
  return jsonb_build_object('moved', moved, 'skipped', skipped);
end $$;

-- ---- 관리자: 게스트로 친 기록 ----
-- 라운드에 참여한 게스트(익명 계정)마다: 쓴 이름들, 만든 때, 참여한 라운드 (최근 순)
create or replace function public.admin_guest_players()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(jsonb_agg(g.v order by g.last desc), '[]'::jsonb)
  from (
    select
      (select max(r.created_at) from public.round_players rp join public.rounds r on r.id = rp.round_id
        where rp.user_uid = u.id) as last,
      jsonb_build_object(
        'guest_uid', u.id,
        'created_at', u.created_at,
        'names', (select coalesce(jsonb_agg(distinct rp.name), '[]'::jsonb)
                  from public.round_players rp where rp.user_uid = u.id),
        'rounds', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'round_id', r.id,
            'date', coalesce(nullif(r.date, ''), to_char(r.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD')),
            'course', r.course_name,
            'status', r.status,
            'hole_count', r.hole_count,
            'name', rp.name
          ) order by r.created_at desc), '[]'::jsonb)
          from public.round_players rp join public.rounds r on r.id = rp.round_id
          where rp.user_uid = u.id
        )
      ) as v
    from auth.users u
    where public.is_admin()
      and coalesce(u.is_anonymous, false)
      and exists (select 1 from public.round_players rp where rp.user_uid = u.id)
  ) g;
$$;

-- 관리자: 게스트(익명 계정)의 라운드를 진짜 계정으로 옮긴다
create or replace function public.admin_move_guest(p_guest uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_guest and coalesce(is_anonymous, false)) then
    raise exception 'NOT_GUEST' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user and not coalesce(is_anonymous, false)) then
    raise exception 'NO_USER' using errcode = 'P0002';
  end if;
  return public.move_guest_rounds(p_guest, p_user);
end $$;

-- ---- 본인: 게스트 세션에서 로그인할 때 저절로 옮기기 ----
-- 표: 게스트가 로그인하기 전에 받아 두는 일회용 표 (30일 동안 쓸 수 있다). 함수로만 읽고 쓴다
create table if not exists public.guest_claims (
  token uuid primary key default gen_random_uuid(),
  guest_uid uuid not null,
  created_at timestamptz not null default now()
);
alter table public.guest_claims enable row level security;

-- 게스트(익명 계정)만: 내 게스트 기록을 옮길 표를 받는다
create or replace function public.create_guest_claim()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  tok uuid;
begin
  if auth.uid() is null
     or not exists (select 1 from auth.users where id = auth.uid() and coalesce(is_anonymous, false)) then
    raise exception 'GUEST_ONLY' using errcode = '42501';
  end if;
  delete from public.guest_claims where created_at < now() - interval '30 days';
  insert into public.guest_claims (guest_uid) values (auth.uid()) returning token into tok;
  return tok;
end $$;

-- 로그인한 계정만: 받아 둔 표를 내면 그 게스트의 라운드를 내 계정으로 옮긴다 (표는 한 번 쓰면 없어진다)
create or replace function public.claim_guest_rounds(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  g uuid;
begin
  if auth.uid() is null
     or not exists (select 1 from auth.users where id = auth.uid() and not coalesce(is_anonymous, false)) then
    raise exception 'MEMBER_ONLY' using errcode = '42501';
  end if;
  delete from public.guest_claims
    where token = p_token and created_at >= now() - interval '30 days'
    returning guest_uid into g;
  if g is null then
    return jsonb_build_object('moved', 0, 'skipped', 0);
  end if;
  return public.move_guest_rounds(g, auth.uid());
end $$;

-- 옮기기는 안에서만 쓴다. 나머지는 로그인한 사용자만 (관리자·게스트·계정 확인은 함수 안에서)
revoke all on function public.move_guest_rounds(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_guest_players() from public, anon;
revoke all on function public.admin_move_guest(uuid, uuid) from public, anon;
revoke all on function public.create_guest_claim() from public, anon;
revoke all on function public.claim_guest_rounds(uuid) from public, anon;
grant execute on function public.admin_guest_players() to authenticated;
grant execute on function public.admin_move_guest(uuid, uuid) to authenticated;
grant execute on function public.create_guest_claim() to authenticated;
grant execute on function public.claim_guest_rounds(uuid) to authenticated;
