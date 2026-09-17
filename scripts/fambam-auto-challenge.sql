alter table public.challenge_games
  add column if not exists selection_source text not null default 'manual',
  add column if not exists selection_reason text,
  add column if not exists selected_at timestamptz not null default now();

alter table public.challenge_games
  drop constraint if exists challenge_games_selection_source_check;

alter table public.challenge_games
  add constraint challenge_games_selection_source_check
  check (selection_source in ('manual', 'auto'));

create index if not exists challenge_games_selection_source_idx
  on public.challenge_games (challenge_id, selection_source);

grant select, insert, update, delete
  on public.challenge_games
  to service_role;
