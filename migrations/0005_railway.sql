alter table kanji_progress add column if not exists echo_success_count integer not null default 0;

create table if not exists child_stamps (
  user_id text not null,
  child_id text not null,
  kanji text not null,
  perfect_at timestamptz not null,
  line_ids text not null default '[]',
  created_at timestamptz not null default now(),
  primary key (child_id, kanji)
);
create index if not exists child_stamps_user_idx on child_stamps (user_id, child_id);
