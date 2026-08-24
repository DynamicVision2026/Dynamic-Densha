create table if not exists children (
  id text primary key,
  user_id text not null,
  name text not null,
  grade smallint not null,
  created_at timestamptz not null default now()
);
create index if not exists children_user_id_idx on children (user_id);

create table if not exists kanji_progress (
  id serial primary key,
  user_id text not null,
  child_id text not null,
  kanji text not null,
  status text not null default 'new',
  correct_streak integer not null default 0,
  attempts integer not null default 0,
  wrong_count integer not null default 0,
  completed_kinds text not null default '',
  updated_at timestamptz not null default now(),
  unique (child_id, kanji)
);
create index if not exists kanji_progress_child_idx on kanji_progress (child_id);

create table if not exists practice_events (
  id serial primary key,
  user_id text not null,
  child_id text not null,
  kanji text not null,
  kind text not null,
  correct boolean not null,
  prompt text not null default '',
  answer text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists practice_events_child_idx on practice_events (child_id, created_at desc);
