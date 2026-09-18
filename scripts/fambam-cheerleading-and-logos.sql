-- FamBam Sports: Cheerleading + team logo repair
-- Run once in Supabase SQL Editor.

insert into public.sports (slug, name, emoji, active)
values ('cheerleading', 'Cheerleading', '📣', true)
on conflict (slug) do update
set name = excluded.name,
    emoji = excluded.emoji,
    active = true;

-- Add a followable Kentucky Cheerleading team for Hazel.
insert into public.teams (sport_id, name, short_name, abbreviation, active)
select s.id, 'Kentucky Wildcats Cheerleading', 'Kentucky', 'UK', true
from public.sports s
where s.slug = 'cheerleading'
  and not exists (
    select 1
    from public.teams t
    where t.sport_id = s.id
      and lower(t.name) = 'kentucky wildcats cheerleading'
  );

-- Repair logos from authoritative provider IDs where we can derive them safely.
-- CollegeFootballData team logos use the school's CFBD numeric ID.
update public.teams
set logo_url = 'https://a.espncdn.com/i/teamlogos/ncaa/500/96.png'
where lower(name) in ('kentucky', 'kentucky wildcats football')
  and exists (
    select 1 from public.sports s
    where s.id = teams.sport_id and s.name = 'College Football'
  );

update public.teams
set logo_url = 'https://a.espncdn.com/i/teamlogos/ncaa/500/96.png'
where lower(name) in ('kentucky', 'kentucky wildcats men''s basketball', 'kentucky wildcats basketball')
  and exists (
    select 1 from public.sports s
    where s.id = teams.sport_id and s.name = 'College Basketball'
  );

update public.teams
set logo_url = 'https://a.espncdn.com/i/teamlogos/ncaa/500/96.png'
where lower(name) in ('kentucky', 'kentucky wildcats volleyball')
  and exists (
    select 1 from public.sports s
    where s.id = teams.sport_id and s.name = 'Volleyball'
  );

update public.teams
set logo_url = 'https://a.espncdn.com/i/teamlogos/ncaa/500/96.png'
where lower(name) = 'kentucky wildcats cheerleading'
  and exists (
    select 1 from public.sports s
    where s.id = teams.sport_id and s.name = 'Cheerleading'
  );

-- MLB logo URLs are stable by MLB team external ID.
update public.teams
set logo_url = 'https://www.mlbstatic.com/team-logos/' || external_id || '.svg'
where external_provider = 'mlb'
  and external_id is not null;
