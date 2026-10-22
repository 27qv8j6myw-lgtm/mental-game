-- 멘탈게임 · 관리자 대시보드 (schema.sql 다음에 실행)
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요. (여러 번 실행해도 안전)
--
-- 실행 후 내 계정을 관리자로 한 번 등록하면 앱 프로필 메뉴에 '관리자 대시보드' 버튼이 보입니다.
--   1) 내 계정 찾기:
--        select id, email, raw_user_meta_data->>'full_name' as name, created_at
--        from auth.users order by created_at;
--   2) 등록 (위에서 찾은 id 를 넣기):
--        insert into public.admins (user_id) values ('여기에-id') on conflict do nothing;

-- ============ 관리자 목록 ============
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- 정책을 두지 않아 앱에서 직접 읽거나 쓸 수 없다. 아래 함수로만 확인한다
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ============ 대시보드 통계 (관리자만, 날짜는 한국 시간 기준) ============
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  tz constant text := 'Asia/Seoul';
  today date := (now() at time zone tz)::date;
  this_week date := date_trunc('week', (now() at time zone tz))::date;
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  with
  u as (
    select
      created_at,
      last_sign_in_at,
      (created_at at time zone tz)::date as day,
      coalesce(raw_app_meta_data -> 'providers', '[]'::jsonb) as providers
    from auth.users
    where not coalesce(is_anonymous, false)
  ),
  r as (
    select
      id,
      status,
      unit,
      rules,
      handicap_settle,
      (created_at at time zone tz)::date as day,
      coalesce(jsonb_array_length(case when jsonb_typeof(rules -> 'editLog') = 'array'
                                       then rules -> 'editLog' end), 0) as edits
    from public.rounds
  ),
  pc as (
    select round_id, count(*) as n from public.round_players group by round_id
  ),
  days as (
    select (today - g)::date as day from generate_series(0, 29) as g
  ),
  weeks as (
    select (this_week - g * 7)::date as wk from generate_series(0, 11) as g
  )
  select jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from u),
      'today', (select count(*) from u where day = today),
      'last7', (select count(*) from u where day > today - 7),
      'active7', (select count(*) from u where last_sign_in_at > now() - interval '7 days'),
      'providers', jsonb_build_object(
        'google', (select count(*) from u where providers ? 'google' and not providers ? 'kakao'),
        'kakao', (select count(*) from u where providers ? 'kakao' and not providers ? 'google'),
        'both', (select count(*) from u where providers ? 'google' and providers ? 'kakao')
      ),
      'daily', (
        select jsonb_agg(jsonb_build_object('day', d.day, 'count',
                 (select count(*) from u where u.day = d.day)) order by d.day)
        from days d
      )
    ),
    'rounds', jsonb_build_object(
      'total', (select count(*) from r),
      'today', (select count(*) from r where day = today),
      'last7', (select count(*) from r where day > today - 7),
      'by_status', (
        select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) as n from r group by status) s
      ),
      'by_game', (
        select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
        from (select coalesce(rules ->> 'gameMode', 'stroke') as k, count(*) as n
              from r group by 1) s
      ),
      'by_handicap', (
        select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
        from (select coalesce(rules ->> 'handicapMode', 'avg') as k, count(*) as n
              from r where coalesce(rules ->> 'gameMode', '') <> 'record' group by 1) s
      ),
      'by_payment', (
        select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
        from (select coalesce(rules ->> 'payment',
                              case when handicap_settle = 'pre' then 'cash' else 'transfer' end) as k,
                     count(*) as n
              from r where coalesce(rules ->> 'gameMode', '') <> 'record' group by 1) s
      ),
      'avg_players', (select coalesce(round(avg(n)::numeric, 1), 0) from pc),
      'units', (
        select coalesce(jsonb_agg(jsonb_build_object('unit', unit, 'count', n)
                                  order by n desc, unit), '[]'::jsonb)
        -- 기록 모드(내기 없음, 금액 0)는 핸디캡·지불 방법·금액 집계에서 뺀다
        from (select unit, count(*) as n from r
              where coalesce(rules ->> 'gameMode', '') <> 'record'
              group by unit order by n desc, unit limit 5) s
      ),
      'daily', (
        select jsonb_agg(jsonb_build_object('day', d.day, 'count',
                 (select count(*) from r where r.day = d.day)) order by d.day)
        from days d
      ),
      'weekly', (
        select jsonb_agg(jsonb_build_object('week', w.wk, 'count',
                 (select count(*) from r where r.day >= w.wk and r.day < w.wk + 7)) order by w.wk)
        from weeks w
      )
    ),
    'activity', jsonb_build_object(
      'edited_rounds', (select count(*) from r where edits > 0),
      'edits', (select coalesce(sum(edits), 0) from r),
      'players7', (
        select count(distinct rp.user_uid)
        from public.round_players rp
        join r on r.id = rp.round_id
        where r.day > today - 7
      )
    )
  ) into result;

  return result;
end $$;

-- ============ 최근 라운드 (관리자만) ============
create or replace function public.admin_recent_rounds(p_limit int default 30)
returns table (
  id uuid,
  course_name text,
  date text,
  tee_time text,
  status text,
  game_mode text,
  handicap_mode text,
  unit int,
  hole_count int,
  player_count int,
  host_name text,
  edit_count int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.course_name,
    r.date,
    r.tee_time,
    r.status,
    coalesce(r.rules ->> 'gameMode', 'stroke'),
    coalesce(r.rules ->> 'handicapMode', 'avg'),
    r.unit,
    r.hole_count,
    (select count(*)::int from public.round_players rp where rp.round_id = r.id),
    coalesce(
      r.rules -> 'nameOverrides' ->> r.host_uid::text,
      (select rp.name from public.round_players rp
        where rp.round_id = r.id and rp.user_uid = r.host_uid),
      ''
    ),
    coalesce(jsonb_array_length(case when jsonb_typeof(r.rules -> 'editLog') = 'array'
                                     then r.rules -> 'editLog' end), 0),
    r.created_at
  from public.rounds r
  where public.is_admin()
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- ============ 최근 가입자 (관리자만, 이메일은 앞 2글자만) ============
-- name: 카카오·구글 이름(닉네임), real_name: 앱에서 정한 이름(실명, 처음 로그인할 때 입력. 없으면 null)
-- (돌려주는 칸이 바뀌어 예전 함수를 지우고 다시 만든다)
drop function if exists public.admin_recent_users(int);
create or replace function public.admin_recent_users(p_limit int default 30)
returns table (
  user_id uuid,
  name text,
  real_name text,
  email_masked text,
  providers text[],
  created_at timestamptz,
  last_sign_in_at timestamptz,
  round_count int
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    u.id,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
    nullif(trim(u.raw_user_meta_data ->> 'mg_name'), ''),
    case
      when coalesce(u.email, '') = '' then null
      else left(split_part(u.email, '@', 1), 2) || '***@' || split_part(u.email, '@', 2)
    end,
    array(select jsonb_array_elements_text(coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb))),
    u.created_at,
    u.last_sign_in_at,
    (select count(*)::int from public.round_players rp where rp.user_uid = u.id)
  from auth.users u
  where public.is_admin() and not coalesce(u.is_anonymous, false)
  order by u.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- ============ 다른 사용자들의 라운드 (관리자만, 홈의 '사용자' 보기) ============
-- active: 대기·진행 중이고 라운드 날짜(없으면 만든 날)가 어제 이후인 라운드 (진행 중 먼저, 날짜·티오프 순)
-- recent: 끝난 라운드 최근 p_recent 개 (최근 날짜 순)
-- 관리자가 참여한 라운드는 뺀다 (본인 보기에 있다). 이름 옆 타수를 보여 주려고 홀·스코어도 함께 준다
drop function if exists public.admin_active_rounds();
create or replace function public.admin_user_rounds(p_recent int default 10)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with others as (
    select
      r.*,
      coalesce(nullif(r.date, ''), to_char(r.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD')) as day
    from public.rounds r
    where public.is_admin()
      and not exists (
        select 1 from public.round_players me
        where me.round_id = r.id and me.user_uid = auth.uid())
  ),
  picked as (
    (select o.*, 'active' as part from others o
      where o.status in ('lobby', 'playing')
        and o.day >= to_char((now() at time zone 'Asia/Seoul') - interval '1 day', 'YYYY-MM-DD')
      order by o.status = 'playing' desc, o.created_at desc
      limit 50)
    union all
    (select o.*, 'recent' as part from others o
      where o.status = 'done'
      order by o.day desc, o.created_at desc
      limit least(greatest(coalesce(p_recent, 10), 1), 50))
  ),
  built as (
    select
      p.part, p.status, p.day, p.tee_time, p.created_at,
      jsonb_build_object(
        'id', p.id, 'join_code', p.join_code, 'host_uid', p.host_uid,
        'course_name', p.course_name, 'course_tee', p.course_tee, 'date', p.date, 'tee_time', p.tee_time,
        'unit', p.unit, 'rules', p.rules, 'handicap_settle', p.handicap_settle, 'hole_count', p.hole_count,
        'status', p.status, 'created_at', p.created_at, 'updated_at', p.updated_at,
        'round_players', coalesce((
          select jsonb_agg(jsonb_build_object('user_uid', rp.user_uid, 'name', rp.name, 'seat_order', rp.seat_order))
          from public.round_players rp where rp.round_id = p.id), '[]'::jsonb),
        -- 저장 칸(saved_at)은 holesave.sql 을 실행한 DB 에만 있어서 행 전체(to_jsonb)에서 꺼낸다
        'holes', coalesce((
          select jsonb_agg(jsonb_build_object('hole_index', h.hole_index, 'par', h.par, 'saved_at', to_jsonb(h) -> 'saved_at'))
          from public.round_holes h where h.round_id = p.id), '[]'::jsonb),
        'scores', coalesce((
          select jsonb_agg(jsonb_build_object('hole_index', sc.hole_index, 'player_uid', sc.player_uid, 'rel', sc.rel))
          from public.round_scores sc where sc.round_id = p.id), '[]'::jsonb)
      ) as v
    from picked p
  )
  select jsonb_build_object(
    'active', coalesce((
      select jsonb_agg(v order by status = 'playing' desc, day, tee_time)
      from built where part = 'active'), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(v order by day desc, created_at desc)
      from built where part = 'recent'), '[]'::jsonb)
  );
$$;

-- ============ 사용자 실명 고치기 (관리자만) ============
-- 앱에서 쓰는 이름(user_metadata.mg_name)을 바꾼다. 빈 값이면 지워서 다음 로그인 때 다시 묻는다.
-- 그 사람 앱에는 로그인이 갱신될 때(길어야 1시간) 반영되고, 랭킹은 바로 이 이름을 쓴다
create or replace function public.admin_set_user_name(p_user_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v text := trim(coalesce(p_name, ''));
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  if char_length(v) > 20 then
    raise exception 'NAME_TOO_LONG' using errcode = '22023';
  end if;
  update auth.users
    set raw_user_meta_data = case
      when v = '' then coalesce(raw_user_meta_data, '{}'::jsonb) - 'mg_name'
      else coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('mg_name', v)
    end
    where id = p_user_id;
  if not found then
    raise exception 'NO_USER' using errcode = 'P0002';
  end if;
end $$;

-- 로그인한 사용자만 호출할 수 있다 (관리자가 아니면 통계는 오류, 목록은 빈 결과)
revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_stats() from public, anon;
revoke all on function public.admin_recent_rounds(int) from public, anon;
revoke all on function public.admin_recent_users(int) from public, anon;
revoke all on function public.admin_user_rounds(int) from public, anon;
revoke all on function public.admin_set_user_name(uuid, text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_recent_rounds(int) to authenticated;
grant execute on function public.admin_recent_users(int) to authenticated;
grant execute on function public.admin_user_rounds(int) to authenticated;
grant execute on function public.admin_set_user_name(uuid, text) to authenticated;
