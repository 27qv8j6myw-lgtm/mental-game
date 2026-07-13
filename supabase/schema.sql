-- 멘탈게임 · Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null references auth.users (id) on delete cascade,
  config jsonb not null,
  holes jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_owner_created_idx
  on public.games (owner_uid, created_at desc);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- Row Level Security: 본인 소유 행만 접근
alter table public.games enable row level security;

drop policy if exists "own games select" on public.games;
create policy "own games select" on public.games
  for select using (auth.uid() = owner_uid);

drop policy if exists "own games insert" on public.games;
create policy "own games insert" on public.games
  for insert with check (auth.uid() = owner_uid);

drop policy if exists "own games update" on public.games;
create policy "own games update" on public.games
  for update using (auth.uid() = owner_uid) with check (auth.uid() = owner_uid);

drop policy if exists "own games delete" on public.games;
create policy "own games delete" on public.games
  for delete using (auth.uid() = owner_uid);
