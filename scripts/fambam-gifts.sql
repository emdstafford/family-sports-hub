-- FamBam Hub Gifts: private shopper-owned gift planning and stocking rotation
create extension if not exists pgcrypto;

create table if not exists public.gift_items (
  id uuid primary key default gen_random_uuid(),
  shopper_player_id uuid not null references public.players(id) on delete cascade,
  recipient_player_id uuid not null references public.players(id) on delete cascade,
  occasion text not null check (occasion in ('christmas','birthday','other')),
  occasion_year integer not null check (occasion_year between 2020 and 2100),
  title text not null,
  status text not null default 'idea' check (status in ('idea','to_buy','purchased','wrapped','given')),
  source text not null default 'shopper' check (source in ('shopper','wishlist')),
  price numeric(10,2) null check (price is null or price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  store text null,
  product_url text null,
  size text null,
  color text null,
  notes text null,
  hiding_spot text null,
  receipt_url text null,
  tracking_number text null,
  is_stocking boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_budgets (
  id uuid primary key default gen_random_uuid(),
  shopper_player_id uuid not null references public.players(id) on delete cascade,
  recipient_player_id uuid not null references public.players(id) on delete cascade,
  occasion text not null check (occasion in ('christmas','birthday','other')),
  occasion_year integer not null check (occasion_year between 2020 and 2100),
  budget numeric(10,2) not null default 0 check (budget >= 0),
  stocking_budget numeric(10,2) not null default 0 check (stocking_budget >= 0),
  updated_at timestamptz not null default now(),
  unique (shopper_player_id, recipient_player_id, occasion, occasion_year)
);

create table if not exists public.stocking_assignments (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2020 and 2100),
  shopper_player_id uuid not null references public.players(id) on delete cascade,
  recipient_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (year, shopper_player_id),
  unique (year, recipient_player_id)
);

create index if not exists gift_items_shopper_year_idx on public.gift_items(shopper_player_id, occasion_year desc);
create index if not exists gift_items_recipient_year_idx on public.gift_items(recipient_player_id, occasion_year desc);
create index if not exists stocking_assignments_year_idx on public.stocking_assignments(year);

alter table public.gift_items enable row level security;
alter table public.gift_budgets enable row level security;
alter table public.stocking_assignments enable row level security;

-- Access is intentionally through authenticated FamBam server API routes using
-- verify_player_session + the server service key. No anon table policies.


-- Flexible recipients and occasions (run once on databases created before this update)
alter table public.gift_items
  alter column recipient_player_id drop not null;

alter table public.gift_items
  add column if not exists recipient_name text null,
  add column if not exists occasion_name text null;

alter table public.gift_items
  drop constraint if exists gift_items_occasion_check;

alter table public.gift_items
  add constraint gift_items_occasion_check
  check (occasion in (
    'christmas','birthday','mothers_day','fathers_day','valentines_day',
    'graduation','teacher_gift','wedding','baby_shower','just_because','other'
  ));

alter table public.gift_items
  drop constraint if exists gift_items_recipient_required_check;

alter table public.gift_items
  add constraint gift_items_recipient_required_check
  check (
    recipient_player_id is not null
    or nullif(btrim(recipient_name), '') is not null
  );

alter table public.gift_budgets
  drop constraint if exists gift_budgets_occasion_check;

alter table public.gift_budgets
  add constraint gift_budgets_occasion_check
  check (occasion in (
    'christmas','birthday','mothers_day','fathers_day','valentines_day',
    'graduation','teacher_gift','wedding','baby_shower','just_because','other'
  ));
