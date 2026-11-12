-- ============ 애플워치로 기록 (기록 모드) ============
-- 폰 앱(웹)이 기록 모드 라운드를 열면 watch_link 로 '그 라운드의 내 기록만 쓰는 24시간 열쇠'를 받아 워치에 넘긴다.
-- 워치는 로그인 없이 이 열쇠로 watch_state(홀·파·내 기록 읽기)·watch_save(타수·퍼트·티샷·OB·해저드·샌드샷 저장)·
-- watch_finish(마지막 홀에서 라운드 종료, 방장만)만 부른다.
-- 폰의 기록 모드와 같은 칸만 쓴다: 티샷은 fairway·lie (파3 은 폰처럼 티샷 칸이 없다), 디테일 기록(detail)은 건드리지 않는다.
-- 열쇠는 해시만 보관한다. 폰 로그인 토큰은 워치에 넘기지 않는다 (src/watch.ts, ios/MentalGameWatch).
-- Supabase 대시보드 > SQL Editor 에서 실행. 여러 번 실행해도 안전하다. (pgcrypto 는 extensions 스키마)

create table if not exists public.watch_links (
  -- 열쇠의 sha256 (열쇠 자체는 저장하지 않는다)
  token_hash text primary key,
  user_uid uuid not null references auth.users (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists watch_links_user_idx on public.watch_links (user_uid);

-- 정책 없음: 아래 함수만 읽고 쓴다
alter table public.watch_links enable row level security;
revoke all on public.watch_links from anon, authenticated;

-- 열쇠 확인 (기간이 지났거나 없으면 오류)
create or replace function public.watch_link_of(p_token text)
returns public.watch_links
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  l public.watch_links;
begin
  select * into l from public.watch_links
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and expires_at > now();
  if l.token_hash is null then
    raise exception 'invalid watch token' using errcode = '28000';
  end if;
  return l;
end $$;
revoke all on function public.watch_link_of(text) from public, anon, authenticated;

-- 홀 하나의 내 기록. 티샷 방향·결과는 fairway·lie (폰 기록 모드와 같은 칸).
-- shotLies 는 디테일 기록의 샷마다 고른 벙커·OB·해저드 (워치가 카운트를 그 아래로 내리지 않게, 폰의 lieFloor 와 같다)
create or replace function public.watch_hole(p_round uuid, p_uid uuid, p_hole int)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'i', p_hole,
    'par', coalesce(h.par, 4),
    'rel', s.rel,
    'putts', st.putts,
    'dir', st.fairway,
    'lie', st.lie,
    'ob', coalesce(st.ob, 0),
    'hazard', coalesce(st.hazard, 0),
    'sand', coalesce(st.sand, 0),
    'shotLies', coalesce((
      select jsonb_agg(x.v ->> 'lie')
      from jsonb_array_elements(coalesce(st.detail -> 'shots', '[]'::jsonb)) as x(v)
      where x.v ->> 'lie' in ('bunker', 'ob', 'hazard')
    ), '[]'::jsonb)
  )
  from (select 1) one
  left join public.round_holes h on h.round_id = p_round and h.hole_index = p_hole
  left join public.round_scores s on s.round_id = p_round and s.hole_index = p_hole and s.player_uid = p_uid
  left join public.round_hole_stats st on st.round_id = p_round and st.hole_index = p_hole and st.player_uid = p_uid
$$;
revoke all on function public.watch_hole(uuid, uuid, int) from public, anon, authenticated;

-- 폰(로그인한 사람): 기록 모드 라운드의 워치 열쇠를 만든다
create or replace function public.watch_link(p_round_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.rounds;
  tok text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select * into r from public.rounds where id = p_round_id;
  if r.id is null or coalesce(r.rules ->> 'gameMode', '') <> 'record' or r.status = 'lobby' then
    raise exception 'not a record round' using errcode = '22023';
  end if;
  if not exists (select 1 from public.round_players where round_id = p_round_id and user_uid = uid) then
    raise exception 'not a player' using errcode = '42501';
  end if;
  -- 기간이 지난 열쇠와, 이 사람의 오래된 열쇠(최근 5개만 남긴다)를 지운다
  delete from public.watch_links where expires_at <= now();
  delete from public.watch_links
  where user_uid = uid
    and token_hash not in (
      select token_hash from public.watch_links where user_uid = uid order by created_at desc limit 4
    );
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.watch_links (token_hash, user_uid, round_id, expires_at)
  values (encode(extensions.digest(tok, 'sha256'), 'hex'), uid, p_round_id, now() + interval '24 hours');
  return tok;
end $$;
revoke all on function public.watch_link(uuid) from public, anon;
grant execute on function public.watch_link(uuid) to authenticated;

-- 워치: 라운드와 홀마다 파·내 기록
create or replace function public.watch_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  l public.watch_links := public.watch_link_of(p_token);
  r public.rounds;
begin
  select * into r from public.rounds where id = l.round_id;
  return jsonb_build_object(
    'roundId', r.id,
    'course', r.course_name,
    'date', r.date,
    'status', r.status,
    'holeCount', r.hole_count,
    'expiresAt', l.expires_at,
    'holes', (
      select coalesce(jsonb_agg(public.watch_hole(r.id, l.user_uid, g.i) order by g.i), '[]'::jsonb)
      from generate_series(0, r.hole_count - 1) as g(i)
    )
  );
end $$;
revoke all on function public.watch_state(text) from public;
grant execute on function public.watch_state(text) to anon, authenticated;

-- 워치: 한 홀의 파·타수·퍼트·티샷(방향·벙커/OB/해저드)·OB·해저드·샌드샷 저장 (디테일 기록은 그대로 둔다).
-- 파3 이면 워치에 티샷 칸이 없어 이미 있던 fairway·lie 를 그대로 보낸다 (폰처럼 파를 바꿔도 값은 남는다)
-- 앞서 만든 서명(티샷 방향까지)이 있으면 지운다
drop function if exists public.watch_save(text, int, int, int, int, text);
create or replace function public.watch_save(
  p_token text,
  p_hole int,
  p_par int,
  p_rel int,
  p_putts int,
  p_dir text,
  p_lie text,
  p_ob int,
  p_hazard int,
  p_sand int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.watch_links := public.watch_link_of(p_token);
  r public.rounds;
begin
  select * into r from public.rounds where id = l.round_id;
  if r.status <> 'playing' then
    raise exception 'round is not playing' using errcode = '22023';
  end if;
  if p_hole is null or p_hole < 0 or p_hole >= r.hole_count then
    raise exception 'bad hole' using errcode = '22023';
  end if;
  if p_par is null or p_par not in (3, 4, 5) then
    raise exception 'bad par' using errcode = '22023';
  end if;
  -- 타수는 1 ~ 더블파, 퍼트는 0~6 이면서 타수 이하
  if p_rel is not null and (p_rel < 1 - p_par or p_rel > p_par) then
    raise exception 'bad score' using errcode = '22023';
  end if;
  if p_putts is not null and (p_putts < 0 or p_putts > 6 or (p_rel is not null and p_putts > p_par + p_rel)) then
    raise exception 'bad putts' using errcode = '22023';
  end if;
  if p_dir is not null and p_dir not in ('left', 'hit', 'short', 'right') then
    raise exception 'bad tee shot' using errcode = '22023';
  end if;
  -- 페어웨이(온그린)에 떨어졌으면 벙커·OB·해저드일 수 없다 (폰과 같다)
  if p_lie is not null and (p_lie not in ('bunker', 'ob', 'hazard') or p_dir = 'hit') then
    raise exception 'bad tee lie' using errcode = '22023';
  end if;
  if coalesce(p_ob, -1) not between 0 and 9 or coalesce(p_hazard, -1) not between 0 and 9 or coalesce(p_sand, -1) not between 0 and 9 then
    raise exception 'bad counts' using errcode = '22023';
  end if;

  -- 파 (바뀌었을 때만. 라운드 모두의 파다)
  if coalesce((select par from public.round_holes where round_id = r.id and hole_index = p_hole), 4) <> p_par then
    insert into public.round_holes (round_id, hole_index, par) values (r.id, p_hole, p_par)
    on conflict (round_id, hole_index) do update set par = excluded.par;
  end if;

  -- 타수
  if p_rel is null then
    delete from public.round_scores where round_id = r.id and hole_index = p_hole and player_uid = l.user_uid;
  else
    insert into public.round_scores (round_id, hole_index, player_uid, rel) values (r.id, p_hole, l.user_uid, p_rel)
    on conflict (round_id, hole_index, player_uid) do update set rel = excluded.rel;
  end if;

  -- 퍼트·티샷·카운트 (디테일 기록은 그대로). 기록이 없던 홀에 넣을 것도 없으면 행을 만들지 않는다
  if p_putts is null and p_dir is null and p_lie is null and p_ob = 0 and p_hazard = 0 and p_sand = 0
     and not exists (
       select 1 from public.round_hole_stats
       where round_id = r.id and hole_index = p_hole and player_uid = l.user_uid
     ) then
    return public.watch_hole(r.id, l.user_uid, p_hole);
  end if;
  insert into public.round_hole_stats (round_id, hole_index, player_uid, putts, fairway, lie, ob, hazard, sand)
  values (r.id, p_hole, l.user_uid, p_putts, p_dir, p_lie, p_ob, p_hazard, p_sand)
  on conflict (round_id, hole_index, player_uid) do update
    set putts = excluded.putts, fairway = excluded.fairway, lie = excluded.lie,
        ob = excluded.ob, hazard = excluded.hazard, sand = excluded.sand;

  return public.watch_hole(r.id, l.user_uid, p_hole);
end $$;
revoke all on function public.watch_save(text, int, int, int, int, text, text, int, int, int) from public;
grant execute on function public.watch_save(text, int, int, int, int, text, text, int, int, int) to anon, authenticated;

-- 워치: 마지막 홀에서 라운드 종료 (폰의 종료처럼 방장만, 진행 중인 라운드만). 끝나면 워치의 골프 운동도 끝난다
create or replace function public.watch_finish(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.watch_links := public.watch_link_of(p_token);
  r public.rounds;
begin
  select * into r from public.rounds where id = l.round_id for update;
  if r.status <> 'playing' then
    raise exception 'round is not playing' using errcode = '22023';
  end if;
  if r.host_uid <> l.user_uid then
    raise exception 'host only' using errcode = '42501';
  end if;
  update public.rounds set status = 'done' where id = r.id;
  return jsonb_build_object('roundId', r.id, 'status', 'done');
end $$;
revoke all on function public.watch_finish(text) from public;
grant execute on function public.watch_finish(text) to anon, authenticated;
