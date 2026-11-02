-- ============ 중간에 끝낸 라운드: 입력 안 된 뒤쪽 홀 지우기 ============
-- 13홀에서 그만두면 14~18번 홀을 지우고 13홀 라운드로 남긴다 (rounds.hole_count = 13).
-- 원래 홀 수는 rules.plannedHoles 에 남겨 정산(캐디피 연습 홀·스킨스 후반·핸디 비율)은 지우기 전과 같게 계산한다.
-- 18홀을 다 치지 않았으니 평균 타수·베스트·랭킹(18홀 라운드만)에는 들어가지 않는다.
-- Supabase 대시보드 > SQL Editor 에서 holesave.sql·record.sql 다음에 실행. 여러 번 실행해도 안전하다.

-- p_keep: 남길 홀 수 (1 ~ 지금 홀 수 − 1). 지울 홀(p_keep 번째부터)에 남길 기록이 있으면 거부한다:
--   홀 저장 라운드는 저장된 홀, 기록 모드·예전 즉시 저장 라운드는 스코어
create or replace function public.trim_round_holes(p_round_id uuid, p_keep int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rounds%rowtype;
  me uuid := auth.uid();
  hole_save boolean;
  next_rules jsonb;
  who text;
begin
  select * into r from public.rounds where id = p_round_id for update;
  if not found or me is null or r.host_uid <> me then
    raise exception 'HOST_ONLY' using errcode = '42501';
  end if;
  if r.status not in ('playing', 'done') then
    raise exception 'NOT_STARTED' using errcode = '22023';
  end if;
  if p_keep is null or p_keep < 1 or p_keep >= r.hole_count then
    raise exception 'BAD_KEEP' using errcode = '22023';
  end if;

  -- 앱의 usesHoleSave 와 같다
  hole_save := coalesce(r.rules ->> 'gameMode', 'stroke') <> 'record'
    and (coalesce((r.rules ->> 'holeSave')::boolean, false) or r.status <> 'done');
  if hole_save and exists (
    select 1 from public.round_holes
    where round_id = p_round_id and hole_index >= p_keep and saved_at is not null
  ) then
    raise exception 'HOLE_SAVED' using errcode = '22023';
  end if;
  if not hole_save and exists (
    select 1 from public.round_scores where round_id = p_round_id and hole_index >= p_keep
  ) then
    raise exception 'HOLE_SCORED' using errcode = '22023';
  end if;

  -- 저장된 홀 보호 트리거(guard_saved_hole)를 이 함수 안에서만 끈다
  perform set_config('app.hole_save', 'on', true);
  delete from public.round_hole_stats where round_id = p_round_id and hole_index >= p_keep;
  delete from public.round_scores where round_id = p_round_id and hole_index >= p_keep;
  delete from public.round_holes where round_id = p_round_id and hole_index >= p_keep;
  perform set_config('app.hole_save', 'off', true);

  next_rules := r.rules || jsonb_build_object(
    'plannedHoles', coalesce((r.rules ->> 'plannedHoles')::int, r.hole_count)
  );
  -- 종료 뒤에 지우면 수정 내역에 남긴다
  if r.status = 'done' then
    who := coalesce(
      nullif(r.rules -> 'nameOverrides' ->> me::text, ''),
      nullif((select name from public.round_players where round_id = p_round_id and user_uid = me), ''),
      '방장'
    );
    next_rules := jsonb_set(
      next_rules,
      '{editLog}',
      coalesce(next_rules -> 'editLog', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'at', now(), 'by', who,
        'items', jsonb_build_array(format('%s %s번 홀 지움 (%s홀로)',
          case when hole_save then '저장 안 된' else '입력 안 된' end,
          case when p_keep + 1 = r.hole_count then r.hole_count::text
               else format('%s~%s', p_keep + 1, r.hole_count) end,
          p_keep))
      ))
    );
  end if;
  update public.rounds set hole_count = p_keep, rules = next_rules where id = p_round_id;
end $$;

revoke all on function public.trim_round_holes(uuid, int) from public, anon;
grant execute on function public.trim_round_holes(uuid, int) to authenticated;
