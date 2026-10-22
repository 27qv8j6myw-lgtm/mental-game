-- ============ 회원 탈퇴 ============
-- 앱 안에서 내 계정을 지운다 (앱스토어 심사 5.1.1: 계정을 만들 수 있으면 앱 안에서 지울 수도 있어야 한다).
-- 함께 친 라운드는 다른 사람의 정산·전적이 바뀌지 않게 남기고, 내 이름·사진·계좌만 지운다.
--  1) 내가 방장인 라운드: 함께 친 사람(폰 있는 참여자)이 있으면 그 사람에게 방장을 넘기고, 혼자(폰 없는 동반자와만) 친 라운드는 지운다
--     (rounds.host_uid 는 계정이 지워지면 라운드도 함께 지워지게 묶여 있어서, 계정을 지우기 전에 넘긴다)
--  2) 남는 라운드의 내 줄: 이름은 '탈퇴한 사용자'로, 사진·계좌·방장이 고친 내 이름은 지운다. 스코어는 그대로
--  3) 나만의 기록: 홀별 내 기록·AI 분석, 다른 사람이 나를 랭킹에서 뺀 표시, 게스트 표
--  4) 계정: 로그인 정보와 랭킹 설정·AI 허용·관리자 표시가 함께 지워진다
-- Supabase 대시보드 > SQL Editor 에서 실행. 여러 번 실행해도 안전하다. 파일 전체를 붙여 넣고 실행한다.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  rid uuid;
  heir uuid;
begin
  if me is null or not exists (select 1 from auth.users where id = me) then
    raise exception 'MEMBER_ONLY' using errcode = '42501';
  end if;
  -- 저장된 홀 보호를 이 거래 안에서만 연다 (혼자 친 라운드를 지울 때 함께 지워지는 스코어)
  perform set_config('app.hole_save', 'on', true);

  -- 1) 내가 방장인 라운드
  for rid in select id from public.rounds where host_uid = me loop
    select rp.user_uid into heir
      from public.round_players rp
      join auth.users u on u.id = rp.user_uid
      where rp.round_id = rid and rp.user_uid <> me and not coalesce(rp.offline_player, false)
      order by rp.seat_order, rp.joined_at
      limit 1;
    if heir is null then
      delete from public.rounds where id = rid;
    else
      update public.rounds set host_uid = heir where id = rid;
    end if;
  end loop;

  -- 2) 남는 라운드의 내 줄
  update public.round_players
    set name = '탈퇴한 사용자', photo_url = null, bank_name = null, bank_account = null
    where user_uid = me;
  update public.rounds
    set rules = rules #- array['nameOverrides', me::text]
    where rules -> 'nameOverrides' ? me::text;

  -- 3) 나만의 기록 (해당 SQL 을 실행한 DB 에만 있는 표는 있을 때만)
  if to_regclass('public.round_hole_stats') is not null then
    execute 'delete from public.round_hole_stats where player_uid = $1' using me;
  end if;
  if to_regclass('public.round_insights') is not null then
    execute 'delete from public.round_insights where player_uid = $1' using me;
  end if;
  if to_regclass('public.ranking_excludes') is not null then
    execute 'delete from public.ranking_excludes where excluded_uid = $1' using me;
  end if;
  if to_regclass('public.guest_claims') is not null then
    execute 'delete from public.guest_claims where guest_uid = $1' using me;
  end if;

  -- 4) 계정
  delete from auth.users where id = me;
  perform set_config('app.hole_save', 'off', true);
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
