-- FamBam Passport: shared attended events + per-player memories
create extension if not exists pgcrypto;

create table if not exists public.passport_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid null references public.games(id) on delete set null,
  created_by_player_id uuid not null references public.players(id) on delete cascade,
  sport text not null check (sport in ('Football','MLB')),
  event_date date not null,
  away_team text not null,
  home_team text not null,
  venue_name text not null,
  city text null,
  state_code text null check (state_code is null or state_code ~ '^[A-Z]{2}$'),
  away_score integer null,
  home_score integer null,
  result text null check (result is null or result in ('W','L','T')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.passport_event_attendees (
  event_id uuid not null references public.passport_events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, player_id)
);

create table if not exists public.passport_memories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.passport_events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, player_id)
);

create table if not exists public.visited_states (
  player_id uuid not null references public.players(id) on delete cascade,
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  first_visited_date date null,
  notes text null,
  created_at timestamptz not null default now(),
  primary key (player_id, state_code)
);

create index if not exists passport_events_event_date_idx on public.passport_events(event_date desc);
create index if not exists passport_attendees_player_idx on public.passport_event_attendees(player_id);
create index if not exists passport_memories_event_idx on public.passport_memories(event_id);

alter table public.passport_events enable row level security;
alter table public.passport_event_attendees enable row level security;
alter table public.passport_memories enable row level security;
alter table public.visited_states enable row level security;

-- FamBam accesses these through authenticated server API routes using the service key.
-- No public anon policies are intentionally created.
