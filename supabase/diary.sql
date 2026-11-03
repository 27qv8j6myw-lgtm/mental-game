-- ============ 라운드 일기 · 연습 메모 ============
-- 내 정보 → 라운드 일기 (src/diary.ts). 라운드를 친 날은 그 라운드의 일기, 라운드가 없던 날은 연습 메모.
-- 나만 읽고 쓴다. 탈퇴하면 auth.users 와 함께 지워진다.
-- Supabase 대시보드 > SQL Editor 에서 실행. 여러 번 실행해도 안전하다.

create table if not exists public.round_diary (
  user_uid uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 라운드 일기는 라운드 id, 연습 메모는 'practice:YYYY-MM-DD'
  entry_key text not null check (char_length(entry_key) <= 64),
  day date not null,
  -- 라운드 일기의 라운드 (라운드가 지워지면 비우고 일기는 그날 메모로 남긴다)
  round_id uuid references public.rounds (id) on delete set null,
  body text not null default '' check (char_length(body) <= 5000),
  -- 연습 메모: 연습한 것 (드라이버·아이언·퍼팅 …)
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  updated_at timestamptz not null default now(),
  primary key (user_uid, entry_key)
);

create index if not exists round_diary_day_idx on public.round_diary (user_uid, day);

alter table public.round_diary enable row level security;

drop policy if exists round_diary_select on public.round_diary;
create policy round_diary_select on public.round_diary
  for select using (user_uid = auth.uid());

drop policy if exists round_diary_insert on public.round_diary;
create policy round_diary_insert on public.round_diary
  for insert with check (user_uid = auth.uid());

drop policy if exists round_diary_update on public.round_diary;
create policy round_diary_update on public.round_diary
  for update using (user_uid = auth.uid()) with check (user_uid = auth.uid());

drop policy if exists round_diary_delete on public.round_diary;
create policy round_diary_delete on public.round_diary
  for delete using (user_uid = auth.uid());
