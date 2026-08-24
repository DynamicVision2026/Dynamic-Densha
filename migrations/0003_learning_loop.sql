alter table kanji_progress add column if not exists lights_reading boolean not null default false;
alter table kanji_progress add column if not exists lights_meaning boolean not null default false;
alter table kanji_progress add column if not exists lights_shape boolean not null default false;
alter table kanji_progress add column if not exists encounter_completed boolean not null default false;
alter table kanji_progress add column if not exists understand_completed boolean not null default false;
alter table kanji_progress add column if not exists seen_at timestamptz;
alter table kanji_progress add column if not exists last_practice_at timestamptz;
alter table kanji_progress add column if not exists almost_at timestamptz;
alter table kanji_progress add column if not exists echo_due_at timestamptz;
alter table kanji_progress add column if not exists perfect_at timestamptz;
alter table kanji_progress add column if not exists wrong_count_by_kind text not null default '{}';
alter table kanji_progress add column if not exists correct_streak_by_kind text not null default '{}';
alter table kanji_progress add column if not exists consecutive_wrong_by_kind text not null default '{}';
alter table kanji_progress add column if not exists repair_required_kinds text not null default '';

alter table practice_events add column if not exists item_id text not null default '';
alter table practice_events add column if not exists is_echo boolean not null default false;
alter table practice_events add column if not exists session_id text not null default '';
