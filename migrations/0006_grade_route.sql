alter table children add column if not exists start_band text not null default 'beginning';
alter table children add column if not exists weekly_new_cap smallint not null default 5;
alter table children add column if not exists active_grade_route_id text;
alter table children add column if not exists plan_week_start date;
alter table children add column if not exists plan_cursor integer not null default 0;
alter table children add column if not exists plan_new_kanji text not null default '[]';

create table if not exists grade_routes (
  id text primary key,
  user_id text not null,
  child_id text not null,
  grade smallint not null,
  ordered_kanji text not null,
  start_index integer not null default 0,
  start_band text not null,
  created_at timestamptz not null default now()
);
create index if not exists grade_routes_child_idx on grade_routes (child_id);

create table if not exists inspections (
  user_id text not null,
  child_id text not null,
  kanji text not null,
  last_at timestamptz,
  count integer not null default 0,
  primary key (child_id, kanji)
);
