alter table kanji_progress add column if not exists surfaces_seen_success text not null default '[]';
alter table kanji_progress add column if not exists last_success_by_kind text not null default '{}';
