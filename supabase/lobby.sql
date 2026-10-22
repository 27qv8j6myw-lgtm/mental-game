-- ============ 대기실: 내보내기 · 폰 없는 동반자 ============
-- 방장이 대기실에서 잘못 들어온 사람을 내보내고, 폰이 없는(앱을 못 쓰는) 동반자를 이름만으로 넣는다.
-- 폰 없는 동반자의 스코어는 다른 사람이 대신 입력한다 (내기 라운드는 원래 누구나 모두의 스코어를 넣는다).
-- Supabase 대시보드 > SQL Editor 에서 schema.sql 다음에 실행. 여러 번 실행해도 안전하다.
-- 파일 전체를 붙여 넣고(일부만 선택하지 말고) 실행한다. 함수마다 권한 설정이 바로 뒤에 붙어 있다.

-- 폰 없는 동반자: 로그인 계정이 없어서 계정 연결(외래 키)을 풀고, 표시 칸을 둔다
alter table public.round_players drop constraint if exists round_players_user_uid_fkey;
alter table public.round_players add column if not exists offline_player boolean not null default false;
-- (SQL Editor 의 RLS 경고가 뜨지 않게 다시 적어 둔다. schema.sql 에서 이미 켠 것)
alter table public.round_players enable row level security;

-- ---- 내보내기 (방장, 대기 중일 때만) ----
create or replace function public.kick_player(p_round_id uuid, p_user_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rounds%rowtype;
begin
  select * into r from public.rounds where id = p_round_id for update;
  if not found or r.host_uid <> auth.uid() then
    raise exception 'HOST_ONLY' using errcode = '42501';
  end if;
  if r.status <> 'lobby' then
    raise exception 'NOT_LOBBY' using errcode = '42501';
  end if;
  if p_user_uid = r.host_uid then
    raise exception 'CANNOT_KICK_HOST' using errcode = '22023';
  end if;
  delete from public.round_players where round_id = p_round_id and user_uid = p_user_uid;
  -- 그 사람에게 걸어 둔 설정(이름·핸디 덮어쓰기 등)도 지운다
  update public.rounds
    set rules = rules
      #- array['nameOverrides', p_user_uid::text]
      #- array['hcOverrides', p_user_uid::text]
      #- array['avgOverrides', p_user_uid::text]
      #- array['strokeAdj', p_user_uid::text]
      || case when rules ->> 'baseUid' = p_user_uid::text then '{"baseUid": null}'::jsonb else '{}'::jsonb end
    where id = p_round_id;
end $$;
revoke all on function public.kick_player(uuid, uuid) from public, anon;
grant execute on function public.kick_player(uuid, uuid) to authenticated;

-- ---- 폰 없는 동반자 넣기 (방장, 대기 중, 내기 라운드만) ----
create or replace function public.add_offline_player(
  p_round_id uuid,
  p_name text,
  p_gender text,
  p_avg_score int,
  p_handicap int
)
returns public.round_players
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rounds%rowtype;
  next_seat int;
  new_row public.round_players;
begin
  select * into r from public.rounds where id = p_round_id for update;
  if not found or r.host_uid <> auth.uid() then
    raise exception 'HOST_ONLY' using errcode = '42501';
  end if;
  if r.status <> 'lobby' or r.rules ->> 'gameMode' = 'record' then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'NAME_REQUIRED' using errcode = '22023';
  end if;
  select coalesce(max(seat_order) + 1, 0) into next_seat
    from public.round_players where round_id = p_round_id;
  insert into public.round_players
    (round_id, user_uid, name, gender, avg_score, handicap, seat_order, offline_player)
  values
    (p_round_id, gen_random_uuid(), trim(p_name), coalesce(p_gender, 'male'),
     p_avg_score, greatest(0, coalesce(p_handicap, 0)), next_seat, true)
  returning * into new_row;
  return new_row;
end $$;
revoke all on function public.add_offline_player(uuid, text, text, int, int) from public, anon;
grant execute on function public.add_offline_player(uuid, text, text, int, int) to authenticated;

-- ---- 사람별 티 박스 ----
-- 남녀 혼성이면 티가 다르다 (여성은 레드 티 등). 비어 있으면 라운드 티 박스.
-- 각자 대기실에서 자기 행을 고치고(rp_update), 폰 없는 동반자는 방장이 아래 함수로 고친다
alter table public.round_players add column if not exists tee text;
alter table public.round_players drop constraint if exists round_players_tee_check;
alter table public.round_players add constraint round_players_tee_check
  check (tee is null or tee in ('red', 'senior', 'white', 'blue', 'black'));

-- ---- 폰 없는 동반자 정보 고치기 (방장, 대기 중) ----
-- 값이 null 이면 그 칸은 그대로 둔다 (평균 타수를 지우려면 p_clear_avg, 티를 라운드 티로 되돌리려면 p_clear_tee)
-- 티 칸을 더하면서 예전 함수(7칸)를 지운다 (둘 다 있으면 앱이 어느 쪽을 부를지 몰라 오류가 난다)
drop function if exists public.update_offline_player(uuid, uuid, text, text, int, int, boolean);
create or replace function public.update_offline_player(
  p_round_id uuid,
  p_user_uid uuid,
  p_name text default null,
  p_gender text default null,
  p_avg_score int default null,
  p_handicap int default null,
  p_clear_avg boolean default false,
  p_tee text default null,
  p_clear_tee boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rounds%rowtype;
begin
  select * into r from public.rounds where id = p_round_id;
  if not found or r.host_uid <> auth.uid() then
    raise exception 'HOST_ONLY' using errcode = '42501';
  end if;
  if r.status <> 'lobby' then
    raise exception 'NOT_LOBBY' using errcode = '42501';
  end if;
  update public.round_players
    set name = coalesce(nullif(trim(p_name), ''), name),
        gender = coalesce(p_gender, gender),
        avg_score = case when p_clear_avg then null else coalesce(p_avg_score, avg_score) end,
        -- (greatest 는 null 을 건너뛰어 0 이 되므로 null 이면 그대로)
        handicap = case when p_handicap is null then handicap else greatest(0, p_handicap) end,
        tee = case when p_clear_tee then null else coalesce(p_tee, tee) end
    where round_id = p_round_id and user_uid = p_user_uid and offline_player;
end $$;
revoke all on function public.update_offline_player(uuid, uuid, text, text, int, int, boolean, text, boolean) from public, anon;
grant execute on function public.update_offline_player(uuid, uuid, text, text, int, int, boolean, text, boolean) to authenticated;
