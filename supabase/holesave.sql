-- ============ 홀마다 저장 (타당·스킨스) ============
-- 스코어는 지금처럼 함께 입력하되(저장 전), 홀마다 '저장'을 눌러야 확정되고 정산에 들어간다.
-- 저장된 홀은 잠기고, save_hole 로만 고칠 수 있다(라운드 중엔 참여자 누구나, 종료 후엔 방장만).
-- 저장된 홀을 고치면 rules.editLog 에 수정 내역이 남는다.
-- Supabase 대시보드 > SQL Editor 에서 schema.sql 다음에 실행. 여러 번 실행해도 안전하다.

alter table public.round_holes add column if not exists saved_at timestamptz;
alter table public.round_holes add column if not exists saved_by uuid;
-- 저장할 때마다 1씩 오른다. 두 사람이 같은 홀을 동시에 저장·수정하면 늦은 쪽을 거부하는 데 쓴다
alter table public.round_holes add column if not exists version int not null default 0;
-- schema.sql 에서 이미 켜 둔 것 (SQL Editor 의 RLS 경고가 뜨지 않게 다시 적어 둔다. 여러 번 실행해도 같다)
alter table public.round_holes enable row level security;

-- ---- 저장된 홀 보호 ----
-- 홀 저장 방식(rules.holeSave) 라운드에서 저장된 홀이나 종료된 라운드의 스코어·파는
-- save_hole 밖에서 바꿀 수 없다. 오프라인에 쌓였다 늦게 올라온 입력이 저장된 값을 덮지 못하게 한다.
-- 저장 표시(saved_at·version)도 save_hole 만 바꾼다.
create or replace function public.guard_saved_hole()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  hidx int;
  r record;
begin
  if current_setting('app.hole_save', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    rid := old.round_id;
    hidx := old.hole_index;
  else
    rid := new.round_id;
    hidx := new.hole_index;
  end if;

  select status, rules into r from public.rounds where id = rid;
  -- 라운드가 지워지며 함께 지워지는 경우, 예전 방식 라운드는 그대로
  if not found or coalesce((r.rules ->> 'holeSave')::boolean, false) is not true then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if r.status = 'done' then
    raise exception 'ROUND_DONE' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.round_holes
    where round_id = rid and hole_index = hidx and saved_at is not null
  ) then
    raise exception 'HOLE_SAVED' using errcode = '42501';
  end if;
  -- (round_scores 에는 이 칸이 없어서 조건을 나눠 쓴다)
  if tg_table_name = 'round_holes' and tg_op <> 'DELETE' then
    if new.saved_at is not null or new.saved_by is not null or new.version <> 0 then
      raise exception 'HOLE_SAVE_ONLY' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists round_scores_guard_saved on public.round_scores;
create trigger round_scores_guard_saved
  before insert or update or delete on public.round_scores
  for each row execute function public.guard_saved_hole();

drop trigger if exists round_holes_guard_saved on public.round_holes;
create trigger round_holes_guard_saved
  before insert or update or delete on public.round_holes
  for each row execute function public.guard_saved_hole();

-- ---- 홀 저장 ----
-- 파와 모든 참여자 스코어를 한 번에 저장하고 홀을 잠근다.
-- p_base_version: 화면에서 보고 있던 홀의 version (처음 저장이면 0). 다르면 HOLE_CONFLICT
-- p_items: 이미 저장된 홀을 고칠 때 수정 내역 문장 ("3번 홀 박영수: 5타(+1) → 4타(E)")
-- 돌려주는 값: 새 version
create or replace function public.save_hole(
  p_round_id uuid,
  p_hole int,
  p_par int,
  p_scores jsonb,
  p_base_version int,
  p_items text[] default '{}'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rounds%rowtype;
  h public.round_holes%rowtype;
  me uuid := auth.uid();
  p record;
  v jsonb;
  was_saved boolean;
  who text;
  next_rules jsonb;
begin
  -- 라운드 행을 잠가 같은 라운드의 저장·수정 내역 추가를 한 줄로 세운다
  select * into r from public.rounds where id = p_round_id for update;
  if not found or me is null or not public.is_round_member(p_round_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if r.rules ->> 'gameMode' = 'record' or r.status = 'lobby' then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if r.status = 'done' and r.host_uid <> me then
    raise exception 'HOST_ONLY' using errcode = '42501';
  end if;
  if p_hole is null or p_hole < 0 or p_hole >= r.hole_count or p_par not in (3, 4, 5) then
    raise exception 'BAD_HOLE' using errcode = '22023';
  end if;

  -- 모든 참여자 스코어가 있어야 한다 (홀인원 ~ 더블파)
  for p in select user_uid from public.round_players where round_id = p_round_id loop
    v := p_scores -> p.user_uid::text;
    if v is null or jsonb_typeof(v) <> 'number' then
      raise exception 'HOLE_INCOMPLETE' using errcode = '22023';
    end if;
    if (v #>> '{}')::numeric not between 1 - p_par and p_par
       or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then
      raise exception 'BAD_SCORE' using errcode = '22023';
    end if;
  end loop;

  perform set_config('app.hole_save', 'on', true);

  insert into public.round_holes (round_id, hole_index, par)
    values (p_round_id, p_hole, p_par)
    on conflict (round_id, hole_index) do nothing;
  select * into h from public.round_holes
    where round_id = p_round_id and hole_index = p_hole
    for update;
  if h.version <> coalesce(p_base_version, 0) then
    raise exception 'HOLE_CONFLICT' using errcode = 'P0001';
  end if;
  -- 종료된 라운드에서 고치는 것(방장)도 수정으로 본다
  was_saved := h.saved_at is not null or r.status = 'done';

  update public.round_holes
    set par = p_par, saved_at = now(), saved_by = me, version = h.version + 1
    where round_id = p_round_id and hole_index = p_hole;

  insert into public.round_scores (round_id, hole_index, player_uid, rel)
    select p_round_id, p_hole, rp.user_uid, (p_scores ->> rp.user_uid::text)::int
    from public.round_players rp
    where rp.round_id = p_round_id
    on conflict (round_id, hole_index, player_uid) do update set rel = excluded.rel;

  next_rules := r.rules;
  -- 예전 앱이 만든 진행 중 라운드도 처음 저장하는 순간부터 홀 저장 방식으로
  if coalesce((r.rules ->> 'holeSave')::boolean, false) is not true and r.status <> 'done' then
    next_rules := next_rules || '{"holeSave": true}'::jsonb;
  end if;
  if was_saved and coalesce(array_length(p_items, 1), 0) > 0 then
    who := coalesce(
      nullif(r.rules -> 'nameOverrides' ->> me::text, ''),
      nullif((select name from public.round_players where round_id = p_round_id and user_uid = me), ''),
      '방장'
    );
    next_rules := jsonb_set(
      next_rules,
      '{editLog}',
      coalesce(next_rules -> 'editLog', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('at', now(), 'by', who, 'items', to_jsonb(p_items)))
    );
  end if;
  if next_rules is distinct from r.rules then
    update public.rounds set rules = next_rules where id = p_round_id;
  end if;

  perform set_config('app.hole_save', 'off', true);
  return h.version + 1;
end $$;

revoke all on function public.save_hole(uuid, int, int, jsonb, int, text[]) from public, anon;
grant execute on function public.save_hole(uuid, int, int, jsonb, int, text[]) to authenticated;

-- ---- 지금 있는 라운드 옮기기 (한 번만) ----
-- 대기·진행 중인 내기 라운드를 홀 저장 방식으로 바꾸고,
-- 진행 중 라운드는 모든 참여자 스코어가 들어간 홀을 저장된 것으로 본다.
-- 이미 holeSave 인 라운드는 건드리지 않아서 다시 실행해도 진행 중인 홀이 저장되지 않는다
select set_config('app.hole_save', 'on', false);
with up as (
  update public.rounds
    set rules = rules || '{"holeSave": true}'::jsonb
    where status in ('lobby', 'playing')
      and coalesce(rules ->> 'gameMode', 'stroke') <> 'record'
      and coalesce((rules ->> 'holeSave')::boolean, false) is not true
    returning id, status, hole_count
), full_holes as (
  select s.round_id, s.hole_index
  from public.round_scores s
  join up on up.id = s.round_id and up.status = 'playing' and s.hole_index < up.hole_count
  group by s.round_id, s.hole_index
  having count(*) >= (select count(*) from public.round_players rp where rp.round_id = s.round_id)
)
insert into public.round_holes (round_id, hole_index, par, saved_at, version)
  select round_id, hole_index, 4, now(), 1 from full_holes
  on conflict (round_id, hole_index) do update
    set saved_at = coalesce(public.round_holes.saved_at, now()),
        version = greatest(public.round_holes.version, 1);
select set_config('app.hole_save', 'off', false);
