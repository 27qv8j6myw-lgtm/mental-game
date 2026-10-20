-- 멘탈게임 · Supabase 스키마 (멀티플레이어 라운드)
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요. (여러 번 실행해도 안전)
-- 관리자 대시보드는 admin.sql 에 따로 있습니다.

-- ============ 테이블 ============
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  join_code text not null,
  host_uid uuid not null references auth.users (id) on delete cascade,
  course_name text not null default '',
  course_tee text not null default '',
  date text not null default '',
  tee_time text not null default '',
  unit int not null default 1000,
  rules jsonb not null default '{"parPenalty":true,"tie":false,"birdieDouble":false}'::jsonb,
  handicap_settle text not null default 'post',
  hole_count int not null default 18,
  status text not null default 'lobby', -- lobby | playing | done
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.round_players (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  user_uid uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  gender text not null default 'male',
  avg_score int,
  handicap int not null default 0,
  seat_order int not null default 0,
  photo_url text,
  is_guest boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (round_id, user_uid)
);
create index if not exists round_players_round_idx on public.round_players (round_id);

-- 입장 코드: 4자리 숫자. 진행 중(lobby/playing)인 라운드끼리만 중복 방지(종료된 라운드는 코드 재사용 가능)
alter table public.rounds drop constraint if exists rounds_join_code_key;
create unique index if not exists rounds_active_code_idx
  on public.rounds (join_code) where status <> 'done';

-- 기존 배포 DB 대상 컬럼 추가/변경 (여러 번 실행해도 안전)
alter table public.round_players add column if not exists photo_url text;
alter table public.round_players add column if not exists is_guest boolean not null default false;
-- 계좌이체 라운드에서 받을 계좌 (같은 라운드 참여자에게만 보임: rp_select RLS)
alter table public.round_players add column if not exists bank_name text;
alter table public.round_players add column if not exists bank_account text;
-- 평균 타수는 빈칸(미입력) 허용
alter table public.round_players alter column avg_score drop not null;
alter table public.round_players alter column avg_score drop default;

create table if not exists public.round_holes (
  round_id uuid not null references public.rounds (id) on delete cascade,
  hole_index int not null,
  par int not null default 4,
  primary key (round_id, hole_index)
);

create table if not exists public.round_scores (
  round_id uuid not null references public.rounds (id) on delete cascade,
  hole_index int not null,
  player_uid uuid not null,
  rel int not null,
  primary key (round_id, hole_index, player_uid)
);
create index if not exists round_scores_round_idx on public.round_scores (round_id);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists rounds_set_updated_at on public.rounds;
create trigger rounds_set_updated_at
  before update on public.rounds
  for each row execute function public.set_updated_at();

-- ============ 멤버십 헬퍼 (RLS 재귀 방지: SECURITY DEFINER) ============
create or replace function public.is_round_member(rid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.round_players rp
    where rp.round_id = rid and rp.user_uid = auth.uid()
  ) or exists (
    select 1 from public.rounds r
    where r.id = rid and r.host_uid = auth.uid()
  );
$$;

-- ============ RLS ============
alter table public.rounds enable row level security;
alter table public.round_players enable row level security;
alter table public.round_holes enable row level security;
alter table public.round_scores enable row level security;

drop policy if exists rounds_select on public.rounds;
create policy rounds_select on public.rounds
  for select using (host_uid = auth.uid() or public.is_round_member(id));

drop policy if exists rounds_insert on public.rounds;
create policy rounds_insert on public.rounds
  for insert with check (host_uid = auth.uid());

drop policy if exists rounds_update on public.rounds;
create policy rounds_update on public.rounds
  for update using (host_uid = auth.uid()) with check (host_uid = auth.uid());

drop policy if exists rounds_delete on public.rounds;
create policy rounds_delete on public.rounds
  for delete using (host_uid = auth.uid());

drop policy if exists rp_select on public.round_players;
create policy rp_select on public.round_players
  for select using (public.is_round_member(round_id));

drop policy if exists rp_insert on public.round_players;
create policy rp_insert on public.round_players
  for insert with check (user_uid = auth.uid());

drop policy if exists rp_update on public.round_players;
create policy rp_update on public.round_players
  for update using (user_uid = auth.uid()) with check (user_uid = auth.uid());

drop policy if exists rp_delete on public.round_players;
create policy rp_delete on public.round_players
  for delete using (user_uid = auth.uid());

drop policy if exists rh_all on public.round_holes;
create policy rh_all on public.round_holes
  for all using (public.is_round_member(round_id))
  with check (public.is_round_member(round_id));

drop policy if exists rs_all on public.round_scores;
create policy rs_all on public.round_scores
  for all using (public.is_round_member(round_id))
  with check (public.is_round_member(round_id));

-- ============ RPC ============
-- 고유 4자리 숫자 코드 생성 (진행 중 라운드 기준 중복 회피)
create or replace function public.gen_join_code()
returns text language plpgsql as $$
declare
  code text;
begin
  loop
    code := lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when not exists (
      select 1 from public.rounds where join_code = code and status <> 'done'
    );
  end loop;
  return code;
end $$;

create or replace function public.create_round(
  p_course_name text,
  p_course_tee text,
  p_date text,
  p_tee_time text,
  p_unit int,
  p_rules jsonb,
  p_handicap_settle text,
  p_hole_count int,
  p_name text,
  p_gender text,
  p_avg_score int,
  p_handicap int
)
returns public.rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  new_round public.rounds;
begin
  insert into public.rounds (
    join_code, host_uid, course_name, course_tee, date, tee_time,
    unit, rules, handicap_settle, hole_count, status
  ) values (
    public.gen_join_code(), auth.uid(), p_course_name, p_course_tee, p_date, p_tee_time,
    p_unit, coalesce(p_rules, '{"parPenalty":true,"tie":false,"birdieDouble":false}'::jsonb),
    coalesce(p_handicap_settle, 'post'), coalesce(p_hole_count, 18), 'lobby'
  )
  returning * into new_round;

  insert into public.round_players (round_id, user_uid, name, gender, avg_score, handicap, seat_order)
  values (new_round.id, auth.uid(), p_name, coalesce(p_gender,'male'),
          p_avg_score, coalesce(p_handicap,0), 0);

  return new_round;
end $$;

create or replace function public.join_round(
  p_code text,
  p_name text,
  p_gender text,
  p_avg_score int,
  p_handicap int
)
returns public.rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.rounds;
  next_seat int;
begin
  select * into target from public.rounds
    where join_code = upper(p_code) and status = 'lobby'
    limit 1;
  if target.id is null then
    raise exception 'ROUND_NOT_FOUND';
  end if;

  select coalesce(max(seat_order) + 1, 0) into next_seat
    from public.round_players where round_id = target.id;

  insert into public.round_players (round_id, user_uid, name, gender, avg_score, handicap, seat_order)
  values (target.id, auth.uid(), p_name, coalesce(p_gender,'male'),
          p_avg_score, coalesce(p_handicap,0), next_seat)
  on conflict (round_id, user_uid) do nothing;

  return target;
end $$;

create or replace function public.set_round_status(p_round_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rounds set status = p_status
    where id = p_round_id and host_uid = auth.uid();
end $$;

-- ============ Realtime ============
-- 이미 publication 에 포함돼 있으면 건너뛴다 (여러 번 실행해도 안전)
do $$
declare
  t text;
begin
  foreach t in array array['rounds','round_players','round_holes','round_scores']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
