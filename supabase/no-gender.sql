-- ============ 성별 받지 않기 (2026-10-25, App Store 심사 피드백) ============
-- ============ 성별 받지 않기 (2026-10-25, App Store 심사 피드백) ============
-- ============ 성별 받지 않기 (2026-10-25, App Store 심사 피드백) ============
-- ============ 성별 받지 않기 (2026-10-25, App Store 심사 피드백) ============
-- ============ 성별 받지 않기 (2026-10-25, App Store 심사 피드백) ============
-- 앱은 성별을 묻지 않는다. 남/여 코스레이팅은 고른 티로 정한다 (레드 티면 여성 레이팅, src/kga.ts teeSex).
-- 예전에 받은 성별을 지우고, 앞으로도 남지 않게 한다:
--   계정(auth.users)의 mg_gender, 라운드 참가자(round_players)의 gender.
-- round_players.gender 칸은 예전 DB 함수(create_round · join_round · add_offline_player)가 기본값을 넣어서
-- 칸은 남겨 두고, 넣거나 고칠 때마다 비운다 (앱은 이 칸을 읽지 않는다).
-- Supabase 대시보드 > SQL Editor 에서 schema.sql · lobby.sql 다음에 실행. 여러 번 실행해도 안전하다.
-- 파일 전체를 붙여 넣고(일부만 선택하지 말고) 실행한다.

alter table public.round_players alter column gender drop not null;
alter table public.round_players alter column gender drop default;

-- 넣거나 고칠 때 성별은 늘 비운다
create or replace function public.round_players_no_gender()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.gender := null;
  return new;
end $$;
revoke all on function public.round_players_no_gender() from public, anon, authenticated;

drop trigger if exists round_players_no_gender on public.round_players;
create trigger round_players_no_gender
  before insert or update on public.round_players
  for each row execute function public.round_players_no_gender();

-- 예전에 받은 성별 지우기
update public.round_players set gender = null where gender is not null;
update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'mg_gender'
  where raw_user_meta_data ? 'mg_gender';
