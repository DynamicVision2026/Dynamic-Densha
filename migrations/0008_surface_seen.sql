create table if not exists surface_seen (
  user_id text not null,
  child_id text not null,
  kanji text not null,
  surface_id text not null,
  first_success_at timestamptz not null default now(),
  primary key (child_id, surface_id)
);
create index if not exists surface_seen_child_kanji_idx
  on surface_seen (child_id, kanji);

alter table inspections add column if not exists due_at timestamptz;
alter table kanji_progress
  add column if not exists echo_success_count integer not null default 0;
