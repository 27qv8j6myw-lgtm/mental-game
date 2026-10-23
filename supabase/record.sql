-- ============ 기록 모드: 홀별 상세 기록 ============
-- 기록 모드(내기 없음) 라운드에서 각자 입력하는 퍼트·티샷·벌타·샌드샷.
-- 스코어 자체는 기존 round_scores 를 그대로 쓴다.
-- 라운드 정보 중 참여자 누구나 넣는 값(그린스피드)도 여기서 연다 (맨 아래).
-- Supabase 대시보드 > SQL Editor 에서 실행. 여러 번 실행해도 안전하다.

create table if not exists public.round_hole_stats (
  round_id uuid not null references public.rounds (id) on delete cascade,
  hole_index int not null,
  player_uid uuid not null,
  -- 퍼트 수 (0~6). 입력 전이면 null
  putts int check (putts between 0 and 6),
  -- 티샷 방향 (파4·파5만): 훅(left)·적중(hit)·짧음(short)·슬라이스(right). 입력 전이면 null
  fairway text,
  -- 티샷 벙커·OB·해저드 (방향과 함께 고를 수 있다)
  lie text check (lie in ('bunker', 'ob', 'hazard', 'penalty')),
  ob int not null default 0 check (ob between 0 and 9),
  hazard int not null default 0 check (hazard between 0 and 9),
  sand int not null default 0 check (sand between 0 and 9),
  primary key (round_id, hole_index, player_uid)
);
-- 먼저 만든 표(티샷에 벙커·패널티가 방향과 한 칸이던 판)를 고친다. 처음 만드는 경우엔 아무 일도 없다
alter table public.round_hole_stats add column if not exists lie text check (lie in ('bunker', 'penalty'));
alter table public.round_hole_stats drop constraint if exists round_hole_stats_fairway_check;
update public.round_hole_stats set lie = fairway, fairway = null where fairway in ('bunker', 'penalty');
alter table public.round_hole_stats add constraint round_hole_stats_fairway_check
  check (fairway in ('left', 'hit', 'short', 'right'));
-- 티샷 패널티를 OB·해저드로 나눈다. 예전 'penalty' 는 그 홀 카운트가 더 많은 쪽으로 옮긴다 (같으면 OB).
-- 'penalty' 는 아직 예전 앱을 열어 둔 사람의 저장이 막히지 않게 남겨 둔다 (앱이 읽을 때 같은 규칙으로 바꾼다)
alter table public.round_hole_stats drop constraint if exists round_hole_stats_lie_check;
update public.round_hole_stats
  set lie = case when hazard > ob then 'hazard' else 'ob' end
  where lie = 'penalty';
alter table public.round_hole_stats add constraint round_hole_stats_lie_check
  check (lie in ('bunker', 'ob', 'hazard', 'penalty'));

create index if not exists round_hole_stats_round_idx on public.round_hole_stats (round_id);
create index if not exists round_hole_stats_player_idx on public.round_hole_stats (player_uid);

alter table public.round_hole_stats enable row level security;

-- 읽기: 라운드 참여자 누구나 / 쓰기: 본인 기록만
drop policy if exists rhs_select on public.round_hole_stats;
create policy rhs_select on public.round_hole_stats
  for select using (public.is_round_member(round_id));

drop policy if exists rhs_insert on public.round_hole_stats;
create policy rhs_insert on public.round_hole_stats
  for insert with check (player_uid = auth.uid() and public.is_round_member(round_id));

drop policy if exists rhs_update on public.round_hole_stats;
create policy rhs_update on public.round_hole_stats
  for update using (player_uid = auth.uid() and public.is_round_member(round_id))
  with check (player_uid = auth.uid() and public.is_round_member(round_id));

drop policy if exists rhs_delete on public.round_hole_stats;
create policy rhs_delete on public.round_hole_stats
  for delete using (player_uid = auth.uid() and public.is_round_member(round_id));

-- 실시간: 함께 기록하는 사람의 입력이 바로 보이게 (이미 있으면 건너뛴다)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'round_hole_stats'
  ) then
    alter publication supabase_realtime add table public.round_hole_stats;
  end if;
end $$;

-- ============ 그린스피드 (라운드에 한 값) ============
-- rules.greenSpeed (스팀프미터 m, 0.1 단위). 그 라운드를 친 사람(참여자·방장)이면 누구나 기록 화면에서 넣고 고친다.
-- rounds 는 방장만 고칠 수 있어서(rounds_update) 이 값만 함수로 연다. p_speed 가 null 이면 지운다
create or replace function public.set_round_green_speed(p_round_id uuid, p_speed numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if not public.is_round_member(p_round_id) then
    raise exception 'NOT_MEMBER' using errcode = '42501';
  end if;
  if p_speed is not null and (p_speed < 1.5 or p_speed > 4.5) then
    raise exception 'BAD_SPEED' using errcode = '22023';
  end if;
  update public.rounds
     set rules = case
       when p_speed is null then coalesce(rules, '{}'::jsonb) - 'greenSpeed'
       else jsonb_set(coalesce(rules, '{}'::jsonb), '{greenSpeed}', to_jsonb(round(p_speed, 1)))
     end
   where id = p_round_id;
end $$;

revoke all on function public.set_round_green_speed(uuid, numeric) from public, anon;
grant execute on function public.set_round_green_speed(uuid, numeric) to authenticated;
